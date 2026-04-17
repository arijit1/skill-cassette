function summarizeFileList(files = [], maxItems = 6) {
  if (!files.length) {
    return 'none';
  }

  const visible = files.slice(0, maxItems);
  const extra = files.length - visible.length;
  return extra > 0 ? `${visible.join(', ')} (+${extra} more)` : visible.join(', ');
}

function previewText(text, maxLines = 12) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .filter((line, index, array) => index < array.length && (line.trim() || index < 3));

  if (!lines.length) {
    return '';
  }

  const visible = lines.slice(0, maxLines);
  return visible.join('\n');
}

function buildSkillBlock(skill) {
  const header = [
    `# Skill: ${skill.name || skill.id}`,
    `id: ${skill.id}`,
    `version: ${skill.version || '0.0.0'}`,
    `reason: ${skill.reasons?.[0] || 'matched by routing'}`,
    '',
    skill.instructionsContent || ''
  ].join('\n');

  return {
    type: 'skill',
    id: skill.id,
    title: skill.name || skill.id,
    content: header,
    preview: previewText(header)
  };
}

function buildMemoryBlock(card) {
  const header = [
    `# Memory: ${card.title || card.id}`,
    `id: ${card.id}`,
    `source: ${card.source || 'repo_history'}`,
    `summary: ${card.summary}`,
    `reason: ${card.reasons?.[0] || 'matched by routing'}`
  ].join('\n');

  return {
    type: 'memory',
    id: card.id,
    title: card.title || card.id,
    content: header,
    preview: previewText(header)
  };
}

function composeBundle({ repoRoot, taskContext, classification, selectedSkills, selectedMemory, warnings = [], config, trace }) {
  const skillBlocks = selectedSkills.map(buildSkillBlock);
  const memoryBlocks = selectedMemory.map(buildMemoryBlock);
  const contextBlocks = [
    {
      type: 'system',
      title: 'Skill Cassette Guardrails',
      content: [
        'Read-only preflight.',
        'Recommend-only mode.',
        'Do not edit repository files.',
        'Let the agent use the selected skills and memory before acting.'
      ].join('\n')
    },
    {
      type: 'task',
      title: 'Task Summary',
      content: [
        `Task type: ${classification.task_type}`,
        `Confidence: ${classification.confidence}`,
        `Changed files: ${summarizeFileList(taskContext.changed_files)}`,
        `Artifact types: ${(taskContext.artifact_types || []).join(', ') || 'unknown'}`
      ].join('\n')
    },
    ...skillBlocks,
    ...memoryBlocks
  ];

  const contextText = contextBlocks.map((block) => block.content).join('\n\n');

  return {
    repo_root: repoRoot,
    mode: config.mode || 'recommend',
    read_only: Boolean(config.read_only),
    task_context: taskContext,
    task_type: classification.task_type,
    confidence: classification.confidence,
    selected_skills: selectedSkills,
    selected_memory: selectedMemory,
    recommended_skills: selectedSkills,
    recommended_memory: selectedMemory,
    warnings,
    trace,
    context_blocks: contextBlocks,
    context_text: contextText,
    meta: {
      changed_files_preview: summarizeFileList(taskContext.changed_files),
      artifact_types: taskContext.artifact_types || []
    }
  };
}

function renderHumanBundle(bundle) {
  const lines = [];

  lines.push('skill-cassette preflight');
  lines.push(`task: ${bundle.task_type} (${bundle.confidence})`);
  lines.push(`mode: ${bundle.mode}`);
  lines.push(`changed files: ${bundle.meta.changed_files_preview}`);
  lines.push(`artifact types: ${(bundle.meta.artifact_types || []).join(', ') || 'unknown'}`);
  lines.push('');
  lines.push('selected skills:');

  if (bundle.selected_skills.length) {
    for (const skill of bundle.selected_skills) {
      lines.push(`- ${skill.id} (${skill.score})`);
      if (skill.reasons?.length) {
        for (const reason of skill.reasons.slice(0, 2)) {
          lines.push(`  - ${reason}`);
        }
      }
    }
  } else {
    lines.push('- none');
  }

  lines.push('');
  lines.push('selected memory:');

  if (bundle.selected_memory.length) {
    for (const card of bundle.selected_memory) {
      lines.push(`- ${card.id} (${card.score})`);
      if (card.reasons?.length) {
        for (const reason of card.reasons.slice(0, 2)) {
          lines.push(`  - ${reason}`);
        }
      }
    }
  } else {
    lines.push('- none');
  }

  if (bundle.warnings?.length) {
    lines.push('');
    lines.push('warnings:');
    for (const warning of bundle.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  lines.push('');
  lines.push('context preview:');
  for (const block of bundle.context_blocks.slice(0, 4)) {
    lines.push(`--- ${block.title} ---`);
    lines.push(block.preview || previewText(block.content, 8));
  }

  if (bundle.trace) {
    lines.push('');
    lines.push('decision trace:');
    lines.push(`- signals used: ${bundle.trace.classification.signals_used.join(', ')}`);
    for (const reason of bundle.trace.classification.reasons) {
      lines.push(`- ${reason}`);
    }

    if (Array.isArray(bundle.trace.scoredSkills) && bundle.trace.scoredSkills.length) {
      lines.push('skill candidates:');
      for (const skill of bundle.trace.scoredSkills.slice(0, 3)) {
        lines.push(`- ${skill.id} (${skill.score})`);
        for (const reason of (skill.reasons || []).slice(0, 2)) {
          lines.push(`  - ${reason}`);
        }
      }
    }

    if (Array.isArray(bundle.trace.scoredMemory) && bundle.trace.scoredMemory.length) {
      lines.push('memory candidates:');
      for (const card of bundle.trace.scoredMemory.slice(0, 3)) {
        lines.push(`- ${card.id} (${card.score})`);
        for (const reason of (card.reasons || []).slice(0, 2)) {
          lines.push(`  - ${reason}`);
        }
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

module.exports = {
  buildMemoryBlock,
  buildSkillBlock,
  composeBundle,
  previewText,
  renderHumanBundle,
  summarizeFileList
};
