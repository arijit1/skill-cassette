const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { DEFAULT_CONFIG, loadConfig } = require('../src/config');

test('loadConfig falls back cleanly when no config file exists', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-cassette-config-'));
  const config = loadConfig(repoRoot);

  assert.equal(config.repo_root, repoRoot);
  assert.equal(config.config_exists, false);
  assert.equal(config.config_source, 'default');
  assert.equal(config.config_path, path.join(repoRoot, '.skill-cassette.json'));
  assert.equal(config.backend.default, DEFAULT_CONFIG.backend.default);
});

test('loadConfig reads the canonical config file when present', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-cassette-config-'));
  const configPath = path.join(repoRoot, '.skill-cassette.json');

  fs.writeFileSync(configPath, `${JSON.stringify({
    version: 1,
    backend: {
      default: 'claude'
    }
  }, null, 2)}\n`);

  const config = loadConfig(repoRoot);

  assert.equal(config.repo_root, repoRoot);
  assert.equal(config.config_exists, true);
  assert.equal(config.config_source, 'file');
  assert.equal(config.config_path, configPath);
  assert.equal(config.backend.default, 'claude');
  assert.equal(config.mode, DEFAULT_CONFIG.mode);
});
