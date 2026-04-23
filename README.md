# skill-cassette

> Repo-owned handoff layer for agents that makes the next step obvious.
>
> `skill-cassette` reads repo signals, saves an editable handoff artifact, and turns it into a clear next step for Ollama, Claude, Codex, or another compatible backend.

## At a glance

| Area | What it gives you |
| --- | --- |
| Handoff artifact | `.skill-cassette/handoff.json` stays editable and repo-owned. |
| First-run flow | `ctx init` runs health + discovery, then asks what to do next. |
| Primary promise | Review the saved handoff, then continue from an obvious next step. |
| Optional sample | `.skill-cassette/agent-bridge.mjs` is kept as reference code only. |

`skill-cassette` is a local-first preflight layer for AI-assisted work. It keeps agents from forgetting repo conventions, docs style, or code review rules.

> v1 is intentionally narrow: it helps you review context and continue work without turning into a generic memory platform.

## Quickstart

Start here if you want the fastest path from a fresh repo to a saved handoff and a clear next-step prompt:

1. Run `ctx init`.
2. Read the health and discovery output.
3. Open `.skill-cassette/handoff.json` if you want to inspect the saved payload.
4. Follow the next-step prompt, or generate a handoff directly with `ctx handoff --backend codex --json`.

```bash
ctx init
ctx handoff --backend codex --json
code .skill-cassette/handoff.json
```

If you want the `ctx` command in your shell while developing locally:

```bash
npm link
```

`ctx init` creates `skills/`, `memory/`, config, `.skill-cassette/agent-bridge.mjs`, and a starter GitHub Action in your repo. It also runs `doctor` and `scan`, then asks whether to generate the handoff and show the next-step prompt.

Why the saved file exists: it gives you one place to inspect or tweak the handoff before a backend runs.
Future compaction and persistent memory recovery are intentionally not part of v1; they stay as later work if the repo needs deeper state retention.
The shipped CLI and workflow scaffold are Node-based in v1, so non-Node repos may need a custom wrapper or a retargeted workflow entrypoint instead of using the example `npm` / `node` path as-is.

## v1 scope

- Local-first, read-only recommendations
- Code and docs workflows
- Git branch, diff, file-path, and task-text signals
- Explainable skill and memory selection
- Backend handoff for Ollama, Claude, Codex, and generic wrappers
- CLI commands: `init`, `scan`, `doctor`, `preflight`, `handoff`, `explain`
- GitHub Action scaffold for PR preflight
- No promise of generalized memory persistence or compaction in v1

## What v1 does not do

- Autonomous file edits by the router
- Spreadsheet-specific routing as a first-class path
- PDF extraction as a first-class path
- Background monitoring
- Multi-agent orchestration
- Direct backend execution from the router
- Persistent memory compaction as a v1 guarantee
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
- `architecture.md`: contributor-facing system map and v1 boundaries
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
