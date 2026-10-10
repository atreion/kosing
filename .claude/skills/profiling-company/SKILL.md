---
name: profiling-company
description: Run Kosing's whole pipeline on one company - research, case, verdict - skipping stages whose documents are current. Use when the user asks to research and profile a company, or to run the full workflow on a ticker.
---

# Profiling Company

Chain the three role skills for one company. Each stage keeps its own skill's
boundaries; this skill only decides which stages to run.

## Workflow

1. Settle the id `TICKER.EXCHANGE` and run
   `npm run --silent kosing -- where <ID>`. Stop on a `DATA_PATH` error.
2. **Research** with `researching-company`, unless `facts.json` exists and its
   `asOf` is today or a date the user named as recent enough. A user asking
   for a refresh always runs it, with the scope they named.
3. **Case** with `building-case`, unless `case.json` exists and its
   `factsAsOf` equals the facts' `asOf`. When `building-case` finds no method
   for the classification, skip to the advisor, which reports too hard.
4. **Advice** with `advising-on-company`. It always runs.
5. **Report** what `advising-on-company` presents, then which stages ran and
   which documents were reused, and the commits made in the data repo.
