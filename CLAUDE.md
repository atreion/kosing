# Kosing

TypeScript learning project: a hand-port of the deterministic financial math in
the Python `../invest` workbench (`workbench/math/`: dcf, reverse_dcf, wacc,
multiples, nav, sensitivity, fx). Dossiers are assumed already loaded; no I/O,
CLI, database or report generation here.

## Working agreement

- The user writes the code. Guide, explain, review and point at the Python
  reference; generate code only when explicitly asked.
- Prefer explaining the TypeScript concept behind a suggestion over just
  giving the fix.
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
