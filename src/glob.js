function normalizePath(input) {
  return String(input || '')
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+/g, '/');
}

function escapeRegexChar(char) {
  return /[\\^$+?.()|[\]{}]/.test(char) ? `\\${char}` : char;
}

function globToRegExp(pattern) {
  const normalized = normalizePath(pattern);
  let expression = '^';

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '*') {
      if (normalized[index + 1] === '*') {
        expression += '.*';
        index += 1;
      } else {
        expression += '[^/]*';
      }
      continue;
    }

    if (char === '?') {
      expression += '[^/]';
      continue;
    }

    expression += escapeRegexChar(char);
  }

  expression += '$';
  return new RegExp(expression);
}

function matchesGlob(filePath, pattern) {
  return globToRegExp(pattern).test(normalizePath(filePath));
}

function anyGlobMatch(filePath, patterns = []) {
  const normalized = normalizePath(filePath);
  return patterns.some((pattern) => matchesGlob(normalized, pattern));
}

module.exports = {
  anyGlobMatch,
  globToRegExp,
  matchesGlob,
  normalizePath
};
