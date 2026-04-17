const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { DEFAULT_CONFIG } = require('../src/config');

const repoRoot = path.resolve(__dirname, '..');
const binPath = path.join(repoRoot, 'bin', 'ctx.js');

function runCtx(args, cwd) {
  return spawnSync(process.execPath, [binPath, ...args], {
    cwd,
    encoding: 'utf8'
  });
}

function withTempRepo(fn) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-cassette-init-'));

  try {
    return fn(tempRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

test('ctx init --keep-existing preserves the existing scaffold', () => {
  withTempRepo((tempRoot) => {
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
  withTempRepo((tempRoot) => {
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
  withTempRepo((tempRoot) => {
    const result = runCtx(['init'], tempRoot);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /health:/i);
    assert.match(result.stdout, /discovery:/i);
    assert.match(result.stdout, /next:/i);
    assert.match(result.stdout, /ctx handoff --backend codex --json/i);
    assert.match(result.stdout, /agent-bridge\.mjs --backend codex --handoff-file/i);
    assert.match(result.stdout, /saved handoff file/i);
  });
});
