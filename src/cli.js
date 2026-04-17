const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { discoverRegistry } = require('./registry');
const { composeBundle, renderHumanBundle } = require('./composer');
const { buildBackendEnvelope, renderBackendBundle, resolveBackendSelection } = require('./backends');
const { findRepoRoot, getGitSnapshot, maybeResolveGitRepo } = require('./git');
const { loadConfig } = require('./config');
const { detectArtifactTypes, routeContext } = require('./router');
const { hasExistingScaffold, scaffoldRepo } = require('./scaffold');

function parseArgs(argv) {
  const args = [...argv];
  const flags = {};
  const positionals = [];

  while (args.length) {
    const current = args.shift();

    if (current === '--') {
      positionals.push(...args);
      break;
    }

    if (current.startsWith('--')) {
      const [flagName, flagValue] = current.split('=');
      const normalized = flagName.replace(/^--/, '').replace(/-/g, '_');

      if (flagValue !== undefined) {
        flags[normalized] = flagValue;
        continue;
      }

      const next = args[0];
      if (next && !next.startsWith('-')) {
        flags[normalized] = args.shift();
      } else {
        flags[normalized] = true;
      }
      continue;
    }

    if (current.startsWith('-')) {
      const shortMap = {
        j: 'json',
        t: 'task',
        i: 'issue_file',
        c: 'cwd',
        b: 'backend',
        m: 'model',
        h: 'help'
      };
      const key = shortMap[current.slice(1)];
      if (key) {
        const next = args[0];
        if (next && !next.startsWith('-') && key !== 'json') {
          flags[key] = args.shift();
        } else {
          flags[key] = true;
        }
      }
      continue;
    }

    positionals.push(current);
  }

  return {
    command: positionals[0] || 'help',
    subcommand: positionals[1] || null,
    flags,
    positionals
  };
}

function printUsage(stdout) {
  stdout.write([
    'skill-cassette',
    '',
    'Usage:',
    '  ctx init [--cwd <dir>]',
    '  ctx scan [--cwd <dir>]',
    '  ctx doctor [--cwd <dir>]',
    '  ctx preflight [--task <text>] [--issue-file <file>] [--from-git] [--json] [--explain] [--cwd <dir>]',
    '  ctx handoff [--task <text>] [--issue-file <file>] [--from-git] [--backend <name>] [--model <name>] [--handoff-file <file>] [--json] [--cwd <dir>]',
    '  ctx explain [--task <text>] [--issue-file <file>] [--from-git] [--cwd <dir>]',
    '',
    'Options:',
    '  -h, --help        Show this help text',
    '  --json            Output machine-readable JSON',
    '  --task            Task text to route',
    '  --issue-file      Path to a text file with task context',
    '  --from-git        Read branch and changed files from git',
    '  --cwd             Base directory to run from',
    '  --backend         Backend adapter to target (ollama, claude, codex, generic)',
    '  --model           Optional model name for the chosen backend',
    '  --handoff-file    Write the generated handoff JSON to this path',
    '  --refresh, --overwrite  Overwrite an existing scaffold when running init',
    '  --keep-existing         Keep the existing scaffold when running init',
    '  --explain         Show a longer decision trace',
    '  --max-skills      Override selected skills limit',
    '  --max-memory      Override selected memory limit',
    '',
    'Commands:',
    '  init      Create the local scaffold',
    '  scan      List skills and memory that are available',
    '  doctor    Validate the local setup',
    '  preflight Generate a context bundle for an agent',
    '  handoff   Shape a preflight bundle for a specific backend',
    '  explain   Same as preflight, with a verbose human-readable trace'
  ].join('\n'));
  stdout.write('\n');
}

function createPrompt(stdin, stdout) {
  const input = stdin || process.stdin;
  const output = stdout || process.stdout;
  return readline.createInterface({
    input,
    output
  });
}

