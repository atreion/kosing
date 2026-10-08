# Kosing

The investment workbench, replacing the Python `../invest` repository piece by
piece until nothing is left there. A funnel of four roles: a researcher (AI)
writes `facts.json`, an analyst (AI) writes `case.json`, the valuator (this
code, deterministic) computes `results.json`, an advisor (AI) reads it. The
valuator is the first piece. Design: `docs/superpowers/specs/2026-10-07-valuator-design.md`.

## Working agreement

Claude writes the code. The user reviews at checkpoints, approves, and gives
feedback; the goal is a working, reliable core as soon as possible.

- Work from the approved spec and plan. Where either is silent or wrong, make
  the smallest ruling that satisfies the spec, record it in the ledger, keep
  going, and surface it at the next checkpoint. Do not stop to ask unless the
  action is irreversible or every path forward is a guess.
- Checkpoints are where something coherent exists to review, not after every
  task. Each one explains what was built and why, lists every ruling, and
  waits for a go-ahead.
- Explanations stay. A construct that is not obvious gets a sentence on why,
  in the code where it helps a reader and in the checkpoint where it helps
  the reviewer.
- "Kosing" is capitalized in prose; `kosing` only in code identifiers and paths.

## Toolchain

- Source runs via tsx (`node --import tsx`), no build step. `tsc --noEmit`
  does the type checking. Relative imports carry the `.ts` extension.
- Tests: Node's built-in `node:test` + `node:assert/strict`, files `*.test.ts`
  next to the code.
- `npm run check` runs typecheck, Biome and tests. Run it before committing.

## Git

Solo project: commit directly on `main` (this overrides the global
branch-and-PR rule). Local branches only for experiments, merged back with
`--ff-only` or `--squash` and then deleted. No PRs required. Commits inside an
approved plan need no per-commit approval; the checkpoint is the review.
