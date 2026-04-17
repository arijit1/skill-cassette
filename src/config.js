const fs = require('fs');
const path = require('path');

const CONFIG_FILENAMES = ['.skill-cassette.json', '.ctx-router.json'];

const DEFAULT_CONFIG = {
  version: 1,
  mode: 'recommend',
  read_only: true,
  paths: {
    skills: './skills',
    memory: './memory',
    docs: ['README.md', 'docs/**']
  },
  routing: {
    max_skills: 3,
    max_memory_cards: 5,
    confidence_threshold: 0.6,
    require_explain: true
  },
  signals: {
    use_git_diff: true,
    use_branch_name: true,
    use_changed_files: true,
    use_task_text: true
  },
  backend: {
    default: 'auto',
    preferred: ['ollama', 'claude', 'codex'],
    model: null,
    models: {}
  },
  artifact_detection: {
    code_extensions: ['.ts', '.tsx', '.js', '.go', '.py', '.cjs', '.mjs', '.jsx', '.rs', '.java'],
    docs_extensions: ['.md', '.markdown', '.rst'],
    pdf_extensions: ['.pdf']
  },
  policy: {
    allow_write_actions: false,
    auto_attach: false,
    recommend_only: true,
    redact_secrets: true
  },
  output: {
    format: 'human',
    include_trace: true,
    include_warnings: true
  }
};

function resolveConfigPath(repoRoot, explicitPath) {
  const candidates = [];

  if (explicitPath) {
    candidates.push(explicitPath);
  }

  for (const fileName of CONFIG_FILENAMES) {
    candidates.push(path.join(repoRoot, fileName));
  }

  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }

  const result = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      result[key] = mergeDeep(base[key], value);
      continue;
    }

    result[key] = value;
  }

  return result;
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function loadConfig(repoRoot, options = {}) {
  const configPath = resolveConfigPath(repoRoot, options.configPath);
  const configExists = fs.existsSync(configPath);

  if (!configExists) {
    return {
      ...DEFAULT_CONFIG,
      repo_root: repoRoot,
      config_exists: false,
      config_source: 'default',
      config_path: configPath
    };
  }

  const parsed = readJsonFile(configPath);
  return {
    ...mergeDeep(DEFAULT_CONFIG, parsed),
    repo_root: repoRoot,
    config_exists: true,
    config_source: 'file',
    config_path: configPath
  };
}

function writeConfig(repoRoot, config = DEFAULT_CONFIG) {
  const filePath = path.join(repoRoot, '.skill-cassette.json');
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
  return filePath;
}

module.exports = {
  CONFIG_FILENAMES,
  DEFAULT_CONFIG,
  loadConfig,
  mergeDeep,
  resolveConfigPath,
  writeConfig
};
