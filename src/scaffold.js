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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeIfMissing(filePath, contents, created) {
  if (fs.existsSync(filePath)) {
    return false;
  }

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents);
  created.push(filePath);
  return true;
}

function scaffoldRepo(repoRoot, options = {}) {
  const created = [];

  ensureDir(repoRoot);
  ensureDir(path.join(repoRoot, 'examples'));
  ensureDir(path.join(repoRoot, 'skills', 'docs-style-guide'));
  ensureDir(path.join(repoRoot, 'skills', 'code-preflight'));
  ensureDir(path.join(repoRoot, 'memory'));
  ensureDir(path.join(repoRoot, '.github', 'workflows'));

  writeIfMissing(path.join(repoRoot, '.skill-cassette.json'), `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, created);
  writeIfMissing(path.join(repoRoot, 'examples', 'skill-cassette.config.example.json'), `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, created);
  writeIfMissing(path.join(repoRoot, 'skills', 'docs-style-guide', 'skill.json'), `${JSON.stringify(DOCS_SKILL_MANIFEST, null, 2)}\n`, created);
  writeIfMissing(path.join(repoRoot, 'skills', 'docs-style-guide', 'instructions.md'), `${DOCS_SKILL_INSTRUCTIONS}\n`, created);
  writeIfMissing(path.join(repoRoot, 'skills', 'code-preflight', 'skill.json'), `${JSON.stringify(CODE_SKILL_MANIFEST, null, 2)}\n`, created);
  writeIfMissing(path.join(repoRoot, 'skills', 'code-preflight', 'instructions.md'), `${CODE_SKILL_INSTRUCTIONS}\n`, created);
  writeIfMissing(path.join(repoRoot, 'memory', 'docs-example-format.json'), `${JSON.stringify(DOCS_MEMORY, null, 2)}\n`, created);
  writeIfMissing(path.join(repoRoot, 'memory', 'code-change-checklist.json'), `${JSON.stringify(CODE_MEMORY, null, 2)}\n`, created);

  if (options.includeGithubAction !== false) {
    writeIfMissing(path.join(repoRoot, '.github', 'workflows', 'ctx-preflight.yml'), `${GITHUB_ACTION}\n`, created);
  }

  return {
    created,
    skipped: created.length === 0
  };
}

module.exports = {
  CODE_MEMORY,
  CODE_SKILL_INSTRUCTIONS,
  CODE_SKILL_MANIFEST,
  DOCS_MEMORY,
  DOCS_SKILL_INSTRUCTIONS,
  DOCS_SKILL_MANIFEST,
  GITHUB_ACTION,
  scaffoldRepo
};