function normalizeInitChoice(answer) {
  const value = String(answer || '').trim().toLowerCase();

  if (value.startsWith('r')) {
    return 'refresh';
  }

  if (value.startsWith('c') || value.startsWith('k')) {
    return 'continue';
  }

  return 'continue';
}

function askInitChoice(stdin, stdout, workingDir) {
  return new Promise((resolve) => {
    const rl = createPrompt(stdin, stdout);
    const prompt = [
      `A scaffold already exists in ${workingDir}.`,
      'Choose: [r]efresh and recreate scaffold, [c]ontinue with existing',
      '> '
    ].join('\n');

    rl.question(prompt, (answer) => {
      rl.close();
      resolve(normalizeInitChoice(answer));
    });
  });
}

function resolveWorkingDir(flags) {
  return path.resolve(flags.cwd || process.cwd());
}

function readTaskText(flags, workingDir) {
  const snippets = [];

  if (flags.task) {
    snippets.push(String(flags.task).trim());
  }

  if (flags.issue_file) {
    const issueFile = path.resolve(workingDir, String(flags.issue_file));
    if (fs.existsSync(issueFile)) {
      snippets.push(fs.readFileSync(issueFile, 'utf8').trim());
    }
  }

  return snippets.filter(Boolean).join('\n\n');
}

function buildTaskContext(workingDir, config, flags) {
  const repoRoot = findRepoRoot(workingDir) || workingDir;
  const gitEnabled = Boolean(flags.from_git);
  const gitSnapshot = gitEnabled ? getGitSnapshot(repoRoot) : {
    repoRoot,
    branch: null,
    changedFiles: [],
    diffSummary: {
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      copied: 0,
      untracked: 0
    }
  };

  const taskText = readTaskText(flags, workingDir);
  const artifactTypes = detectArtifactTypes(gitSnapshot.changedFiles, config);
  const combinedText = [
    taskText,
    gitSnapshot.branch,
    ...(gitSnapshot.changedFiles || [])
  ]
    .filter(Boolean)
    .join(' ');

  return {
    repo_root: repoRoot,
    task_text: taskText,
    branch: gitSnapshot.branch,
    changed_files: gitSnapshot.changedFiles || [],
    diff_summary: gitSnapshot.diffSummary,
    artifact_types: artifactTypes,
    combined_text: combinedText
  };
}

function validateRegistry(registry) {
  const issues = [];

  for (const skill of registry.skills) {
    if (skill.valid === false) {
      issues.push(`Skill manifest invalid: ${skill.relativePath || skill.filePath}`);
    }
  }

  for (const card of registry.memory) {
    if (card.valid === false) {
      issues.push(`Memory card invalid: ${card.relativePath || card.filePath}`);
    }
  }

  return issues;
}

function buildPreflightState(flags) {
  const workingDir = resolveWorkingDir(flags);
  const repoRoot = findRepoRoot(workingDir) || workingDir;
  const config = loadConfig(repoRoot);
  const registry = discoverRegistry(repoRoot, config);
  const taskContext = buildTaskContext(workingDir, config, flags);
  const routed = routeContext(taskContext, registry, config);
  const bundle = composeBundle({
    repoRoot,
    taskContext,
    classification: routed.classification,
    selectedSkills: routed.selectedSkills,
    selectedMemory: routed.selectedMemory,
    warnings: routed.warnings,
    config,
    trace: routed.trace
  });

  return {
    workingDir,
    repoRoot,
    config,
    registry,
    taskContext,
    routed,
    bundle
  };
}

function resolveHandoffFilePath(repoRoot, flags = {}) {
  if (flags.handoff_file) {
    return path.isAbsolute(flags.handoff_file)
      ? flags.handoff_file
      : path.resolve(repoRoot, String(flags.handoff_file));
  }

  return path.join(repoRoot, '.skill-cassette', 'handoff.json');
}

