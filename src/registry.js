const fs = require('fs');
const path = require('path');

function isJsonFile(filePath) {
  return filePath.endsWith('.json');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function walkJsonFiles(rootDir, predicate = () => true, results = []) {
  if (!fs.existsSync(rootDir)) {
    return results;
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      walkJsonFiles(fullPath, predicate, results);
      continue;
    }

    if (entry.isFile() && isJsonFile(fullPath) && predicate(fullPath)) {
      results.push(fullPath);
    }
  }

  return results;
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [value];
}

function resolveRelative(baseFile, maybeRelativePath) {
  if (!maybeRelativePath) {
    return null;
  }

  if (path.isAbsolute(maybeRelativePath)) {
    return maybeRelativePath;
  }

  return path.resolve(path.dirname(baseFile), maybeRelativePath);
}

function normalizeSkillManifest(manifest, filePath) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return {
      valid: false,
      errors: ['Manifest must be a JSON object.'],
      filePath
    };
  }

  const triggers = normalizeArray(manifest.triggers).map((trigger) => ({
    file_glob: normalizeArray(trigger?.file_glob || trigger?.file_globs),
    task_types: normalizeArray(trigger?.task_types),
    keywords: normalizeArray(trigger?.keywords)
  }));
  const taskTypes = normalizeArray(manifest.task_types);
  const fileGlobs = normalizeArray(manifest.file_globs);
  const keywords = normalizeArray(manifest.keywords || manifest.tags);
  const instructionsPath = manifest.instructions || manifest.instructions_path || 'instructions.md';

  const resolvedFileGlobs = fileGlobs.length ? fileGlobs : triggers.flatMap((trigger) => trigger.file_glob);

  const normalized = {
    id: manifest.id,
    name: manifest.name || manifest.id,
    version: manifest.version || '0.0.0',
    description: manifest.description || '',
    task_types: taskTypes.length ? taskTypes : triggers.flatMap((trigger) => trigger.task_types),
    file_globs: resolvedFileGlobs.length ? resolvedFileGlobs : normalizeArray(manifest.scope),
    keywords,
    scope: normalizeArray(manifest.scope),
    tags: normalizeArray(manifest.tags),
    triggers,
    instructions: instructionsPath,
    instructions_path: instructionsPath,
    filePath
  };

  if (!normalized.id) {
    errors.push('Missing required field: id.');
  }

  if (!normalized.name) {
    errors.push('Missing required field: name.');
  }

  if (!normalized.task_types.length) {
    errors.push('Missing required field: task_types.');
  }

  if (!normalized.file_globs.length) {
    errors.push('Missing required field: file_globs.');
  }

  return {
    ...normalized,
    valid: errors.length === 0,
    errors
  };
}

function normalizeMemoryCard(card, filePath) {
  const errors = [];

  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    return {
      valid: false,
      errors: ['Memory card must be a JSON object.'],
      filePath
    };
  }

  const normalized = {
    id: card.id,
    title: card.title || card.id,
    summary: card.summary || '',
    scope: normalizeArray(card.scope),
    tags: normalizeArray(card.tags),
    source: card.source || 'repo_history',
    confidence: typeof card.confidence === 'number' ? card.confidence : typeof card.priority === 'number' ? card.priority : 0.5,
    priority: typeof card.priority === 'number' ? card.priority : typeof card.confidence === 'number' ? card.confidence : 0.5,
    filePath
  };

  if (!normalized.id) {
    errors.push('Missing required field: id.');
  }

  if (!normalized.summary) {
    errors.push('Missing required field: summary.');
  }

  return {
    ...normalized,
    valid: errors.length === 0,
    errors
  };
}

function loadSkillManifests(skillsRoot, repoRoot = path.dirname(skillsRoot)) {
  const manifestFiles = walkJsonFiles(skillsRoot, (filePath) => path.basename(filePath) === 'skill.json');

  return manifestFiles.map((filePath) => {
    try {
      const parsed = readJson(filePath);
      const manifest = normalizeSkillManifest(parsed, filePath);
      const instructionsReference = manifest.instructions_path || manifest.instructions;
      const repoRelativeInstructions = instructionsReference ? path.resolve(repoRoot, instructionsReference) : null;
      const manifestRelativeInstructions = resolveRelative(filePath, instructionsReference);
      const instructionsPath = repoRelativeInstructions && fs.existsSync(repoRelativeInstructions)
        ? repoRelativeInstructions
        : manifestRelativeInstructions;
      const instructionsContent = instructionsPath && fs.existsSync(instructionsPath)
        ? fs.readFileSync(instructionsPath, 'utf8')
        : '';

      return {
        ...manifest,
        instructionsPath,
        instructions_path: manifest.instructions_path || manifest.instructions,
        instructionsContent,
        relativePath: path.relative(skillsRoot, filePath) || path.basename(filePath)
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message],
        filePath,
        relativePath: path.relative(skillsRoot, filePath) || path.basename(filePath)
      };
    }
  });
}

function loadMemoryCards(memoryRoot) {
  const memoryFiles = walkJsonFiles(memoryRoot);
  const cards = [];

  for (const filePath of memoryFiles) {
    try {
      const parsed = readJson(filePath);
      const entries = Array.isArray(parsed) ? parsed : [parsed];

      for (const entry of entries) {
        cards.push({
          ...normalizeMemoryCard(entry, filePath),
          relativePath: path.relative(memoryRoot, filePath) || path.basename(filePath)
        });
      }
    } catch (error) {
      cards.push({
        valid: false,
        errors: [error.message],
        filePath,
        relativePath: path.relative(memoryRoot, filePath) || path.basename(filePath)
      });
    }
  }

  return cards;
}

function discoverRegistry(repoRoot, config) {
  const skillsRoot = path.resolve(repoRoot, config.paths?.skills || './skills');
  const memoryRoot = path.resolve(repoRoot, config.paths?.memory || './memory');

  const skills = loadSkillManifests(skillsRoot, repoRoot);
  const memory = loadMemoryCards(memoryRoot);

  return {
    skillsRoot,
    memoryRoot,
    skills,
    memory
  };
}

module.exports = {
  discoverRegistry,
  loadMemoryCards,
  loadSkillManifests,
  normalizeMemoryCard,
  normalizeSkillManifest,
  resolveRelative,
  walkJsonFiles
};
