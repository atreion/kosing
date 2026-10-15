---
name: analysing-company
description: Value and advise on a listed company with Kosing - write the case, run the valuator, analyse, apply the investor's lenses, and write advice.md. Use when the user asks whether to buy, hold or pass on a company, what it is worth, or to reassess it after new facts.
---

# Analysing Company

Run commands from the Kosing repo root.
`DATA="$(npm run --silent kosing -- where)"`, `D="$(npm run --silent kosing -- where <ID>)"`.

1. **Facts.** Read `$D/facts.json` and `$D/research.md`. If they are missing,
   or the user wants them fresh, use `researching-company` first. Read
   `$DATA/positions.md` for what the user holds, and the previous
   `$D/advice.md` if there is one for the tests written before a report. When
   the user states a new position, update `positions.md` with the date. When that report has
   landed, check those tests first and say which passed and which failed.
2. **Case.** Write `$D/case.json` against `npm run --silent kosing -- schema case`,
   with bear and bull scenarios and the company's AI-cycle exposure. The base
   case is what you believe, not a number discounted for safety: the margin
   of safety is applied separately. For a bank or insurer (classification bankInsurer, method excessReturn) the base ROTE path spans the rate regimes the company has lived through, using the net interest income history and sensitivity in the facts.
3. **Value.** `npm run --silent kosing -- value <ID>` writes `$D/results.json`.
   Fix the case at each reported path until it exits 0. After you have seen
   the value, an assumption changes only for a reason written into
   `rationale`, never to move the value toward the price. A `priceStale`
   warning means refresh the price with `researching-company` first.
4. **Analyse.** Your own judgement on the business, what the price implies,
   and what it is worth, using the results' numbers rather than your own
   arithmetic. If the case rests on the market being wrong, say what the
   market believes instead, why you think it is wrong, and what would show
   that you are the one who is wrong.
5. **Lenses.** Read `$DATA/standing/*.md`. Say where each bears on this
   company, and where you depart from it and why.
   One rule is hard: the required discount. `results.json`'s `hurdle` gives
   the entry price and whether the price clears it. No `accumulate` unless it
   clears, or `advice.md` gives a written reason to override it.
6. **Write `$D/advice.md`.** Lead with the verdict (`watching`, `accumulate`,
   `pass` or `tooHard`) and a conviction, the entry price and the price. Then
   whatever the analysis needs, the lenses, the user's position if known (and
   whether other names they hold are the same bet), and what would change the
   verdict. When the next report can confirm or break the case, end with tests
   written before it: the figure, the threshold, its last value, and the
   report date. Only figures the company actually discloses.
7. `git -C "$D" add case.json results.json advice.md && git -C "$D" commit -m "advice(<ID>): <verdict>"`

Nothing is pushed.
