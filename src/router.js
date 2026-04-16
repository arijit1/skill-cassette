const { matchesGlob } = require('./glob');

const DOC_HINTS = [
  'docs',
  'documentation',
  'readme',
  'markdown',
  'example',
  'examples',
  'guide',
  'usage',
  'tutorial'
];

const CODE_HINTS = [
  'code',
  'bug',
  'fix',
  'refactor',
  'feature',
  'implement',
  'test',
  'tests',
  'security',
  'api',
  'auth',
  'logic'
];

const REVIEW_HINTS = [
  'review',
  'audit',
  'inspect',
  'verify',
  'check'
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

function countHintHits(text, hints) {
  const tokens = tokenize(text);
  return hints.reduce((count, hint) => count + (tokens.includes(hint.toLowerCase()) ? 1 : 0), 0);
}

function buildCombinedText(taskContext) {
  return [
    taskContext.task_text,
    taskContext.branch,
    ...(taskContext.changed_files || []),
    ...(taskContext.artifact_types || [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function detectArtifactTypes(changedFiles = [], config) {
  const artifactTypes = new Set();
  const codeExtensions = config.artifact_detection?.code_extensions || [];
  const docsExtensions = config.artifact_detection?.docs_extensions || [];
  const pdfExtensions = config.artifact_detection?.pdf_extensions || [];

  for (const filePath of changedFiles) {
    const lower = String(filePath).toLowerCase();

    if (docsExtensions.some((extension) => lower.endsWith(extension))) {
      artifactTypes.add('markdown');
    }

    if (pdfExtensions.some((extension) => lower.endsWith(extension))) {
      artifactTypes.add('pdf');
    }

    if (codeExtensions.some((extension) => lower.endsWith(extension))) {
      artifactTypes.add('code');
    }
  }

  return Array.from(artifactTypes);
}

function countFilesByExtensions(changedFiles = [], extensions = []) {
  return changedFiles.reduce((count, filePath) => {
    const lower = String(filePath).toLowerCase();
    return count + (extensions.some((extension) => lower.endsWith(extension)) ? 1 : 0);
  }, 0);
}

function inferTaskType(taskContext) {
  const combinedText = buildCombinedText(taskContext);
  const changedFiles = taskContext.changed_files || [];
  const artifactTypes = taskContext.artifact_types || [];
  const docsFileCount = countFilesByExtensions(changedFiles, ['.md', '.markdown', '.rst', '.txt']);
  const codeFileCount = countFilesByExtensions(changedFiles, ['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.java']);
  const reviewHits = countHintHits(combinedText, REVIEW_HINTS);
  const docsHits = countHintHits(combinedText, DOC_HINTS);
  const codeHits = countHintHits(combinedText, CODE_HINTS);

  if (!taskContext.task_text && !taskContext.branch && changedFiles.length === 0) {
    return {
      task_type: 'unknown',
      confidence: 0.4,
      reasons: ['No task text, branch, or changed-file signals were provided.'],
      signals_used: ['task_text', 'branch', 'changed_files', 'artifact_types'],
      artifact_summary: {
        docs_files: 0,
        code_files: 0
      }
    };
  }

  const docsSignal = docsFileCount * 2 + docsHits;
  const codeSignal = codeFileCount * 2 + codeHits;

  let taskType = 'code_change';
  let confidence = 0.52;
  const reasons = [];

  if (reviewHits >= 1) {
    if (docsSignal >= codeSignal) {
      taskType = 'docs_review';
    } else {
      taskType = 'code_review';
    }

    confidence = 0.66 + Math.min(0.22, reviewHits * 0.05);
    reasons.push('Review language detected in task text or branch name.');
  } else if (docsSignal > codeSignal) {
    taskType = 'docs_update';
    confidence = 0.58 + Math.min(0.3, (docsSignal - codeSignal) * 0.08 + docsHits * 0.03);
    reasons.push('Docs file types and docs-oriented language dominate the signal.');
  } else if (docsSignal > 0 && codeSignal === 0) {
    taskType = 'docs_update';
    confidence = 0.62 + Math.min(0.2, docsSignal * 0.06);
    reasons.push('Only docs-oriented files were detected.');
  } else if (codeSignal > 0) {
    taskType = 'code_change';
    confidence = 0.58 + Math.min(0.25, codeSignal * 0.05);
    reasons.push('Code files were detected in the diff.');
  }

  if (docsHits > 0) {
    reasons.push('Docs-related keywords matched the task text.');
  }

  if (codeHits > 0) {
    reasons.push('Code-related keywords matched the task text.');
  }

  if (taskContext.task_text) {
    confidence += 0.05;
    reasons.push('Explicit task text was provided.');
  }

  if (taskContext.branch) {
    confidence += 0.03;
    reasons.push(`Branch name: ${taskContext.branch}.`);
  }

  return {
    task_type: taskType,
    confidence: clamp(Number(confidence.toFixed(2)), 0.5, 0.95),
    reasons,
    signals_used: ['task_text', 'branch', 'changed_files', 'artifact_types'],
    artifact_summary: {
      docs_files: docsFileCount,
      code_files: codeFileCount
    }
  };
}

function taskTypeMatchesSkill(taskType, skillTaskTypes = []) {
  const normalizedSkillTypes = skillTaskTypes.map((entry) => String(entry).toLowerCase());
  const aliases = new Set([String(taskType).toLowerCase()]);

  if (taskType === 'code_review' || taskType === 'docs_review') {
    aliases.add('review');
  }

  if (taskType === 'code_change') {
    aliases.add('refactor');
    aliases.add('bugfix');
    aliases.add('bug');
  }

  return normalizedSkillTypes.some((entry) => aliases.has(entry));
}

function scoreSkill(skill, taskContext, classification) {
  if (!skill || skill.valid === false) {
    return {
      id: skill?.id || skill?.filePath || 'unknown',
      score: 0,
      reasons: ['Invalid skill manifest.']
    };
  }

  const combinedText = buildCombinedText(taskContext);
  const reasons = [];
  let score = 0;

  if (taskTypeMatchesSkill(classification.task_type, skill.task_types)) {
    score += 0.45;
    reasons.push(`Matches task type ${classification.task_type}.`);
  }

  if (skill.file_globs?.length && anyGlobMatchByAny(taskContext.changed_files || [], skill.file_globs)) {
    score += 0.3;
    reasons.push('Changed files match the skill scope.');
  }

  if (skill.keywords?.length && skill.keywords.some((keyword) => combinedText.includes(String(keyword).toLowerCase()))) {
    score += 0.18;
    reasons.push('Skill keywords match the task text or branch.');
  }

  if (skill.scope?.length && skill.scope.some((scope) => combinedText.includes(String(scope).toLowerCase()))) {
    score += 0.07;
  }

  return {
    id: skill.id,
    name: skill.name,
    version: skill.version,
    filePath: skill.filePath,
    instructionsPath: skill.instructionsPath,
    instructions_path: skill.instructions_path,
    instructionsContent: skill.instructionsContent || '',
    score: clamp(Number(score.toFixed(2)), 0, 1),
    reasons
  };
}

function anyGlobMatchByAny(files, patterns) {
  return files.some((filePath) => patterns.some((pattern) => matchesGlob(filePath, pattern)));
}

function scoreMemory(card, taskContext, classification) {
  if (!card || card.valid === false) {
    return {
      id: card?.id || card?.filePath || 'unknown',
      score: 0,
      reasons: ['Invalid memory card.']
    };
  }

  const combinedText = buildCombinedText(taskContext);
  const reasons = [];
  let score = 0;

  if (card.scope?.length && anyGlobMatchByAny(taskContext.changed_files || [], card.scope)) {
    score += 0.45;
    reasons.push('Memory scope matches the changed files.');
  }

  if (card.tags?.length && card.tags.some((tag) => combinedText.includes(String(tag).toLowerCase()))) {
    score += 0.25;
    reasons.push('Memory tags match the task text or branch.');
  }

  if (classification.task_type.startsWith('docs') && card.tags?.includes('docs')) {
    score += 0.15;
    reasons.push('Docs task type aligns with the memory card.');
  }

  if (classification.task_type.startsWith('code') && card.tags?.includes('code')) {
    score += 0.15;
    reasons.push('Code task type aligns with the memory card.');
  }

  if (card.source === 'human_correction') {
    score += 0.1;
    reasons.push('Human correction memory is prioritized.');
  }

  return {
    id: card.id,
    title: card.title,
    summary: card.summary,
    filePath: card.filePath,
    source: card.source,
    confidence: card.confidence,
    score: clamp(Number(score.toFixed(2)), 0, 1),
    reasons
  };
}

function chooseTop(items, limit, threshold) {
  const sorted = [...items].sort((left, right) => right.score - left.score);
  const selected = sorted.filter((item) => item.score >= threshold).slice(0, limit);

  if (!selected.length && sorted[0] && sorted[0].score >= 0.35) {
    selected.push(sorted[0]);
  }

  return selected.slice(0, limit);
}

function routeContext(taskContext, registry, config) {
  const classification = inferTaskType(taskContext);
  const skillThreshold = config.routing?.confidence_threshold ?? 0.55;
  const maxSkills = config.routing?.max_skills ?? 2;
  const maxMemory = config.routing?.max_memory_cards ?? 3;

  const scoredSkills = (registry.skills || []).map((skill) => scoreSkill(skill, taskContext, classification));
  const scoredMemory = (registry.memory || []).map((card) => scoreMemory(card, taskContext, classification));

  const selectedSkills = chooseTop(scoredSkills, maxSkills, skillThreshold);
  const selectedMemory = chooseTop(scoredMemory, maxMemory, Math.max(0.45, skillThreshold - 0.1));

  const warnings = [];

  if (!selectedSkills.length) {
    warnings.push('No skill passed the confidence threshold.');
  }

  if (!selectedMemory.length) {
    warnings.push('No memory card passed the confidence threshold.');
  }

  const trace = {
    classification,
    scoredSkills: scoredSkills.sort((left, right) => right.score - left.score),
    scoredMemory: scoredMemory.sort((left, right) => right.score - left.score)
  };

  return {
    classification,
    selectedSkills,
    selectedMemory,
    warnings,
    trace
  };
}

module.exports = {
  buildCombinedText,
  clamp,
  chooseTop,
  countHintHits,
  detectArtifactTypes,
  inferTaskType,
  routeContext,
  taskTypeMatchesSkill,
  scoreMemory,
  scoreSkill,
  tokenize
};
