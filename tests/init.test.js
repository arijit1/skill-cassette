const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { DEFAULT_CONFIG } = require('../src/config');
const { runInit } = require('../src/cli');

const repoRoot = path.resolve(__dirname, '..');
const binPath = path.join(repoRoot, 'bin', 'ctx.js');

function runCtx(args, cwd) {
  return spawnSync(process.execPath, [binPath, ...args], {
    cwd,
    encoding: 'utf8'
  });
}

async function withTempRepo(fn) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-cassette-init-'));

  try {
    return await fn(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

test('ctx init --keep-existing preserves the existing scaffold', () => {
  return withTempRepo((tempRoot) => {
    let result = runCtx(['init'], tempRoot);
    assert.equal(result.status, 0, result.stderr);

    const configPath = path.join(tempRoot, '.skill-cassette.json');
    fs.writeFileSync(configPath, `${JSON.stringify({ version: 1, mutated: true }, null, 2)}\n`);

    result = runCtx(['init', '--keep-existing'], tempRoot);
    assert.equal(result.status, 0, result.stderr);

    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(parsed.mutated, true);
    assert.match(result.stdout, /continued with existing skill-cassette scaffold/i);
  });
});

test('ctx init --refresh rewrites the scaffold files', () => {
  return withTempRepo((tempRoot) => {
    let result = runCtx(['init'], tempRoot);
    assert.equal(result.status, 0, result.stderr);

    const configPath = path.join(tempRoot, '.skill-cassette.json');
    fs.writeFileSync(configPath, `${JSON.stringify({ version: 1, mutated: true }, null, 2)}\n`);

    result = runCtx(['init', '--refresh'], tempRoot);
    assert.equal(result.status, 0, result.stderr);

    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.deepEqual(parsed, DEFAULT_CONFIG);
    assert.match(result.stdout, /refreshed skill-cassette scaffold/i);
    assert.match(result.stdout, /refreshed:/i);
  });
});

test('ctx init runs guided discovery and suggests the next handoff step', () => {
  return withTempRepo((tempRoot) => {
    const result = runCtx(['init'], tempRoot);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /health:/i);
    assert.match(result.stdout, /discovery:/i);
    assert.match(result.stdout, /next:/i);
    assert.match(result.stdout, /ctx handoff --backend codex --json/i);
    assert.match(result.stdout, /answer yes at the prompt to launch Codex automatically/i);
    assert.match(result.stdout, /saved handoff file/i);
    assert.ok(fs.existsSync(path.join(tempRoot, '.skill-cassette', 'agent-bridge.mjs')));
  });
});

test('ctx init can generate the handoff immediately when the user confirms', async () => {
  await withTempRepo(async (tempRoot) => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stdin.isTTY = true;
    stdout.isTTY = true;
    const calls = [];

    let stdoutText = '';
    let stderrText = '';
    stdout.on('data', (chunk) => {
      stdoutText += String(chunk);
    });
    stderr.on('data', (chunk) => {
      stderrText += String(chunk);
    });

    const runPromise = runInit({ cwd: tempRoot }, {
      stdin,
      stdout,
      stderr,
      runner: (program, args, options) => {
        calls.push({ program, args, options });
        return { status: 0 };
      }
    });

    process.nextTick(() => {
      stdin.write('y\n');
      stdin.end();
    });

    await runPromise;

    const handoffPath = path.join(tempRoot, '.skill-cassette', 'handoff.json');

    assert.ok(fs.existsSync(handoffPath), 'expected init to generate a saved handoff file');
    assert.match(stdoutText, /Generate and launch Codex now from the saved handoff\?/i);
    assert.match(stdoutText, /ctx handoff --backend codex --json/i);
    assert.match(stderrText, /Launching Codex from the saved handoff file/i);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].program, 'codex');
    assert.match(calls[0].args.join(' '), /exec --cd .* --full-auto -/i);
    assert.ok(String(calls[0].options.input || '').length > 0);
  });
});
