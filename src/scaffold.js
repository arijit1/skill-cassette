const fs = require('fs');
const path = require('path');
const { DEFAULT_CONFIG } = require('./config');

const DOCS_SKILL_MANIFEST = {
  id: 'docs-style-guide',
  name: 'Docs Style Guide',
  version: '1.0.0',
  description: 'Repo-specific writing, structure, and example conventions.',
  scope: ['README.md', 'docs/**', '*.md'],
  triggers: [
    {
      file_glob: ['README.md', 'docs/**', '*.md'],
      task_types: ['docs_update', 'docs_review']
    }
  ],
  instructions_path: 'skills/docs-style-guide/instructions.md',
  tags: ['docs', 'markdown', 'examples', 'style']
};

const DOCS_SKILL_INSTRUCTIONS = `# Docs Style Guide

- Prefer short sections and concrete examples.
- Keep README examples aligned with the actual CLI output.
- Use fenced code blocks for commands and shell snippets.
- If a docs change affects behavior, call out the code path or config key that changed.
- Keep formatting consistent across README, docs, and release notes.
`;

const CODE_SKILL_MANIFEST = {
  id: 'code-preflight',
  name: 'Code Preflight',
  version: '1.0.0',
  description: 'Code review and preflight rules for safe agent changes.',
  scope: ['src/**', 'packages/**', 'bin/**', 'tests/**'],
  triggers: [
    {
      file_glob: ['src/**', 'packages/**', 'bin/**', 'tests/**'],
      task_types: ['code_change', 'refactor', 'review']
    }
  ],
  instructions_path: 'skills/code-preflight/instructions.md',
  tags: ['code', 'review', 'preflight', 'tests']
};

const CODE_SKILL_INSTRUCTIONS = `# Code Preflight

- Prioritize safety, tests, and backwards compatibility.
- Keep the diff focused on the requested task.
- Call out missing tests and edge cases.
- Prefer explicit behavior over clever abstractions.
- If the change touches public behavior, verify the README or docs are updated too.
`;

const DOCS_MEMORY = {
  id: 'docs-example-format',
  title: 'Docs Example Format',
  summary: 'Use fenced code blocks for CLI examples and keep docs snippets short.',
  scope: ['README.md', 'docs/**', 'examples/**'],
  tags: ['docs', 'examples', 'markdown'],
  source: 'human_correction',
  priority: 0.95
};

const CODE_MEMORY = {
  id: 'code-change-checklist',
  title: 'Code Change Checklist',
  summary: 'Update tests when behavior changes and keep source files small.',
  scope: ['src/**', 'tests/**', 'packages/**', 'bin/**'],
  tags: ['code', 'tests', 'review'],
  source: 'repo_history',
  priority: 0.85
};

const GITHUB_ACTION = `name: skill-cassette preflight

on:
  pull_request:
    paths:
      - '**/*.js'
      - '**/*.ts'
      - '**/*.tsx'
      - '**/*.md'
      - 'README.md'

jobs:
  preflight:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: npm test
      - run: node bin/ctx.js preflight --from-git --json
`;

const AGENT_BRIDGE_SCRIPT = `#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith('--')) {
      continue;
    }

    const [flagName, flagValue] = current.split('=');
    const normalized = flagName.replace(/^--/, '').replace(/-/g, '_');

    if (flagValue !== undefined) {
      flags[normalized] = flagValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('-')) {
      flags[normalized] = next;
      index += 1;
    } else {
      flags[normalized] = true;
    }
  }

  return flags;
}

function resolveCtxBin(flags) {
  const input = String(flags.ctx_bin || process.env.SKILL_CASSETTE_CTX_BIN || 'ctx');

  if (input === 'ctx') {
    return input;
  }

  if (path.isAbsolute(input)) {
    return input;
  }

  if (input.includes('/') || input.includes('\\\\')) {
    return path.resolve(flags.cwd || process.cwd(), input);
  }

  return input;
}

function runCommand(program, args, options = {}) {
  if (program.endsWith('.js') || program.endsWith('.mjs')) {
    return spawnSync(process.execPath, [program, ...args], options);
  }

  return spawnSync(program, args, options);
}

function buildCtxArgs(flags) {
  const args = ['handoff', '--json'];

  if (flags.backend) {
    args.push('--backend', String(flags.backend));
  }

  if (flags.model) {
    args.push('--model', String(flags.model));
  }

  if (flags.task) {
    args.push('--task', String(flags.task));
  }

  if (flags.issue_file) {
    args.push('--issue-file', String(flags.issue_file));
  }

  if (flags.from_git) {
    args.push('--from-git');
  }

  if (flags.cwd) {
    args.push('--cwd', String(flags.cwd));
  }

  return args;
}

function printUsage() {
  process.stdout.write([
    'agent-bridge.mjs',
    '',
    'Usage:',
    '  node examples/wrappers/agent-bridge.mjs [--backend ollama] [--model llama3] [--task <text>] [--issue-file <file>] [--from-git] [--cwd <dir>] [--ctx-bin <cmd>] [--dry-run]',
    '',
    'Notes:',
    '  - Install or link skill-cassette so the ctx command is available.',
    '  - Ollama executes directly when skill-cassette produces execution.command.',
    '  - Claude and Codex return messages for your SDK wrapper.'
  ].join('\n'));
  process.stdout.write('\n');
}

function printBridge(handoff) {
  process.stdout.write('backend: ' + handoff.backend.name + ' (' + handoff.backend.id + ')\n');
  process.stdout.write('execution mode: ' + handoff.execution.mode + '\n');
  process.stdout.write('launch hint: ' + handoff.execution.launch_hint + '\n');

  if (handoff.execution.command) {
    process.stdout.write('command: ' + handoff.execution.command.program + ' ' + handoff.execution.command.args.slice(0, 2).join(' ') + '\n');
    process.stdout.write('prompt body: execution.command.args[2]\n');
    return;
  }

  process.stdout.write(JSON.stringify({
    messages: handoff.execution.messages,
    prompt_text: handoff.execution.prompt_text
  }, null, 2));
  process.stdout.write('\n');
}

function executeOllama(handoff) {
  const command = handoff.execution.command;

  if (!command || !command.program) {
    process.stderr.write('Missing Ollama execution command. Set backend.model or backend.models.ollama in .skill-cassette.json.\n');
    process.exitCode = 1;
    return;
  }

  const result = runCommand(command.program, command.args || [], {
    stdio: 'inherit'
  });

  if (result.error) {
    process.stderr.write(String(result.error.message) + '\n');
    process.exitCode = 1;
    return;
  }

  if (typeof result.status === 'number') {
    process.exitCode = result.status;
  }
}

function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h) {
    printUsage();
    return;
  }

  const ctxBin = resolveCtxBin(flags);
  const ctxArgs = buildCtxArgs(flags);
  const result = runCommand(ctxBin, ctxArgs, {
    cwd: flags.cwd ? path.resolve(flags.cwd) : process.cwd(),
    encoding: 'utf8'
  });

  if (result.error) {
    process.stderr.write(String(result.error.message) + '\n');
    process.exitCode = 1;
    return;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    process.stderr.write(String(result.stderr || 'ctx handoff failed.\n'));
    process.exitCode = result.status;
    return;
  }

  let handoff;

  try {
    handoff = JSON.parse(result.stdout);
  } catch (error) {
    process.stderr.write('Unable to parse ctx handoff JSON: ' + error.message + '\n');
    process.exitCode = 1;
    return;
  }

  if (flags.dry_run || flags.print) {
    printBridge(handoff);
    return;
  }

  if (handoff.backend && handoff.backend.id === 'ollama' && handoff.execution && handoff.execution.command) {
    executeOllama(handoff);
    return;
  }

  printBridge(handoff);
}

main();
`;

