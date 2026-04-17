# skill-cassette

Automatic context routing and backend handoff for agents. `skill-cassette` reads task signals from the repo, the branch, and the prompt, then loads the right skill and memory before handing the bundle to Ollama, Claude, Codex, or another compatible backend.

## What it is

`skill-cassette` is a local-first preflight layer for AI-assisted work. It is built to keep agents from forgetting repo conventions, docs style, or code review rules.

It ships with:

- a CLI (`ctx`)
- repo-local skill manifests
- repo-local memory cards
- explainable, read-only preflight output
- backend adapters for portable handoff payloads
- a GitHub Action scaffold for pull requests

## Quickstart

```bash
node bin/ctx.js --help
node bin/ctx.js scan
node bin/ctx.js preflight --task "Update the README examples"
node bin/ctx.js preflight --task "Update the README examples" --json
node bin/ctx.js handoff --backend ollama --model llama3 --json
```

If you want the `ctx` command in your shell while developing locally:

```bash
npm link
```

Then scaffold `skills/`, `memory/`, config, and a starter GitHub Action in another repo:

```bash
ctx init
```

## v0 scope

- Local-first, read-only recommendations
- Code and docs workflows
- Git branch, diff, file-path, and task-text signals
- Explainable skill and memory selection
- Backend handoff for Ollama, Claude, Codex, and generic wrappers
- CLI commands: `init`, `scan`, `doctor`, `preflight`, `handoff`, `explain`
- GitHub Action scaffold for PR preflight

## What v0 does not do

- Autonomous file edits by the router
- Spreadsheet-specific routing as a first-class path
- PDF extraction as a first-class path
- Background monitoring
- Multi-agent orchestration
- Direct backend execution from the router

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
- `tests/`: manifest and CLI contract tests
- `.github/workflows/preflight.yml`: PR preflight scaffold

## Backend adapters

`skill-cassette` does not run the model itself. It prepares a portable handoff for the backend you choose.

- `ollama` favors one flattened prompt string.
- `claude` favors a system message plus a user message.
- `codex` uses the same structured message envelope.
- `generic` keeps the payload backend-neutral.

Set `backend.default` in `.skill-cassette.json` to choose the default adapter.

Use the handoff command when you want the prompt shaped for a specific backend:

```bash
node bin/ctx.js handoff --backend claude --json
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
