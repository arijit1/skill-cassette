const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');

function readText(relPath) {
  const absPath = path.join(repoRoot, relPath);
  assert.ok(fs.existsSync(absPath), `${relPath} should exist`);
  return fs.readFileSync(absPath, 'utf8');
}

function readJson(relPath) {
  return JSON.parse(readText(relPath));
}

function assertJsonFile(relPath, validator) {
  const value = readJson(relPath);
  validator(value);
}

test('example skill manifests are valid and match the router contract', () => {
  assertJsonFile('skills/docs-style-guide/skill.json', (skill) => {
    assert.equal(skill.id, 'docs-style-guide');
    assert.equal(skill.name, 'Docs Style Guide');
    assert.ok(Array.isArray(skill.scope) && skill.scope.length > 0);
    assert.ok(Array.isArray(skill.triggers) && skill.triggers.length > 0);
    assert.equal(skill.instructions_path, 'skills/docs-style-guide/instructions.md');
    assert.ok(Array.isArray(skill.tags) && skill.tags.includes('docs'));
  });

  assertJsonFile('skills/code-preflight/skill.json', (skill) => {
    assert.equal(skill.id, 'code-preflight');
    assert.equal(skill.name, 'Code Preflight');
    assert.ok(Array.isArray(skill.scope) && skill.scope.length > 0);
    assert.ok(Array.isArray(skill.triggers) && skill.triggers.length > 0);
    assert.equal(skill.instructions_path, 'skills/code-preflight/instructions.md');
    assert.ok(Array.isArray(skill.tags) && skill.tags.includes('code'));
  });
});

test('example memory cards are valid and match the router contract', () => {
  assertJsonFile('memory/repo-writing-conventions.json', (memory) => {
    assert.equal(memory.id, 'repo-writing-conventions');
    assert.equal(memory.title, 'Repo Writing Conventions');
    assert.ok(Array.isArray(memory.scope) && memory.scope.length > 0);
    assert.ok(Array.isArray(memory.tags) && memory.tags.includes('docs'));
    assert.equal(memory.source, 'human_correction');
    assert.ok(memory.priority > 0 && memory.priority <= 1);
  });

  assertJsonFile('memory/repo-code-conventions.json', (memory) => {
    assert.equal(memory.id, 'repo-code-conventions');
    assert.equal(memory.title, 'Repo Code Conventions');
    assert.ok(Array.isArray(memory.scope) && memory.scope.length > 0);
    assert.ok(Array.isArray(memory.tags) && memory.tags.includes('code'));
    assert.equal(memory.source, 'human_correction');
    assert.ok(memory.priority > 0 && memory.priority <= 1);
  });
});

test('instruction files are present and non-empty', () => {
  const docsInstructions = readText('skills/docs-style-guide/instructions.md');
  const codeInstructions = readText('skills/code-preflight/instructions.md');

  assert.ok(docsInstructions.length > 50);
  assert.ok(codeInstructions.length > 50);
  assert.match(docsInstructions, /examples/i);
  assert.match(codeInstructions, /tests/i);
});

test('demo config matches the planned v0 contract', () => {
  const config = readJson('examples/ctx-router.config.example.json');

  assert.equal(config.version, 1);
  assert.equal(config.mode, 'recommend');
  assert.equal(config.read_only, true);
  assert.equal(config.paths.skills, './skills');
  assert.equal(config.paths.memory, './memory');
  assert.ok(Array.isArray(config.paths.docs));
  assert.equal(config.routing.max_skills, 3);
  assert.equal(config.routing.max_memory_cards, 5);
  assert.equal(config.routing.confidence_threshold, 0.6);
  assert.equal(config.policy.allow_write_actions, false);
  assert.equal(config.policy.auto_attach, false);
  assert.equal(config.policy.recommend_only, true);
});
