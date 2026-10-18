# The workflow

## Three roles

A company passes through three roles. Two are Claude, working through a skill;
one is a program.

```
  researcher                analyst                  valuator             analyst
  (researching-company)     (analysing-company)      (kosing value)       (analysing-company)

  filings, prices   ──►   facts.json        ──►   case.json   ──►   results.json   ──►   advice.md
                          research.md
```

- **The researcher** collects what is observable about the company: its
  financial statements, share count, price, debt, cost-of-capital inputs,
  peers, and what the business does. It writes `facts.json` and `research.md`.
  It does not judge the stock.
- **The analyst** reads the research and decides what it believes about the
  future: how fast revenue grows, where margins settle, what the bear and bull
  cases look like. It writes those beliefs as `case.json`, runs the valuator,
  reads the numbers, applies the investor's lenses and writes `advice.md`.
- **The valuator** is the TypeScript code in this repo, run as
  `kosing value`. It reads the facts and the case and computes everything:
  cost of capital, the valuation, the scenarios, sensitivity, reverse DCF,
  multiples and the entry price. It writes `results.json`. It has no opinions.

Earlier versions of Kosing had a separate advisor role. It merged into the
analyst, because the person who built the case is best placed to say what its
numbers mean and they shared almost every input.

## Where things live

The code lives in this repo. The data lives in a separate, private data repo
that the code finds through `DATA_PATH` (set in the environment or in a
git-ignored `.env`; see `.env.example`). The code never stores company data.

```
kosing-data/
  positions.md          what the investor holds, as stated; not a ledger
  lenses/               the investor's principles (see below)
  companies/
    ACME.STO/           one directory per company, named TICKER.EXCHANGE
      facts.json
      research.md
      case.json
      results.json
      advice.md
```

A company is named by its ticker and exchange as the exchange quotes it:
`ACME.STO`, `BRK.B.NYSE`. The split is at the last dot, so a ticker can
contain dots.

## Step by step

### 1. Research

You ask Claude to research a company. The researcher:

1. Reads `kosing schema facts`, the contract for the facts document (see
   [The documents](documents.md)).
2. Fills `facts.json` from the company's own filings first, then from
   regulators, brokers and data aggregators. Every figure cites a source. A
   figure it cannot source is left null and listed under `gaps` with the
   reason.
3. Writes `research.md`: how the business makes money, its moat and
   competition, management, customers, risks and AI-cycle exposure.
4. Runs the valuator on the facts alone. That checks the facts are consistent
   (units, signs, references) before anyone builds on them.
5. Commits both files in the data repo.

### 2. The case

You ask whether to buy, hold or pass. The analyst reads the facts, the
research, your stated positions and the previous advice if there is one, then
writes `case.json`:

- A **classification**, which decides the valuation method.
- The company's **AI-cycle exposure**, which adds to the required discount.
- The method's assumptions: for a DCF, ten years of revenue growth, margins,
  capital spending and depreciation, working capital, and a terminal value.
- **Bear and bull** scenarios.
- A **rationale** for every assumption, citing the facts' sources.

The base case is what the analyst believes, not a number made conservative.
The margin of safety is applied later, once, as the required discount.

> [!NOTE]
> "The case" in this step is the whole `case.json` document. The bear, base
> and bull cases are scenarios within it. The required discount is the
> margin of safety, not the discount rate used to value future cash.

### 3. Valuation

`kosing value <ID>` decodes both documents, checks them against each other and
writes `results.json`. If anything fails, it exits with errors naming the path
of each bad field, and the analyst fixes the case and runs it again.

Once the analyst has seen the value, an assumption may change only for a
reason written into its rationale. Moving an assumption to bring the value
closer to the price is the failure Kosing is designed to prevent.

### 4. Analysis and advice

The analyst reads `results.json` and writes its own judgement: what the
business is, what the price implies (the reverse DCF), what it is worth and
why. If the case says the market is wrong, the analyst must say what the
market believes instead, why it is wrong, and what evidence would show the
analyst is the one who is wrong.

Then the lenses, then `advice.md`, which leads with:

- **A verdict.** `accumulate` (buy or add), `watching` (hold, do not add, wait
  for a better price or more evidence), `pass` (not worth owning on this
  evidence), or `tooHard` (outside what can be judged).
- **A conviction:** low, medium or high.
- **The entry price and the current price.**

When the next report can confirm or break the case, the advice ends with
**tests written before the report**: the figure, the threshold, its last
value, and the report date. When the report lands, the next analysis checks
those tests first. This is how Kosing stops a thesis from being quietly
rewritten to fit whatever happened.

## The lenses

The lenses are four documents in the data repo's `lenses/` directory. They
are the investor's own, and the analyst applies them to every company:

- **investor.md:** who the investor is, the horizon, position sizing, home
  currency and currency views, and the required-discount table.
- **wisdom.md:** the maxims the investor decides by, each with an example of
  where it came from.
- **checklist.md:** questions that catch known ways of losing money, grown
  from past mistakes.
- **market.md:** the current view of the market cycle, which mostly shapes the
  bear case. It is dated and goes stale.

They are lenses, not gates. The analyst says where each bears on the company
and where it departs from one and why. The only hard rule is the required
discount: no `accumulate` above the entry price without a written reason.

## Keeping it current

- **A price refresh** updates the price, share count and exchange rates in
  the facts. The analysis can then be rerun without new research.
- **A report refresh** brings in a new quarterly or annual report and moves
  the facts' `asOf` date.
- The valuator warns when the price is old (`priceStale`) or when the case was
  written against older facts than the current ones (`casePredatesFacts`).

Each skill commits what it wrote to the data repo, with a subject such as
`research(ACME.STO): annual as of 2026-10-10` or `advice(ACME.STO): watching`.
Nothing is pushed automatically, and Kosing never trades. It has no ledger,
holdings or broker data beyond what you state in `positions.md`.

## Running it yourself

In Claude Code, ask in plain words ("research Atlas Copco", "should I buy more
Acme?") and the skills take over. The CLI underneath:

```
npm run kosing -- where [ID]                    the data repo, or one company's directory
npm run kosing -- value <ID>                    value one company; writes its results.json
npm run kosing -- value --facts F [--case C]    value given files; results on stdout
npm run kosing -- schema facts | case           the JSON Schema for a document
```

Exit codes: 0 success, 1 the documents do not decode (errors as JSON on
stderr), 2 a usage or `DATA_PATH` error, 3 `results.json` could not be
written.
