# Kosing

A workbench for researching, pricing and advising on listed equities. Claude
researches a company into `facts.json`, writes the valuation assumptions into
`case.json`, and analyses the result. The valuator in this repo does the math
deterministically: WACC, DCF with bear and bull scenarios, reverse DCF,
sensitivity, multiples against history and peers, normalised earnings, NAV
and FX translation, written to `results.json`.

The [guide](docs/README.md) explains the workflow, the documents and the
finance behind the numbers, for human readers.

## Use

The company documents live in a separate private data repo. Point `DATA_PATH`
at it, in the environment or in a `.env` file (see `.env.example`).

```
npm run kosing -- where [TICKER.EXCHANGE]      the data repo, or one company's directory
npm run kosing -- value <TICKER.EXCHANGE>      value one company; writes its results.json
npm run kosing -- report <TICKER.EXCHANGE>     results.json and advice.md into report.html
npm run kosing -- value --facts F [--case C]   value given files; results.json on stdout
npm run kosing -- value --facts F [--case C] --as-of YYYY-MM-DD
                                               the same on a past date, rejecting any later source
npm run kosing -- schema facts | case          the JSON Schema for a document
npm run kosing -- schema facts | case --flat   the same, one line per field
```

Exit codes: 0 success, 1 the documents do not decode (errors as JSON on
stderr), 2 usage or `DATA_PATH` error, 3 the output file could not be written.

In Claude Code, the skills `researching-company` and `analysing-company` run
the workflow.

### Backtests

A backtest values a company as it stood on a past date. Build `facts.json`
and `case.json` for that date outside the data repo, from documents published
by then, and run `value --facts --case --as-of`. Every source then needs a
publication date on or before the as-of date (a price feed's is the price's
own date), and so do the price, the report period and the balance sheet.
Damodaran's older editions are in the data repo's cache. A backtest of the
judgement in a case is only clean for dates after the model's knowledge
cutoff; before it, keep the case mechanical.

## Requirements

- Node 22.18 or newer
- npm

## Commands

| Command              | What it does                                |
|----------------------|---------------------------------------------|
| `npm run kosing`     | The CLI above                               |
| `npm test`           | Run tests with Node's built-in runner       |
| `npm run test:watch` | Same, re-running on file changes            |
| `npm run typecheck`  | `tsc --noEmit`                              |
| `npm run lint`       | Biome lint + format check                   |
| `npm run fix`        | Biome, applying safe fixes and formatting   |
| `npm run check`      | typecheck, lint and test in one go          |
| `npm run build`      | Emit JavaScript and declarations to `dist/` |

## Layout

`src/input` decodes the documents, `src/domain` holds the types, `src/select`
picks the inputs for each calculation, `src/math` computes, `src/results`
assembles `results.json`. Tests live next to the code as `*.test.ts`. Source
runs through [tsx](https://tsx.is), so there is no build step during
development; `tsc` only type-checks.
