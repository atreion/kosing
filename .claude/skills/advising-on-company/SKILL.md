---
name: advising-on-company
description: Turn a company's Kosing results into a verdict - required discount, checklist, the four-sentence idea - written to advice.md. Use when the user asks whether to buy, hold or pass on a company with a case, what a good entry price is, or wants a company reassessed after new facts.
---

# Advising on Company

Read one company's documents and the investor's standing documents, and write
`advice.md`. The advisor does no web research and never edits facts or case.
Passing is a normal outcome.

## Start here

Run every command from the Kosing repo root.

```
DATA="$(npm run --silent kosing -- where)"
D="$(npm run --silent kosing -- where <ID>)"
```

Read:

- `$DATA/standing/INVESTMENT_WISDOM.md`, including the required-discount table under "Margin of safety".
- `$DATA/standing/INVESTMENT_CHECKLIST.md`
- `$DATA/standing/MARKET_OUTLOOK.md`
- `$DATA/standing/FX_CONTEXT.md`
- `$D/facts.json`, `$D/research.md`, `$D/case.json` if present.

## Workflow

1. **Freshness.** Run `npm run --silent kosing -- value <ID>`. On exit 1,
   stop: hand a `facts` error to `researching-company` and a `case` error to
   `building-case`. On exit 3, `results.json` could not be written: report the
   message and stop. Never read `results.json` after a failed run; it is stale.
   Then read `$D/results.json`, every resolution and every warning. A
   `casePredatesFacts` warning is stated first: the case may not reflect the
   current facts.
2. **Checklist.** Answer every applicable question in the checklist from the
   documents and results. List each failed or unanswerable question by id. An
   unanswerable applicable question is a data gap, and it weighs toward pass or
   too hard.
3. **Required discount, with the working shown.**
   - The classification's discount comes from the wisdom table. Its keys are
     snake_case; map them to Kosing's: `quality_compounder` is
     `qualityCompounder`, `garp` is `garp`, `holding_company` is
     `holdingCompany`, `special_situation` is `specialSituation`,
     `value_cyclical` is `valueCyclical`. Say that you mapped them.
   - Add the add-on for the `Level:` line under `## AI-cycle exposure` in
     `research.md`. If that line is missing, say so: the hurdle cannot be
     stated, and the name goes back to `researching-company`.
   - The base value is `valuation.valuePerShare` for `dcf` and `nav`, and
     `valuation.scenarios.base.valuePerShare` for `normalisedEarnings`. It is
     in the reporting currency.
   - Entry price = base value × (1 − required discount). Compare it with
     `inputs.company.market.price`, also in the reporting currency. When the
     facts' `market.priceCurrency` differs, also state the entry price in the
     trading currency, converting with the rate in the
     `priceConvertedToReporting` resolution (divide by the rate when
     `inverted` is false, multiply when it is true).
   - With no case, or `valuation: null`, there is no base value. Say so, name
     the resolution that explains it, and do not count it as a failure.
4. **Wisdom and outlook.** Apply them. Write the four-sentence idea a
   ten-year-old could follow. If an honest four sentences cannot be written,
   the verdict is `tooHard`.
5. **Decide.** One of `watching`, `accumulate`, `pass`, `tooHard`, with a
   conviction of `low`, `medium` or `high`.
   - A price that does not clear the required discount bars `accumulate`
     unless an override reason is written in `advice.md`. Never override
     silently.
   - Clearing it compels nothing. The checklist and the four-sentence test
     still govern.
   - A failed applicable question bars `accumulate`. For a name the user does
     not hold, it means `pass`. For a name the user holds, it means `watching`
     at most, and `advice.md` says what would clear the question. Ask the user
     whether they hold the name when they have not said.
   - A partial fail, where the question fails for part of the business, is a
     fail. Report it with the share of revenue it covers.
   - No `case.json` (the analyst found no method) means `tooHard`. A
     `valuation: null` with a case present is not a verdict: hand back to
     `building-case` with the resolution that explains it.
   - A `pass` names the failed question, or how far the price missed the
     entry price.
6. **Write `$D/advice.md`** with these headings, in this order:

   ```
   # <Company name> (<ID>), <YYYY-MM-DD>

   ## Classification
   ## The idea in four sentences
   ## Verdict
   <verdict>, <conviction> conviction. <one paragraph why>
   ## Required discount
   <classification discount> + <AI-cycle add-on> = <required>. Base value <x>; entry price <y>; price <z>; clears: yes|no.
   ## Checklist
   <failed and unanswerable questions by id, each with one line>
   ## What the numbers say
   <reverse DCF implied growth, multiples against bands and peers, sensitivity spread, resolutions and warnings that matter>
   ## What would change the verdict
   ```

7. **Commit in the data repo:**

   ```
   git -C "$D" add advice.md results.json
   git -C "$D" commit -m "advice(<ID>): <verdict>"
   ```

   Never push.
8. **Present** in this order before any detail: the classification, the
   four-sentence idea, the verdict. Then the rest, and the path to
   `advice.md`.

## Boundaries

- No web research. Never edit `facts.json`, `research.md` or `case.json`.
- Never open a thesis body. A case's `theses` slugs are provenance; the
  verdict stands on the company's own merits.
- Nothing is recorded in invest's funnel or ledger. Never write to `../invest`.
