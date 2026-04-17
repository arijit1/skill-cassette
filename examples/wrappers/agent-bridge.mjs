#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import readline from 'node:readline';
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

  if (input.includes('/') || input.includes('\\')) {
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

function resolveBridgeDisplayName() {
  const scriptPath = process.argv[1] || 'agent-bridge.mjs';
  const relativePath = path.relative(process.cwd(), scriptPath).split(path.sep).join('/');

  if (!relativePath || relativePath === '.') {
    return 'agent-bridge.mjs';
  }

  if (relativePath.startsWith('..')) {
    return scriptPath;
  }

  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
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

function resolveHandoffFilePath(flags) {
  const input = String(flags.handoff_file || '.skill-cassette/handoff.json');

  if (path.isAbsolute(input)) {
    return input;
  }

  return path.resolve(flags.cwd || process.cwd(), input);
}

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function promptYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(String(answer || '').trim().toLowerCase().startsWith('y'));
    });
  });
}

function promptEnter(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, () => {
      rl.close();
      resolve();
    });
  });
}

function buildLaunchCommand(handoff, handoffFilePath) {
  if (handoff?.backend?.id === 'codex' || handoff?.backend?.id === 'claude') {
    return {
      program: handoff.backend.id,
      args: ['--handoff-file', handoffFilePath]
    };
  }

  if (handoff?.backend?.id === 'ollama' && handoff?.execution?.command?.program) {
    return handoff.execution.command;
  }

  if (handoff?.execution?.command?.program) {
    return handoff.execution.command;
  }

  return null;
}

function printUsage() {
  const displayName = resolveBridgeDisplayName();

  process.stdout.write([
    'agent-bridge.mjs',
    '',
    'Usage:',
    `  node ${displayName} [--handoff-file <file>] [--backend ollama] [--model llama3] [--task <text>] [--issue-file <file>] [--from-git] [--cwd <dir>] [--ctx-bin <cmd>] [--dry-run]`,
    '',
    'Notes:',
    '  - Install or link skill-cassette so the ctx command is available.',
    '  - Use --handoff-file to reuse an editable saved JSON context.',
    '  - Bridge helper is optional/internal sample code; use it only as a reference wrapper.',
    '  - Codex and Claude launch directly from the saved handoff file.',
    '  - Ollama executes directly when skill-cassette produces execution.command.'
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

async function maybePauseForEdit(handoffFilePath) {
  if (!isInteractive()) {
    return;
  }

  const shouldEdit = await promptYesNo('Edit the JSON before continuing? [y/N] ');

  if (!shouldEdit) {
    return;
  }

  process.stdout.write(`Edit this file now:\n  ${handoffFilePath}\n`);
  await promptEnter('Press Enter when you are ready to continue with Codex...');
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help || flags.h) {
    printUsage();
    return;
  }

  let handoff;
  let handoffFilePath = null;

  try {
    if (flags.handoff_file) {
      handoffFilePath = resolveHandoffFilePath(flags);
      handoff = JSON.parse(fs.readFileSync(handoffFilePath, 'utf8'));
    } else {
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

      handoff = JSON.parse(result.stdout);
    }
  } catch (error) {
    process.stderr.write('Unable to parse ctx handoff JSON: ' + error.message + '\n');
    process.exitCode = 1;
    return;
  }

  if (flags.dry_run || flags.print) {
    printBridge(handoff);
    return;
  }

  if (handoffFilePath) {
    await maybePauseForEdit(handoffFilePath);
  }

  const launchCommand = handoffFilePath ? buildLaunchCommand(handoff, handoffFilePath) : null;

  if (launchCommand?.program) {
    const result = runCommand(launchCommand.program, launchCommand.args || [], {
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

    return;
  }

  if (handoff.backend && handoff.backend.id === 'ollama' && handoff.execution && handoff.execution.command) {
    executeOllama(handoff);
    return;
  }

  printBridge(handoff);
}

main().catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
  process.exitCode = 1;
});
