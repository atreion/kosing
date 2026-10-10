# Kosing Skills Design

The three AI roles around the valuator, as Claude Code skills in this repo,
working over company documents in a separate private data repo. Builds on
`docs/superpowers/specs/2026-10-07-valuator-design.md`, which defines
`facts.json`, `case.json`, `results.json` and `kosing value`.

## Purpose

The valuator is built. What is missing is everything that produces its inputs
and reads its output: a researcher that writes `facts.json`, an analyst that
writes `case.json`, and an advisor that turns `results.json` into a verdict.
Until those exist, the only `facts.json` files are test fixtures.

Success is one real company run end to end: the researcher writes facts and
notes, the analyst writes a case, `kosing value` prices it, and the advisor
writes a verdict, all committed in the data repo. The user chooses the company
when the plan reaches that step.

## Scope

**In:**

- A private data repo holding company documents, the investor's standing
  documents and the theses register.
- `DATA_PATH`, read from the environment or a git-ignored `.env`, and two CLI
  forms that use it: `kosing value <ID>` and `kosing where [ID]`.
- Four skills in `.claude/skills/`: `researching-company`, `building-case`,
  `advising-on-company`, and the orchestrator `profiling-company`.

**Out, and why:**

- **The `../invest` repo is not changed in any way.** The user will run it as
  a comparison against the Kosing flow. Nothing in Kosing writes to invest's
  files or to its ledger.
- **The funnel, calendar, triggers and prices.** They stay with invest's
  ledger until a later spec gives Kosing its own. Until then a verdict lives in
  `advice.md` only; writing Kosing verdicts into invest's funnel would mix the
  two pipelines in the one place the comparison reads.
- **Screening, developing theses and sourcing expressions.** Sourcing exists to
  feed a funnel; the three skills come over with the funnel spec. The theses
  register itself is copied now, because the analyst cites it.
- **The required-discount hurdle in the valuator.** The advisor computes it
  from the wisdom table and shows its working. Moving it into results, with an
  AI-cycle exposure field on the case, is a later change to the valuator spec.
- **Methods the valuator lacks** (banks and insurers, REITs and utilities,
  pre-profit SaaS, commodity producers). The analyst writes no case for them;
  see "The analyst".

## Decisions

### Two repos

Code, schemas, skills and fixtures stay in this repo, which is treated as
publishable. Company documents, verdicts, the investor's standing documents and
the theses live in a separate private git repo, `kosing-data`, so research can
be shared across machines through git without becoming part of the code repo's
history.

### Copy, never move

The standing documents and the theses are copied from invest into
`kosing-data`. From then on the copy in `kosing-data` is the one Kosing reads
and edits; invest's copies stay as they are for comparison runs, and the two
are expected to drift.

### One skill per role, plus an orchestrator

Each role skill matches one document and its change cadence: facts can be
refreshed while a case stands (waiting for an entry price), and a case can be
rewritten without new research (a thesis falsified). Whoever writes the case
never grades it, and whoever grades it never edits facts or case.

### Paths live in code

Skills do not build paths from conventions written in prose. The CLI resolves
`DATA_PATH` and a company id, and skills ask it where things are.

## The data repo

```
<DATA_PATH>/
  README.md                       what lives here, the id rule, the commit rule
  standing/
    INVESTMENT_WISDOM.md          copied from invest unchanged
    INVESTMENT_CHECKLIST.md       copied unchanged
    MARKET_OUTLOOK.md             copied unchanged
    FX_CONTEXT.md                 copied unchanged
    METHODOLOGY.md                copied, with a header saying the valuator
                                  spec, not this file, defines the arithmetic
  theses/
    <slug>.thesis.md              copied from invest/theses unchanged
  companies/
    <TICKER>.<EXCHANGE>/          e.g. ACME.STO
      facts.json                  researcher
      research.md                 researcher
      case.json                   analyst; absent when no method applies
      results.json                kosing value; committed with the document
                                  that produced it, so a verdict records the
                                  numbers it saw
      advice.md                   advisor
```

