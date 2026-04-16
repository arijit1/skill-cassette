# ctx-router

Automatic context routing for agents. `ctx-router` reads task signals from the repo, the branch, and the prompt, then loads the right skill and memory before the agent acts.

## What it is

`ctx-router` is a local-first preflight layer for AI-assisted work. It is built to keep agents from forgetting repo conventions, docs style, or code review rules.

It ships with:

- a CLI (`ctx`)
- repo-local skill manifests
- repo-local memory cards
- explainable, read-only preflight output
- a GitHub Action scaffold for pull requests

## Quickstart

```bash
node bin/ctx.js --help
node bin/ctx.js scan
node bin/ctx.js preflight --task "Update the README examples"
node bin/ctx.js preflight --task "Update the README examples" --json
```

If you want the `ctx` command in your shell while developing locally:

```bash
npm link
```

Then scaffold `skills/`, `memory/`, and a starter GitHub Action in another repo:

```bash
ctx init
```

## v0 scope

- Local-first, read-only recommendations
- Code and docs workflows
- Git branch, diff, file-path, and task-text signals
- Explainable skill and memory selection
- CLI commands: `init`, `scan`, `doctor`, `preflight`, `explain`
- GitHub Action scaffold for PR preflight

## What v0 does not do

- Autonomous file edits by the router
- Spreadsheet-specific routing as a first-class path
- PDF extraction as a first-class path
- Background monitoring
- Multi-agent orchestration

## How it works

1. Collect signals from the task, branch, diff, and changed files.
2. Classify the task as docs or code work.
3. Match repo-local skills and memory cards.
4. Emit a preflight bundle with reasons and guardrails.
5. Let the agent use that bundle before it acts.

## Repo layout

- `skills/`: example skills that the router can load
- `memory/`: example memory cards for repo conventions and corrections
- `examples/`: demo config and task inputs
- `tests/`: manifest and CLI contract tests
- `.github/workflows/preflight.yml`: PR preflight scaffold

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
