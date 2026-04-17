# Demo Task

Update the README examples to match the current CLI contract.

Expected files:
- `README.md`
- `examples/skill-cassette.config.example.json`

Expected behavior:
- Prefer the docs-style skill for Markdown edits.
- Prefer the code-preflight skill if any CLI contract or test references change.
- Keep the change read-only in v0 and explain the selected context before editing.
- After `ctx handoff`, the next step should be obvious and copy-pasteable.
- Treat the bridge as optional/internal, not the primary path.