**Commits.** Each skill commits the documents it wrote, with a conventional
subject naming the company: `research(ACME.STO): facts and notes as of
2026-10-10`, `case(ACME.STO): dcf, garp`, `advice(ACME.STO): watching`. Skills
never push; syncing across machines is the user's call.

**Creating it.** The plan creates the directory, runs `git init`, copies the
documents and makes the first commit. Creating the private remote is the
user's step.

## `DATA_PATH` and the CLI

### Resolution

`DATA_PATH` is an absolute path to the data repo. The CLI reads it from the
process environment first, then from `.env` at this repo's root, located from
the CLI module's own URL rather than the working directory. A variable already
in the environment wins over `.env`. Node 22 reads env files natively; no
dependency is added.

`.env` is git-ignored. `.env.example` is committed with the one key and a
comment.

There is no default. When a company-level command runs with `DATA_PATH` unset,
or set to a directory that does not exist, the CLI exits 2 with a message
naming the variable and `.env.example`. A default would bake one machine's
layout into the code and silently write to the wrong place on another.

Every company-level command prints the resolved data path to stderr, so a
`DATA_PATH` inherited from some other tool's environment is visible the first
time it misdirects.

### The company id

`<TICKER>.<EXCHANGE>`, split at the last dot, so a ticker that itself contains
a dot (`BRK.B.NYSE`) stays whole. Both parts are non-empty, contain no `/`, no
whitespace and no `..`, and the exchange is uppercase letters and digits. An
invalid id is a usage error, exit 2.

When `facts.json` is read, its `company.ticker` and `company.exchange` must
equal the id's parts. A mismatch is an error naming both, exit 1, so a
directory renamed by hand cannot price the wrong company.

### New forms

```
kosing where                    prints DATA_PATH
kosing where <ID>               prints <DATA_PATH>/companies/<ID>; the directory need not exist
kosing value <ID>               reads companies/<ID>/facts.json and, when present, case.json;
                                writes companies/<ID>/results.json; prints its path; exit 0
                                decode or id errors: DecodeError[] on stderr as JSON, exit 1,
                                and results.json is left untouched
```

The existing `kosing value --facts F [--case C]` and `kosing schema facts |
case` are unchanged. The CLI never touches git.

A failed `kosing value <ID>` leaves any earlier `results.json` in place.
Skills therefore treat exit 1 as "no current results" and never read
`results.json` after a failed run.

## The researcher: `researching-company`

Writes `facts.json` and `research.md` for one company. The only skill that does
web research feeding a company's documents.

1. Resolve the company to an id and run `kosing where <ID>`. An existing
   directory means a refresh; otherwise create it.
2. Run `kosing schema facts` and treat it as the contract. The skill restates
   the rules the JSON Schema cannot carry: every source reference resolves,
   fiscal years are distinct, the capital weights sum to 1, a trading currency
   that differs from the reporting currency needs its FX pair, and the
   resolved share count is not 0.
3. Research and write `facts.json`. Every key present; unknown is `null` and
   is also listed in `gaps` with a reason. Every figure cites a source, chosen
   by the source hierarchy, with its trust tier.
4. Write `research.md`: what the business does and how it makes money; moat
   and competition; management, ownership and governance; customers and
   revenue quality; risks; and the AI-cycle exposure level, one of `direct`,
   `picks_and_shovels`, `wealth_effect`, `disruption`, `second_order_only`,
   with the revenue share or customer concentration behind it. The exposure
   line is required: the advisor keys the required-discount add-on on it.
5. Run `kosing value <ID>`. With no case this is the screen, and it is how the
   researcher validates the facts: a decode error is fixed in the facts and the
   run repeated, never worked around.
6. Commit `facts.json`, `research.md` and `results.json`.

