const assert = require('node:assert/strict');
const test = require('node:test');

const {
  BACKEND_PROFILES,
  buildBackendEnvelope,
  listBackendProfiles,
  resolveBackendSelection
} = require('../src/backends');

function createBundle() {
  return {
    repo_root: '/repo',
    mode: 'recommend',
    read_only: true,
    task_context: {
      repo_root: '/repo',
      task_text: 'Update README examples',
      branch: 'main',
      changed_files: ['README.md'],
      diff_summary: { added: 1, modified: 0, deleted: 0, renamed: 0, copied: 0, untracked: 0 },
      artifact_types: ['markdown'],
      combined_text: 'Update README examples main README.md'
    },
    task_type: 'docs_update',
    confidence: 0.91,
    selected_skills: [
      {
        id: 'docs-style-guide',
        score: 0.92,
        reasons: ['Matches task type docs_update.']
      }
    ],
    selected_memory: [
      {
        id: 'repo-writing-conventions',
        score: 0.81,
        reasons: ['Docs task type aligns with the memory card.']
      }
    ],
    warnings: [],
    trace: {
      classification: {
        signals_used: ['task_text', 'branch', 'changed_files', 'artifact_types'],
        reasons: ['Docs-oriented files dominate the signal.']
      }
    },
    context_text: [
      'Skill-cassette Guardrails',
      'Task Summary',
      'Selected skill',
      'Selected memory'
    ].join('\n\n')
  };
}

test('backend profiles include the supported adapters', () => {
  const ids = listBackendProfiles().map((profile) => profile.id);

  assert.ok(ids.includes('generic'));
  assert.ok(ids.includes('ollama'));
  assert.ok(ids.includes('claude'));
  assert.ok(ids.includes('codex'));
});

test('auto backend selection follows the preferred list', () => {
  const selection = resolveBackendSelection('auto', {
    backend: {
      preferred: ['claude', 'ollama', 'codex']
    }
  });

  assert.equal(selection.resolved, 'claude');
  assert.equal(selection.profile.name, BACKEND_PROFILES.claude.name);
});

test('backend envelope shapes a portable handoff payload', () => {
  const bundle = createBundle();
  const selection = resolveBackendSelection('ollama', {
    backend: {
      preferred: ['ollama', 'claude', 'codex']
    }
  });
  const handoff = buildBackendEnvelope(bundle, selection, {
    backend: {
      preferred: ['ollama', 'claude', 'codex']
    }
  });

  assert.equal(handoff.backend.id, 'ollama');
  assert.equal(handoff.backend.transport, 'single_prompt');
  assert.equal(handoff.backend.name, 'Ollama');
  assert.ok(handoff.execution.prompt_text.includes('skill-cassette backend handoff'));
  assert.equal(handoff.execution.messages.length, 2);
  assert.equal(handoff.execution.messages[0].role, 'system');
  assert.equal(handoff.execution.messages[1].role, 'user');
  assert.match(handoff.execution.launch_hint, /Ollama/i);
});

test('ollama handoff includes an executable command when a model is configured', () => {
  const bundle = createBundle();
  const selection = resolveBackendSelection('ollama', {
    backend: {
      preferred: ['ollama', 'claude', 'codex'],
      models: {
        ollama: 'llama3'
      }
    }
  });
  const handoff = buildBackendEnvelope(bundle, selection, {
    backend: {
      preferred: ['ollama', 'claude', 'codex'],
      models: {
        ollama: 'llama3'
      }
    }
  });

  assert.equal(handoff.execution.mode, 'cli');
  assert.equal(handoff.execution.command.program, 'ollama');
  assert.deepEqual(handoff.execution.command.args.slice(0, 2), ['run', 'llama3']);
  assert.equal(handoff.execution.command.args[2], handoff.execution.prompt_text);
});
