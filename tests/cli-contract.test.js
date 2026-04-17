const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const binPath = path.join(repoRoot, 'bin', 'ctx.js');
const canRunCli = fs.existsSync(binPath);

function cliTest(name, fn) {
  if (canRunCli) {
    return test(name, fn);
  }

  return test(name, { skip: 'ctx runtime has not landed yet' }, fn);
}

function runCtx(args) {
  return spawnSync(process.execPath, [binPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8'
  });
}

cliTest('ctx --help exposes the release v0 command set', () => {
  const result = runCtx(['--help']);

  assert.equal(result.status, 0, result.stderr);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /\binit\b/);
  assert.match(output, /\bscan\b/);
  assert.match(output, /\bdoctor\b/);
  assert.match(output, /\bpreflight\b/);
  assert.match(output, /\bhandoff\b/);
  assert.match(output, /\bexplain\b/);
  assert.match(output, /refresh/);
  assert.match(output, /keep-existing/);
});

cliTest('ctx -h exposes the same help output', () => {
  const result = runCtx(['-h']);

  assert.equal(result.status, 0, result.stderr);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /\bpreflight\b/);
  assert.match(output, /\bhandoff\b/);
});

cliTest('ctx preflight --json returns a machine-readable bundle', () => {
  const result = runCtx(['preflight', '--task', 'Update README examples', '--json']);

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);

  assert.equal(typeof payload.task_type, 'string');
  assert.equal(typeof payload.confidence, 'number');
  assert.ok(Array.isArray(payload.recommended_skills));
  assert.ok(Array.isArray(payload.recommended_memory));
  assert.equal(payload.mode, 'recommend');
});

cliTest('ctx handoff --json returns a backend-specific envelope', () => {
  const result = runCtx(['handoff', '--task', 'Update README examples', '--backend', 'claude', '--json']);

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.backend.id, 'claude');
  assert.equal(payload.backend.transport, 'messages');
  assert.ok(typeof payload.execution.prompt_text === 'string');
  assert.ok(Array.isArray(payload.execution.messages));
  assert.equal(payload.execution.messages[0].role, 'system');
});