**Refreshes.** `price` (market block and the FX spot rates), `quarterly` (the
LTM row, market, estimates), `annual` (a new fiscal year, balance sheet, cost
of capital, plus everything quarterly covers), `governance` (the governance
section of `research.md` only). A refresh changes only what its scope covers
and moves `asOf`. Git history is the revision log.

**Carried from invest's researcher brief, into `references/researcher-brief.md`:**
the source hierarchy and trust tiers; the beta sanity check, now expressed as
leaving `betaCompany` null and supplying `betaSector`, which decode records as
`betaFromSector`; recording source conflicts (in `research.md`, under a
"Source conflicts" heading); the ban on verdicts, recommendations and computed
metrics. invest's `SOURCE_REGISTRY.md` is generic, not personal, and is copied
into `references/source-registry.md`.

**Dropped:** specialty-metric blocks (no method consumes them), assessment
inputs (they are the analyst's now), and the chat-output rules (the researcher
writes files; it does not return JSON in a reply).

## The analyst: `building-case`

Writes `case.json` for one company. No web research.

**Reads:** `facts.json`, `research.md`, `references/base-case.md` (invest
brief's "The base case" section: the honest central estimate, management
guidance weighted by delivery record, terminal growth argued per company, a
serial acquirer's redeployment credited, the fade curve derived rather than
copied, the one case for anchoring low), the relevant sections of
`standing/METHODOLOGY.md`, and the theses register by slug and status only.

1. **Classify.** The classification decides the method.

   | Classification | Method |
   | --- | --- |
   | `qualityCompounder`, `garp` | `dcf` |
   | `valueCyclical` | `normalisedEarnings` |
   | `holdingCompany` | `nav` |
   | `specialSituation` | one of the three, argued in `rationale` |
   | `bankInsurer`, `reitUtility`, `saasPreProfit`, `commodityProducer` | none |

   With no method, the analyst writes no case and says the valuator cannot
   value this name yet. The advisor reads a missing case as too hard, not as a
   failure.
2. **Cite theses.** List `theses/` by slug and front-matter `status`. Cite only
   `hardened` theses whose `last_tested` is within twelve months. Never open a
   thesis body: a case that reads the argument for its own thesis is grading
   itself.
3. **Write the case** against `kosing schema case`, with `factsAsOf` equal to
   the facts' `asOf`. Every assumption cites a source id already in the facts;
   when the source it needs is missing, hand back to the researcher rather than
   cite something absent. Overrides carry a rationale. `sensitivity` stays
   `null` unless there is a reason for another grid.
4. **Run `kosing value <ID>` once.** A decode error is fixed. An assumption
   changed after seeing the value needs a reason in `rationale` (an error
   found, a fact misread). Moving an assumption toward the price is tuning, and
   is forbidden.
5. **Sanity-check without a verdict:** terminal value's share of EV,
   `dcfUnavailable` or other resolutions, the sensitivity range, multiples
   against their bands. Concerns go into `rationale`; no buy or pass.
6. Commit `case.json` and `results.json`.

**When a case is rewritten:** the research changes the story, a cited thesis
is falsified or goes stale, or the facts have moved far enough that
`casePredatesFacts` fires and the analyst judges the assumptions affected. A
price refresh alone does not touch the case.

## The advisor: `advising-on-company`

Writes `advice.md` for one company. No web research; never edits facts or case.

**Reads:** the company's documents and `standing/INVESTMENT_WISDOM.md`,
`INVESTMENT_CHECKLIST.md`, `MARKET_OUTLOOK.md`, `FX_CONTEXT.md`.

1. **Freshness.** Run `kosing value <ID>` so the results match the current
   documents; on exit 1, stop and hand back to whichever role owns the failing
   file. Read every resolution and warning; `casePredatesFacts` is stated first.
2. **Checklist.** Run every applicable question. List each failed or
   unanswerable question by id; an unanswerable applicable question weighs
   toward pass or too hard.
