const { spawnSync } = require('child_process');
const path = require('path');

function runGit(args, cwd) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8'
  });

  return {
    ok: result.status === 0,
    code: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function findRepoRoot(startDir = process.cwd()) {
  const result = runGit(['rev-parse', '--show-toplevel'], startDir);
  if (!result.ok) {
    return null;
  }

  return result.stdout.trim() || null;
}

function getBranchName(repoRoot) {
  const current = runGit(['branch', '--show-current'], repoRoot);
  if (current.ok) {
    const branch = current.stdout.trim();
    if (branch) {
      return branch;
    }
  }

  const shortSha = runGit(['rev-parse', '--short', 'HEAD'], repoRoot);
  if (shortSha.ok) {
    const sha = shortSha.stdout.trim();
    return sha ? `detached@${sha}` : 'detached';
  }

  return null;
}

function parseStatusLine(line) {
  const status = line.slice(0, 2);
  const remainder = line.slice(3);
  const fields = remainder.split(' -> ');
  const filePath = fields[fields.length - 1];

  return {
    status,
    filePath: filePath || remainder
  };
}

function getWorkingTreeSnapshot(repoRoot) {
  const result = runGit(['status', '--porcelain=1'], repoRoot);
  if (!result.ok) {
    return {
      changedFiles: [],
      diffSummary: {
        added: 0,
        modified: 0,
        deleted: 0,
        renamed: 0,
        copied: 0,
        untracked: 0
      },
      raw: ''
    };
  }

  const summary = {
    added: 0,
    modified: 0,
    deleted: 0,
    renamed: 0,
    copied: 0,
    untracked: 0
  };
  const changedFiles = [];

  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const { status, filePath } = parseStatusLine(line);
    changedFiles.push(filePath);

    if (status === '??') {
      summary.untracked += 1;
      summary.added += 1;
      continue;
    }

    if (status.includes('A')) {
      summary.added += 1;
    }

    if (status.includes('M')) {
      summary.modified += 1;
    }

    if (status.includes('D')) {
      summary.deleted += 1;
    }

    if (status.startsWith('R')) {
      summary.renamed += 1;
    }

    if (status.startsWith('C')) {
      summary.copied += 1;
    }
  }

  return {
    changedFiles: Array.from(new Set(changedFiles)),
    diffSummary: summary,
    raw: result.stdout
  };
}

function getGitSnapshot(repoRoot) {
  return {
    repoRoot,
    branch: getBranchName(repoRoot),
    ...getWorkingTreeSnapshot(repoRoot)
  };
}

function maybeResolveGitRepo(startDir = process.cwd()) {
  const repoRoot = findRepoRoot(startDir);
  if (!repoRoot) {
    return {
      repoRoot: null,
      error: 'Not inside a git repository.'
    };
  }

  return {
    repoRoot,
    error: null
  };
}

module.exports = {
  findRepoRoot,
  getBranchName,
  getGitSnapshot,
  getWorkingTreeSnapshot,
  maybeResolveGitRepo,
  runGit
};