function saveHandoffFile(filePath, handoff) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(handoff, null, 2)}\n`);
}

function buildBackendCommand(repoRoot, handoffFilePath, backendId = 'codex') {
  const relativeHandoffFile = path.relative(repoRoot, handoffFilePath) || handoffFilePath;
  const quotedHandoffFile = JSON.stringify(relativeHandoffFile);

  if (backendId === 'codex' || backendId === 'claude') {
    return `${backendId} --handoff-file ${quotedHandoffFile}`;
  }

  if (backendId === 'ollama') {
    return `node .skill-cassette/agent-bridge.mjs --handoff-file ${quotedHandoffFile}`;
  }

  return `${backendId} --handoff-file ${quotedHandoffFile}`;
}

function printHandoffNextStep(stream, repoRoot, handoffFilePath, backendId = 'codex') {
  const relativeHandoffFile = path.relative(repoRoot, handoffFilePath) || handoffFilePath;

  stream.write('Next step: run this backend command in your workspace:\n');
  stream.write(`backend command: ${buildBackendCommand(repoRoot, handoffFilePath, backendId)}\n`);
  stream.write(`saved handoff file: ${relativeHandoffFile}\n`);
  stream.write('bridge helper is optional/internal sample code; use it only if you want a reference wrapper in your own repo.\n');
}

function buildInitGuide({ repoRoot, handoffFilePath, doctorReport, scanReport, backendSelection }) {
  const backendId = backendSelection?.resolved || 'codex';
  const lines = [];

  lines.push('skill-cassette init');
  lines.push(`repo: ${repoRoot}`);
  lines.push('');
  lines.push('health:');
  for (const check of doctorReport.checks) {
    lines.push(`- ${check.ok ? 'ok' : 'warn'} ${check.label}${check.detail ? ` - ${check.detail}` : ''}`);
  }

  if (doctorReport.warnings?.length) {
    lines.push('warnings:');
    for (const warning of doctorReport.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  lines.push('');
  lines.push('discovery:');
  lines.push(`- skills: ${scanReport.skills.length}`);
  lines.push(`- memory: ${scanReport.memory.length}`);

  if (scanReport.issues?.length) {
    lines.push('discovery issues:');
    for (const issue of scanReport.issues) {
      lines.push(`- ${issue}`);
    }
  }

  lines.push('');
  lines.push('next:');
  lines.push(`1. ctx handoff --backend ${backendId} --json`);
  lines.push('2. edit .skill-cassette/handoff.json if you want to review it');
  lines.push(`3. backend command: ${buildBackendCommand(repoRoot, handoffFilePath, backendId)}`);
  lines.push('');
  lines.push(`saved handoff file: ${path.relative(repoRoot, handoffFilePath)}`);

  return `${lines.join('\n').trim()}\n`;
}

function jsonOutput(stdout, data) {
  stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function humanDoctor(stdout, checks) {
  stdout.write('skill-cassette doctor\n');
  for (const check of checks) {
    stdout.write(`- ${check.ok ? 'ok' : 'warn'}: ${check.label}${check.detail ? ` - ${check.detail}` : ''}\n`);
  }
}

async function runInit(flags, io = {}) {
  const stdout = io.stdout || process.stdout;
  const stdin = io.stdin || process.stdin;
  const workingDir = resolveWorkingDir(flags);
  const includeGithubAction = flags.include_github_action !== false;
  const scaffoldExists = hasExistingScaffold(workingDir, { includeGithubAction });
  const overwriteRequested = Boolean(flags.refresh || flags.overwrite || flags.force);
  const keepExistingRequested = Boolean(flags.keep_existing || flags.continue_existing || flags.keep || flags.continue);
  let overwriteExisting = overwriteRequested;

  if (!overwriteExisting && !keepExistingRequested && scaffoldExists) {
    if (stdin.isTTY && stdout.isTTY) {
      const choice = await askInitChoice(stdin, stdout, workingDir);
      overwriteExisting = choice === 'refresh';
    } else {
      stdout.write(`scaffold already exists in ${workingDir}; continuing with existing files. Use --refresh to overwrite.\n`);
    }
  }

  const result = scaffoldRepo(workingDir, {
    includeGithubAction,
    overwriteExisting
  });

  if (overwriteExisting) {
    stdout.write(`refreshed skill-cassette scaffold in ${workingDir}\n`);
  } else if (scaffoldExists) {
    stdout.write(`continued with existing skill-cassette scaffold in ${workingDir}\n`);
  } else {
    stdout.write(`initialized skill-cassette scaffold in ${workingDir}\n`);
  }

  if (result.created.length) {
    stdout.write('created:\n');
    for (const filePath of result.created) {
      stdout.write(`- ${path.relative(workingDir, filePath)}\n`);
    }
  }

  if (result.refreshed.length) {
    stdout.write('refreshed:\n');
    for (const filePath of result.refreshed) {
      stdout.write(`- ${path.relative(workingDir, filePath)}\n`);
    }
  }

  const doctorCapture = [];
  const scanCapture = [];
  const captureWriter = (target) => ({
    write(chunk) {
      target.push(String(chunk));
    }
  });

  await runDoctor({ ...flags, json: true }, captureWriter(doctorCapture));
  await runScan({ ...flags, json: true }, captureWriter(scanCapture));

  let doctorReport = { checks: [], warnings: [] };
  let scanReport = { skills: [], memory: [], issues: [] };

  try {
    doctorReport = JSON.parse(doctorCapture.join(''));
  } catch {
    // Keep the concise guide alive even if a downstream formatter changes.
  }

  try {
    scanReport = JSON.parse(scanCapture.join(''));
  } catch {
    // Keep the concise guide alive even if a downstream formatter changes.
  }

  const config = loadConfig(workingDir);
  const backendSelection = resolveBackendSelection('codex', config, {
    model: config.backend?.model
  });
  const handoffFilePath = resolveHandoffFilePath(workingDir, flags);

  stdout.write('\n');
  stdout.write(buildInitGuide({
    repoRoot: workingDir,
    handoffFilePath,
    doctorReport,
    scanReport,
    backendSelection
  }));
}

async function runScan(flags, stdout) {
  const workingDir = resolveWorkingDir(flags);
  const repoRoot = findRepoRoot(workingDir) || workingDir;
  const config = loadConfig(repoRoot);
  const registry = discoverRegistry(repoRoot, config);
  const issues = validateRegistry(registry);

  if (flags.json) {
    jsonOutput(stdout, {
      repo_root: repoRoot,
      skills: registry.skills,
      memory: registry.memory,
      issues
    });
    return;
  }

  stdout.write('skill-cassette scan\n');
  stdout.write(`repo: ${repoRoot}\n`);
  stdout.write('\nskills:\n');
  for (const skill of registry.skills) {
    stdout.write(`- ${skill.valid === false ? 'warn' : 'ok'} ${skill.id || skill.relativePath} (${skill.relativePath})\n`);
  }
  stdout.write('\nmemory:\n');
  for (const card of registry.memory) {
    stdout.write(`- ${card.valid === false ? 'warn' : 'ok'} ${card.id || card.relativePath} (${card.relativePath})\n`);
  }

  if (issues.length) {
    stdout.write('\nissues:\n');
    for (const issue of issues) {
      stdout.write(`- ${issue}\n`);
    }
  }
}

async function runDoctor(flags, stdout) {
  const workingDir = resolveWorkingDir(flags);
  const repoProbe = maybeResolveGitRepo(workingDir);
  const repoRoot = repoProbe.repoRoot || workingDir;
  const config = loadConfig(repoRoot);
  const registry = discoverRegistry(repoRoot, config);
  const checks = [];

  checks.push({
    label: 'node runtime',
    ok: true,
    detail: process.version
  });

  checks.push({
    label: 'repo root',
    ok: Boolean(repoProbe.repoRoot),
    detail: repoProbe.repoRoot || repoProbe.error
  });

  checks.push({
    label: 'config',
    ok: Boolean(config),
    detail: config.config_exists
      ? `file: ${path.relative(repoRoot, config.config_path || '.skill-cassette.json') || '.skill-cassette.json'}`
      : `default: ${path.relative(repoRoot, config.config_path || '.skill-cassette.json') || '.skill-cassette.json'}`
  });

  checks.push({
    label: 'skills discovered',
    ok: registry.skills.length > 0,
    detail: `${registry.skills.length} manifest(s)`
  });

  checks.push({
    label: 'memory discovered',
    ok: registry.memory.length > 0,
    detail: `${registry.memory.length} card(s)`
  });

  const invalidCount = validateRegistry(registry).length;
  checks.push({
    label: 'manifest validation',
    ok: invalidCount === 0,
    detail: invalidCount ? `${invalidCount} issue(s)` : 'all manifests valid'
  });

  if (flags.json) {
    jsonOutput(stdout, {
      repo_root: repoRoot,
      checks
    });
    return;
  }

  humanDoctor(stdout, checks);
}

async function runPreflight(flags, stdout) {
  const { bundle } = buildPreflightState(flags);

  if (flags.json) {
    jsonOutput(stdout, bundle);
    return;
  }

  stdout.write(renderHumanBundle({
    ...bundle,
    trace: flags.explain ? bundle.trace : {
      classification: bundle.trace.classification,
      truncated: true
    }
  }));
}

async function runExplain(flags, stdout) {
  return runPreflight({ ...flags, explain: true }, stdout);
}

async function runHandoff(flags, stdout) {
  const state = buildPreflightState(flags);
  const selection = resolveBackendSelection(flags.backend, state.config, {
    model: flags.model
  });
  const handoff = buildBackendEnvelope(state.bundle, selection, state.config);
  const handoffFilePath = resolveHandoffFilePath(state.repoRoot, flags);
  const handoffForDisk = {
    ...handoff,
    handoff_file: path.relative(state.repoRoot, handoffFilePath) || path.basename(handoffFilePath),
    execution: {
      ...handoff.execution,
      saved_handoff_file: path.relative(state.repoRoot, handoffFilePath) || path.basename(handoffFilePath)
    }
  };

  saveHandoffFile(handoffFilePath, handoffForDisk);

  if (flags.json) {
    jsonOutput(stdout, handoffForDisk);
    printHandoffNextStep(process.stderr, state.repoRoot, handoffFilePath, selection.resolved);
    return;
  }

  stdout.write(renderBackendBundle(handoffForDisk));
  stdout.write(`\nsaved handoff file: ${path.relative(state.repoRoot, handoffFilePath)}\n`);
  stdout.write(`backend command: ${buildBackendCommand(state.repoRoot, handoffFilePath, selection.resolved)}\n`);
  stdout.write('bridge helper is optional/internal sample code; use it only if you want a reference wrapper in your own repo.\n');
}

async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const stdin = io.stdin || process.stdin;
  const { command, flags } = parseArgs(argv);

  if (command === 'help' || flags.help || flags.h) {
    printUsage(stdout);
    return;
  }

  if (command === 'init') {
    await runInit(flags, { stdout, stdin });
    return;
  }

  if (command === 'scan') {
    await runScan(flags, stdout);
    return;
  }

  if (command === 'doctor') {
    await runDoctor(flags, stdout);
    return;
  }

  if (command === 'preflight') {
    await runPreflight(flags, stdout);
    return;
  }

  if (command === 'handoff') {
    await runHandoff(flags, stdout);
    return;
  }

  if (command === 'explain') {
    await runExplain(flags, stdout);
    return;
  }

  stderr.write(`Unknown command: ${command}\n\n`);
  printUsage(stdout);
  process.exitCode = 1;
}

module.exports = {
  buildTaskContext,
  main,
  parseArgs,
  printUsage,
  readTaskText,
  resolveWorkingDir,
  runDoctor,
  runExplain,
  runInit,
  runHandoff,
  runPreflight,
  runScan,
  validateRegistry
};
