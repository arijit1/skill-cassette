const { previewText, summarizeFileList } = require('./composer');

const BACKEND_PROFILES = {
  generic: {
    id: 'generic',
    name: 'Generic backend',
    transport: 'messages',
    prompt_style: 'messages',
    description: 'Portable message envelope for any agent backend.',
    notes: [
      'Use this when you want a backend-agnostic payload.',
      'System and user content stay separated.'
    ],
    default_model: null
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    transport: 'single_prompt',
    prompt_style: 'single_prompt',
    description: 'Local runner that commonly accepts one prompt string.',
    notes: [
      'Flatten the handoff into one prompt string.',
      'Useful for shell wrappers and local-first setups.'
    ],
    default_model: null
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    transport: 'messages',
    prompt_style: 'messages',
    description: 'Chat backend that prefers a system message and a user message.',
    notes: [
      'Keep guardrails in the system message.',
      'Send the task context in the user message.'
    ],
    default_model: null
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    transport: 'messages',
    prompt_style: 'messages',
    description: 'Agent backend that prefers structured messages.',
    notes: [
      'Use the same message envelope as other chat backends.',
      'Keep the selected skill and memory context visible.'
    ],
    default_model: null
  }
};

function normalizeBackendId(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function listBackendProfiles() {
  return Object.values(BACKEND_PROFILES).map((profile) => ({ ...profile }));
}

function resolveBackendSelection(requestedBackend, config = {}, options = {}) {
  const requested = normalizeBackendId(requestedBackend || options.backend || config.backend?.default || 'auto');
  const preferred = Array.isArray(config.backend?.preferred)
    ? config.backend.preferred.map(normalizeBackendId).filter(Boolean)
    : [];
  const models = config.backend && typeof config.backend.models === 'object' && !Array.isArray(config.backend.models)
    ? config.backend.models
    : {};
  const warnings = [];

  let resolved = requested;
  let resolvedFrom = 'requested';

  if (!resolved || resolved === 'auto') {
    resolved = preferred.find((backendId) => BACKEND_PROFILES[backendId]) || 'generic';
    resolvedFrom = preferred.length ? 'config.backend.preferred' : 'generic';
  }

  if (!BACKEND_PROFILES[resolved]) {
    warnings.push(`Unknown backend "${requested}". Falling back to generic.`);
    resolved = 'generic';
    resolvedFrom = 'fallback';
  }

  const profile = BACKEND_PROFILES[resolved];
  const modelValue = options.model ?? models[resolved] ?? config.backend?.model ?? profile.default_model;
  const model = modelValue === undefined || modelValue === null || modelValue === '' ? null : String(modelValue);

  return {
    requested,
    resolved,
    resolved_from: resolvedFrom,
    model,
    profile,
    warnings
  };
}

function buildExecutionCommand(profile, model, promptText) {
  if (profile.id !== 'ollama' || !model) {
    return null;
  }

  return {
    program: 'ollama',
    args: ['run', model, promptText]
  };
}

function buildBackendEnvelope(bundle, selection = {}, config = {}) {
  const resolved = selection.profile ? selection : resolveBackendSelection(selection.backend, config, selection);
  const profile = resolved.profile;
  const systemText = [
    'skill-cassette backend handoff',
    `Backend: ${profile.name}`,
    profile.description,
    profile.transport === 'single_prompt'
      ? 'This backend prefers one flattened prompt string.'
      : 'This backend prefers structured messages.',
    ...profile.notes
  ].filter(Boolean).join('\n');

  const userText = bundle.context_text || '';
  const messages = [
    { role: 'system', content: systemText },
    { role: 'user', content: userText }
  ];
  const promptText = profile.transport === 'single_prompt'
    ? [systemText, userText].filter(Boolean).join('\n\n')
    : [systemText, userText].filter(Boolean).join('\n\n');
  const command = buildExecutionCommand(profile, resolved.model, promptText);
  const launchHint = profile.id === 'ollama'
    ? command
      ? 'Execution command is ready for a local wrapper or shell helper.'
      : 'Set --model or backend.models.ollama to generate an Ollama execution command.'
    : profile.id === 'generic'
      ? 'Use prompt_text or the messages array with your wrapper.'
      : `Pass the messages array to the ${profile.name} wrapper or SDK.`;

  return {
    ...bundle,
    backend: {
      id: profile.id,
      name: profile.name,
      transport: profile.transport,
      prompt_style: profile.prompt_style,
      requested: resolved.requested,
      resolved_from: resolved.resolved_from,
      model: resolved.model
    },
    execution: {
      mode: command ? 'cli' : 'sdk',
      system_text: systemText,
      user_text: userText,
      prompt_text: promptText,
      messages,
      command,
      launch_hint: launchHint,
      summary: {
        changed_files: summarizeFileList(bundle.task_context?.changed_files || []),
        task_type: bundle.task_type,
        confidence: bundle.confidence
      }
    },
    warnings: Array.from(new Set([...(bundle.warnings || []), ...(resolved.warnings || [])]))
  };
}

function renderBackendBundle(bundle) {
  const lines = [];

  lines.push('skill-cassette handoff');
  lines.push(`backend: ${bundle.backend.name} (${bundle.backend.id})`);
  lines.push(`transport: ${bundle.backend.transport}`);
  lines.push(`execution mode: ${bundle.execution.mode}`);

  if (bundle.backend.model) {
    lines.push(`model: ${bundle.backend.model}`);
  }

  if (bundle.execution.command?.program) {
    lines.push(`execution command: ${bundle.execution.command.program} ${bundle.execution.command.args.slice(0, 2).join(' ')} <prompt>`);
  }

  lines.push(`changed files: ${bundle.execution.summary.changed_files}`);
  lines.push(`launch hint: ${bundle.execution.launch_hint}`);
  lines.push('');
  lines.push('selected skills:');

  if (bundle.selected_skills?.length) {
    for (const skill of bundle.selected_skills) {
      lines.push(`- ${skill.id} (${skill.score})`);
    }
  } else {
    lines.push('- none');
  }

  lines.push('');
  lines.push('selected memory:');

  if (bundle.selected_memory?.length) {
    for (const card of bundle.selected_memory) {
      lines.push(`- ${card.id} (${card.score})`);
    }
  } else {
    lines.push('- none');
  }

  lines.push('');
  lines.push('prompt preview:');
  lines.push(previewText(bundle.execution.prompt_text, 14) || 'none');

  if (bundle.trace) {
    lines.push('');
    lines.push('decision trace:');
    lines.push(`- signals used: ${bundle.trace.classification.signals_used.join(', ')}`);
    for (const reason of bundle.trace.classification.reasons || []) {
      lines.push(`- ${reason}`);
    }
  }

  if (bundle.warnings?.length) {
    lines.push('');
    lines.push('warnings:');
    for (const warning of bundle.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

module.exports = {
  BACKEND_PROFILES,
  buildBackendEnvelope,
  listBackendProfiles,
  normalizeBackendId,
  renderBackendBundle,
  resolveBackendSelection
};
