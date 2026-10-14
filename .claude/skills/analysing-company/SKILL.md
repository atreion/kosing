---
name: analysing-company
description: Value and advise on a listed company with Kosing - write the case, run the valuator, analyse, apply the investor's lenses, and write advice.md. Use when the user asks whether to buy, hold or pass on a company, what it is worth, or to reassess it after new facts.
---

# Analysing Company

Run commands from the Kosing repo root.
`DATA="$(npm run --silent kosing -- where)"`, `D="$(npm run --silent kosing -- where <ID>)"`.

1. **Facts.** Read `$D/facts.json` and `$D/research.md`. If they are missing,
   or the user wants them fresh, use `researching-company` first. Read the
   previous `$D/advice.md` if there is one: it holds the position the user
   last stated and any tests written before a report.
2. **Case.** Write `$D/case.json` against `npm run --silent kosing -- schema case`,
   with bear and bull scenarios and the company's AI-cycle exposure. The base
   case is what you believe, not a number discounted for safety: the margin
   of safety is applied separately.
3. **Value.** `npm run --silent kosing -- value <ID>` writes `$D/results.json`.
   Fix the case at each reported path until it exits 0. After you have seen
   the value, an assumption changes only for a reason written into
   `rationale`, never to move the value toward the price. A `priceStale`
   warning means refresh the price with `researching-company` first.
4. **Analyse.** Your own judgement on the business, what the price implies,
   and what it is worth, using the results' numbers rather than your own
   arithmetic.
5. **Lenses.** Read `$DATA/standing/*.md` and the theses in `$DATA/theses/`.
   Say where each bears on this company, and where you depart from it and why.
   One rule is hard: the required discount. `results.json`'s `hurdle` gives
   the entry price and whether the price clears it. No `accumulate` unless it
   clears, or `advice.md` gives a written reason to override it.
6. **Write `$D/advice.md`.** Lead with the verdict (`watching`, `accumulate`,
   `pass` or `tooHard`) and a conviction, the entry price and the price. Then
   whatever the analysis needs, the lenses, the user's position if known, and
   what would change the verdict.
7. `git -C "$D" add case.json results.json advice.md && git -C "$D" commit -m "advice(<ID>): <verdict>"`

Nothing is pushed.
