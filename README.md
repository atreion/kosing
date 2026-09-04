# Kosing

Deterministic financial math in TypeScript: DCF, reverse DCF, WACC and related
valuation calculations. A hand-port of the Python `invest` workbench, done as a
TypeScript learning exercise. Input dossiers are assumed to already be in
memory; this project only does the math.

## Requirements

- Node 22 or newer
- npm (ships with Node)

## Commands

| Command              | What it does                                |
|----------------------|---------------------------------------------|
| `npm test`           | Run tests with Node's built-in runner       |
| `npm run test:watch` | Same, re-running on file changes            |
| `npm run typecheck`  | `tsc --noEmit`                              |
| `npm run lint`       | Biome lint + format check                   |
| `npm run fix`        | Biome, applying safe fixes and formatting   |
| `npm run check`      | typecheck, lint and test in one go          |
| `npm run build`      | Emit JavaScript and declarations to `dist/` |

## Layout

Tests live next to the code they test as `*.test.ts`. Source runs directly
through [tsx](https://tsx.is) (esbuild under the hood), so there is no build
step during development; `tsc` only type-checks. Relative imports use the `.ts`
extension, rewritten to `.js` on build.