function buildScaffoldEntries(options = {}) {
  const entries = [
    {
      relativePath: '.skill-cassette.json',
      contents: `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`
    },
    {
      relativePath: 'examples/skill-cassette.config.example.json',
      contents: `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`
    },
    {
      relativePath: 'examples/wrappers/agent-bridge.mjs',
      contents: `${AGENT_BRIDGE_SCRIPT}\n`
    },
    {
      relativePath: 'skills/docs-style-guide/skill.json',
      contents: `${JSON.stringify(DOCS_SKILL_MANIFEST, null, 2)}\n`
    },
    {
      relativePath: 'skills/docs-style-guide/instructions.md',
      contents: `${DOCS_SKILL_INSTRUCTIONS}\n`
    },
    {
      relativePath: 'skills/code-preflight/skill.json',
      contents: `${JSON.stringify(CODE_SKILL_MANIFEST, null, 2)}\n`
    },
    {
      relativePath: 'skills/code-preflight/instructions.md',
      contents: `${CODE_SKILL_INSTRUCTIONS}\n`
    },
    {
      relativePath: 'memory/docs-example-format.json',
      contents: `${JSON.stringify(DOCS_MEMORY, null, 2)}\n`
    },
    {
      relativePath: 'memory/code-change-checklist.json',
      contents: `${JSON.stringify(CODE_MEMORY, null, 2)}\n`
    }
  ];

  if (options.includeGithubAction !== false) {
    entries.push({
      relativePath: '.github/workflows/ctx-preflight.yml',
      contents: `${GITHUB_ACTION}\n`
    });
  }

  return entries;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeScaffoldEntry(repoRoot, entry, created, refreshed, overwriteExisting) {
  const filePath = path.join(repoRoot, entry.relativePath);
  const exists = fs.existsSync(filePath);

  if (exists && !overwriteExisting) {
    return false;
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, entry.contents);

  if (exists) {
    refreshed.push(filePath);
  } else {
    created.push(filePath);
  }

  return true;
}

function hasExistingScaffold(repoRoot, options = {}) {
  return buildScaffoldEntries(options).some((entry) => fs.existsSync(path.join(repoRoot, entry.relativePath)));
}

function scaffoldRepo(repoRoot, options = {}) {
  const created = [];
  const refreshed = [];
  const overwriteExisting = options.overwriteExisting === true;
  const entries = buildScaffoldEntries(options);

  ensureDir(repoRoot);
  for (const entry of entries) {
    writeScaffoldEntry(repoRoot, entry, created, refreshed, overwriteExisting);
  }

  return {
    created,
    refreshed,
    skipped: created.length === 0 && refreshed.length === 0
  };
}

module.exports = {
  CODE_MEMORY,
  CODE_SKILL_INSTRUCTIONS,
  CODE_SKILL_MANIFEST,
  DOCS_MEMORY,
  DOCS_SKILL_INSTRUCTIONS,
  DOCS_SKILL_MANIFEST,
  buildScaffoldEntries,
  GITHUB_ACTION,
  hasExistingScaffold,
  scaffoldRepo
};
