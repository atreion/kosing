# Kosing

TypeScript learning project: a hand-port of the deterministic financial math in
the Python `../invest` workbench (`workbench/math/`: dcf, reverse_dcf, wacc,
multiples, nav, sensitivity, fx). Dossiers are assumed already loaded; no I/O,
CLI, database or report generation here.

## Working agreement

The user writes the code whose writing is how the TypeScript gets learned: the
domain model and its impossible states, decoders, selectors, the math, and
anything where a design choice is being made rather than applied. Claude writes
the mechanical remainder: transcribing a schema or a Python reference field by
field, fixture loaders and test harnesses, repetitive test data, renames.

- A task that is partly each gets split, saying which half is which, rather
  than handed over whole.
- Prefer explaining the TypeScript concept behind a suggestion over just
  giving the fix. This holds for Claude's own code too: a transcription that
  introduces an unfamiliar Zod or type-level construct gets a sentence on why.
- Review runs both ways.
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
`--ff-only` or `--squash` and then deleted. No PRs required.
