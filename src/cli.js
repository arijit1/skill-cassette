const fs = require('fs');
const path = require('path');
const { discoverRegistry } = require('./registry');
const { composeBundle, renderHumanBundle } = require('./composer');
const { findRepoRoot, getGitSnapshot, maybeResolveGitRepo } = require('./git');
const { loadConfig } = require('./config');
const { detectArtifactTypes, routeContext } = require('./router');
const { scaffoldRepo } = require('./scaffold');

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
        c: 'cwd'
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
    'ctx-router',
    '',
    'Usage:',
    '  ctx init [--cwd <dir>]',
    '  ctx scan [--cwd <dir>]',
    '  ctx doctor [--cwd <dir>]',
    '  ctx preflight [--task <text>] [--issue-file <file>] [--from-git] [--json] [--explain] [--cwd <dir>]',
    '  ctx explain [--task <text>] [--issue-file <file>] [--from-git] [--cwd <dir>]',
    '',
    'Options:',
    '  --json            Output machine-readable JSON',
    '  --task            Task text to route',
    '  --issue-file      Path to a text file with task context',
    '  --from-git        Read branch and changed files from git',
    '  --cwd             Base directory to run from',
    '  --explain         Show a longer decision trace',
    '  --max-skills      Override selected skills limit',
    '  --max-memory      Override selected memory limit',
    '',
    'Commands:',
    '  init      Create the local scaffold',
    '  scan      List skills and memory that are available',
    '  doctor    Validate the local setup',
    '  preflight Generate a context bundle for an agent',
    '  explain   Same as preflight, with a verbose human-readable trace'
  ].join('\n'));
  stdout.write('\n');
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

function jsonOutput(stdout, data) {
  stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function humanDoctor(stdout, checks) {
  stdout.write('ctx-router doctor\n');
  for (const check of checks) {
    stdout.write(`- ${check.ok ? 'ok' : 'warn'}: ${check.label}${check.detail ? ` - ${check.detail}` : ''}\n`);
  }
}

async function runInit(flags, stdout) {
  const workingDir = resolveWorkingDir(flags);
  const result = scaffoldRepo(workingDir, {
    includeGithubAction: flags.include_github_action !== false
  });

  stdout.write(`initialized ctx-router scaffold in ${workingDir}\n`);
  if (result.created.length) {
    stdout.write('created:\n');
    for (const filePath of result.created) {
      stdout.write(`- ${path.relative(workingDir, filePath)}\n`);
    }
  } else {
    stdout.write('nothing to create; scaffold already exists.\n');
  }
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

  stdout.write('ctx-router scan\n');
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
    detail: path.relative(repoRoot, config.config_path || '.ctx-router.json') || '.ctx-router.json'
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

async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  const { command, flags } = parseArgs(argv);

  if (command === 'help' || flags.help || flags.h) {
    printUsage(stdout);
    return;
  }

  if (command === 'init') {
    await runInit(flags, stdout);
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
  runPreflight,
  runScan,
  validateRegistry
};
