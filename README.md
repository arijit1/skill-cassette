# skill-cassette

> Repo-owned handoff layer for agents that makes the next step obvious.
>
> `skill-cassette` reads task signals from the repo, the branch, and the prompt, then loads the right skill and memory before handing the bundle to Ollama, Claude, Codex, or another compatible backend.

## At a glance

`skill-cassette` is a local-first preflight layer for AI-assisted work. It is built to keep agents from forgetting repo conventions, docs style, or code review rules.

- a CLI (`ctx`)
- repo-local skill manifests
- repo-local memory cards
- explainable, read-only preflight output
- backend adapters for portable handoff payloads
- a GitHub Action scaffold for pull requests

**What users get**

- A saved, editable handoff artifact at `.skill-cassette/handoff.json`
- A direct next-step prompt instead of a vague “do the thing” handoff
- An optional/internal bridge example for repos that want a wrapper pattern

**What v0 is not**

- A generic memory platform
- Persistent compaction or memory recovery
- A Node-shaped workflow assumption for every repo type

## Quickstart

Start here if you want the fastest path from a fresh repo to a saved handoff and a clear next-step prompt:

1. Initialize the repo-local scaffold.
2. Let `ctx init` guide scaffold refresh or continue, run `doctor` and `scan`, ask what you are working on, then ask whether to generate the handoff and show the next-step prompt.
3. Edit `.skill-cassette/handoff.json` only if you want to review the saved payload first.
4. If you want to generate the handoff separately, run `ctx handoff --backend codex --json` and follow the saved-file guidance it prints.

```bash
ctx init
ctx handoff --backend codex --json
```

If you want the `ctx` command in your shell while developing locally:

```bash
npm link
```

`ctx init` creates `skills/`, `memory/`, config, `.skill-cassette/agent-bridge.mjs`, and a starter GitHub Action in your repo. It also runs a quick `doctor` and `scan`, asks what you are working on, then asks whether to generate the handoff and show the next-step prompt.

Why the saved file exists: it gives you one place to inspect or tweak the handoff before a backend runs.
Future compaction and persistent memory recovery are intentionally not part of v0; they stay as later work if the repo needs deeper state retention.
The shipped CLI and workflow scaffold are Node-based in v0, so non-Node repos may need a custom wrapper or a retargeted workflow entrypoint instead of using the example `npm` / `node` path as-is.

## v0 scope

- Local-first, read-only recommendations
- Code and docs workflows
- Git branch, diff, file-path, and task-text signals
- Explainable skill and memory selection
- Backend handoff for Ollama, Claude, Codex, and generic wrappers
- CLI commands: `init`, `scan`, `doctor`, `preflight`, `handoff`, `explain`
- GitHub Action scaffold for PR preflight
- No promise of generalized memory persistence or compaction in v0

## What v0 does not do

- Autonomous file edits by the router
- Spreadsheet-specific routing as a first-class path
- PDF extraction as a first-class path
- Background monitoring
- Multi-agent orchestration
- Direct backend execution from the router
- Persistent memory compaction as a v0 guarantee
- Node-shaped workflow scaffolding for every repo type

## How it works

1. Collect signals from the task, branch, diff, and changed files.
2. Classify the task as docs or code work.
3. Match repo-local skills and memory cards.
4. Emit a preflight bundle with reasons and guardrails.
5. Shape the bundle into a backend-specific handoff payload.
6. Let the agent or wrapper use that payload before it acts.

## Repo layout

- `skills/`: example skills that the router can load
- `memory/`: example memory cards for repo conventions and corrections
- `examples/`: demo config and task inputs
- `examples/wrappers/`: optional/internal sample backend bridge scripts
- `tests/`: manifest and CLI contract tests
- `architecture.md`: contributor-facing system map and v0 boundaries
- `.github/workflows/preflight.yml`: PR preflight scaffold

## Backend adapters

`skill-cassette` does not run the model itself. It prepares a portable handoff for the backend you choose.

- `ollama` favors one flattened prompt string.
- `claude` favors a system message plus a user message.
- `codex` uses the same structured message envelope.
- `generic` keeps the payload backend-neutral.

Set `backend.default` in `.skill-cassette.json` to choose the default adapter.

Example backend config:

```json
{
  "backend": {
    "default": "ollama",
    "models": {
      "ollama": "llama3"
    }
  }
}
```

Use the handoff command when you want the prompt shaped for a specific backend:

```bash
node bin/ctx.js handoff --backend claude --json
```

`ctx handoff --backend codex --json` also writes an editable handoff file at `.skill-cassette/handoff.json` by default. That file is what Codex uses when you want to review or tweak the context before execution.

After handoff generation, the CLI tells you the next-step prompt to follow. The bridge helper is optional/internal sample code; use it only if you want a reference wrapper in your own repo.

## Optional Bridge

`ctx init` creates `.skill-cassette/agent-bridge.mjs` in your workspace. That is optional/internal sample code, not the primary path.

If you want to inspect it locally, run `ctx init` after linking the CLI:

```bash
npm link
ctx init
```

## Example skill set

- `skills/docs-style-guide/`
- `skills/code-preflight/`

## Example memory cards

- `memory/repo-writing-conventions.json`
- `memory/repo-code-conventions.json`

## Demo flow

Use the sample task in `examples/demo-task.md` or your own issue text:

```bash
node bin/ctx.js preflight --issue-file examples/demo-task.md
```

For a local repo diff:

```bash
node bin/ctx.js preflight --from-git
```

For another agent or CI job:

```bash
node bin/ctx.js preflight --from-git --json
```
