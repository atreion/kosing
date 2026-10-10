---
name: building-case
description: Write a company's Kosing case.json - classification, valuation method, sourced assumptions and the theses it rests on. Use when a company has researched facts and needs a case, when the user asks for a case to be rewritten, or when a thesis a case cites has been falsified.
---

# Building Case

Write one company's `case.json`: which method values it, on what assumptions,
and which theses it rests on. The analyst does no web research and states no
verdict. Whoever writes the case does not grade it.

## Start here

Run every command from the Kosing repo root.

```
DATA="$(npm run --silent kosing -- where)"
D="$(npm run --silent kosing -- where <ID>)"
```

Read:

- `references/base-case.md`: what an honest base case is.
- `$D/facts.json`, `$D/research.md`, `$D/results.json`.
- `$DATA/standing/METHODOLOGY.md`, the sections for the method you choose
  (4.3 for cyclicals, 5 for holding companies). It predates Kosing: read it
  for judgement about inputs; where it describes arithmetic, `kosing value` is
  the authority.

## Workflow

1. **Check the facts.** Run `npm run --silent kosing -- value <ID>`. If there
   is no `facts.json`, or the run exits 1 on a `facts` error, hand back to
   `researching-company` and stop.
2. **Classify.** Choose the classification from `research.md` and the facts.
   It decides the method.

   | Classification | Method |
   | --- | --- |
   | `qualityCompounder`, `garp` | `dcf` |
   | `valueCyclical` | `normalisedEarnings` |
   | `holdingCompany` | `nav` |
   | `specialSituation` | one of the three, argued in `rationale` |
   | `bankInsurer`, `reitUtility`, `saasPreProfit`, `commodityProducer` | none |

   With no method, write no case. Say that Kosing cannot value this name yet
   and why, commit nothing, and stop. The advisor reads a missing case as too
   hard, not as a failure.
3. **Find the theses.** Read only each thesis file's front matter and title:

   ```
   for f in "$DATA"/theses/*.thesis.md; do
     awk 'NR==1 && /^---$/ {fm=1; next} fm && /^---$/ {fm=0; next} fm || /^# / {print} /^# / {exit}' "$f"
     echo
   done
   ```

   Cite a thesis by `slug` only when its `status` is `hardened`, its
   `last_tested` is within the last twelve months, and the case genuinely rests
   on it. Never open a thesis body: a case that reads the argument for its own
   thesis is grading itself. `theses` may be empty.
4. **Write `case.json`** against `npm run --silent kosing -- schema case`.
   - `ticker` equals the facts' `company.ticker`; `factsAsOf` equals the
     facts' `asOf`.
   - Every `sourceRefs` id is already in the facts' `sources`. When an
     assumption needs a source the facts do not have, hand back to
     `researching-company` naming what is needed. Never cite an absent source.
   - `rationale` says what the base case assumes and why, including the weight
     given to management guidance. For `dcf`, `terminal.basis` argues the
     terminal figure for this company.
   - `overrides` stay null unless there is a reason, which goes in
     `overrides.rationale`. A WACC override is a rate strictly between 0 and 1.
   - `sensitivity` stays null unless a different grid is needed.

   Rules the schema cannot show, which decode enforces: scenario triples are
   ordered `bear <= base <= bull`; no scenario multiple exceeds
   `multipleCeiling` when it is set; overrides and sensitivity are allowed for
   `dcf` only, and sensitivity steps each include 0.
5. **Run `kosing value <ID>` once.** On exit 1, fix `case.json` at each `path`
   (or hand back for a `facts` error) and run again. Then read
   `results.json`. Changing an assumption after seeing the value needs a
   reason written into `rationale`, such as an error found or a fact misread.
   Moving an assumption toward the price is tuning, and is not allowed.
6. **Sanity-check, without a verdict.** Look at `valuation.terminalValuePctOfEv`
   (above 0.75 needs the terminal argument to carry the case), the
   resolutions (`dcfUnavailable`, `dcfBasePeriodFromFiscalYear`, and others),
   the spread of the sensitivity grid, and the multiples against their bands.
   Record concerns in `rationale` and run `kosing value <ID>` again so
   `results.json` matches the committed case.
7. **Commit in the data repo:**

   ```
   git -C "$D" add case.json results.json
   git -C "$D" commit -m "case(<ID>): <method>, <classification>"
   ```

   Never push.
8. **Report** the classification, the method, the theses cited, the key
   assumptions, and the sanity checks. No buy, pass or price opinion. Hand off
   to `advising-on-company`.

## When to rewrite a case

The research changes the story; a cited thesis is falsified, retired, or goes
untested for twelve months; or `results.json` carries a `casePredatesFacts`
warning and the assumptions are affected by what changed. A price refresh
alone does not touch the case.

## Boundaries

- No web research. Never edit `facts.json` or `research.md`.
- No verdict, no required discount, no entry price.
- Never open a thesis body.
- Never write to `../invest`.
