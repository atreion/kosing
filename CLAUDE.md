# Kosing

The investor's tool for researching, pricing and advising on listed equities.
The math is deterministic code; the judgement is Claude's. No ledger,
holdings or broker data.

- `researching-company` writes `facts.json` and `research.md`.
- `analysing-company` writes `case.json`, runs `kosing value` for
  `results.json`, and writes `advice.md` with the investor's lenses applied.
  Last, `kosing report` renders both into `report.html`.

The documents live in a private data repo located by `DATA_PATH` (environment
first, then a git-ignored `.env` at the repo root; see `.env.example`).
`kosing schema facts|case` is the contract for the two documents the skills
write. Designs: `docs/superpowers/specs/`.

The Python `../invest` repo is a read-only archive. Nothing in Kosing writes to it.

## Working agreement

Claude writes the code. The user reviews at checkpoints. Where a spec or plan
is silent or wrong, make the smallest ruling that fits, note it, and surface it
at the next checkpoint. "Kosing" is capitalized in prose; `kosing` only in
code identifiers and paths.

## Toolchain

- Source runs via tsx (`node --import tsx`), no build step. `tsc --noEmit`
  does the type checking. Relative imports carry the `.ts` extension.
- Tests: Node's built-in `node:test` + `node:assert/strict`, files `*.test.ts`
  next to the code.
- `npm run check` runs typecheck, Biome and tests. Run it before committing.

## Git

Solo project: commit directly on `main` (this overrides the global
branch-and-PR rule). Local branches only for experiments, merged back with
`--ff-only` or `--squash` and then deleted. No PRs.
