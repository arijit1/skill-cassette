# Demo Task

Update the README examples to match the current CLI contract.

Expected files:
- `README.md`
- `examples/skill-cassette.config.example.json`

Expected behavior:
- Prefer the docs-style skill for Markdown edits.
- Prefer the code-preflight skill if any CLI contract or test references change.
- Keep the change read-only in v1 and explain the selected context before editing.
- After `ctx handoff`, the next step should mention the saved file path and Codex auto-launch guidance.
- Treat the bridge as optional/internal sample code, not the primary path.