3. **Required discount, with the working shown.** The classification's
   discount from the wisdom table plus the add-on for the exposure level in
   `research.md`. The table keys are invest's snake_case classifications; the
   advisor maps them to Kosing's camelCase ones and says so. Entry price = base
   value × (1 − required discount), where base value is the DCF value per
   share, the normalised-earnings base scenario, or the NAV value per share.
   State whether the current price clears it. With no case or `valuation:
   null` there is no base value: say so, and do not count it as a failure.
4. **Wisdom and outlook.** Apply them, and write the four-sentence idea. If an
   honest four sentences cannot be written, the verdict is too hard.
5. **Write `advice.md`** in this order: classification, the four-sentence idea,
   the verdict (`watching`, `accumulate`, `pass` or `tooHard`) with conviction,
   the required-discount working, checklist failures by id, the resolutions and
   warnings that matter, and what would change the verdict.
6. Commit `advice.md` and `results.json`.

**Rules carried from invest unchanged:** not clearing the required discount
bars `accumulate` unless an override reason is written in `advice.md`; clearing
it compels nothing, and the checklist and the four-sentence test still govern;
a `pass` names the failed question or how far the price missed.

## The orchestrator: `profiling-company`

Runs researcher, analyst and advisor for one name, skipping a stage whose
document is current: facts whose `asOf` is today or a date the user names; a
case whose `factsAsOf` equals the facts' `asOf`. Reports what the advisor
reports, plus which stages ran and which were reused.

## Test strategy

**Code.** The `DATA_PATH` resolution, the id parser, `kosing where` and
`kosing value <ID>` are tested like the rest of the CLI: in-process through
`runCli` with injected io, plus one end-to-end test that spawns the process
against a temporary data directory built from the fixtures. Cases: variable
from the environment, from `.env`, environment winning, unset, pointing at a
missing directory; ids with a dotted ticker, a slash, `..`, lowercase
exchange; ticker or exchange mismatch with the facts; a failed run leaving an
earlier `results.json` untouched.

**Skills.** Prose is not unit-tested. The skills are proved by the end-to-end
run on a real company that the plan ends with, judged by the user at the last
checkpoint, and by the comparison against invest that the user runs after.

## Repository changes

```
.env.example                          new
.gitignore                            gains .env
src/data-path.ts                      new: resolve DATA_PATH, parse ids, company paths
src/cli.ts                            where and value <ID>
.claude/skills/
  researching-company/SKILL.md
  researching-company/references/researcher-brief.md
  researching-company/references/source-registry.md
  building-case/SKILL.md
  building-case/references/base-case.md
  advising-on-company/SKILL.md
  profiling-company/SKILL.md
CLAUDE.md                             points at the skills and DATA_PATH
```

## Plans

One plan: the CLI changes, the data repo's creation, the four skills, and the
end-to-end run on a company the user names. Checkpoints after the CLI changes,
after the skills are written, and after the end-to-end run.

## Deferred, not rejected

- **A Kosing funnel**, with screening, developing theses and sourcing
  expressions brought over with it.
- **The hurdle in the valuator:** an AI-cycle exposure field on the case and
  the required discount, entry price and clearance in `results.json`.
- **A configurable data location beyond one variable**, such as several data
  repos or a remote store.
- **Methods for banks, REITs, pre-profit SaaS and commodity producers.**

## Risks

- **The advisor does arithmetic in prose.** The required discount is one
  multiplication, shown in full so it can be checked, but it is not tested
  code. It is the first candidate to move into the valuator.
- **Two copies of the standing documents drift.** Intended, for the
  comparison, but a correction made in one is not in the other.
- **A stale `results.json` after a failed run.** The CLI leaves it, and the
  skills' rule (never read results after exit 1) is what prevents a verdict on
  old numbers.
- **The first real `facts.json` will find schema friction** that fixtures did
  not. A schema change found there goes back through the valuator spec, not
  around it.
