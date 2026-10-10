# Findings from the first two company runs

The first real runs of the researcher, analyst and advisor skills, on Wolters
Kluwer (WKL.AMS) and SAP (SAP.ETR) on 2026-10-10, and the two whole-branch
reviews around them. Each finding says what was observed, where, what it does
to a reader of the results, and what happened to it. "Fix pass" means the
2026-10-10 fix pass that follows this document.

## Findings that change a verdict

| Id | Finding | Where | Effect | Disposition |
| --- | --- | --- | --- | --- |
| F1 | A `dcf` case has only a base case. The market outlook asks for a bear case with pricing or retention erosion on disruption names, and checklist V1 ("does the bear case survive at the current price?") was unanswerable on both companies. The invest workbench carries bear, base and bull. | `src/input/case.ts`, `src/domain/valuation.ts`, `src/results/` | The advisor cannot test the downside the outlook says matters most. | Fix pass: optional bear and bull scenarios on the `dcf` method. |
| F2 | The researcher brief omits the market outlook's instruction for software names: moat type (system of record or application layer), seat counts, retention, revenue by pricing model. | `researching-company/references/researcher-brief.md` | SAP's AI-substitution question failed with no revenue share to report. | Fix pass: brief section for software names. |
| F3 | Results carry one WACC. When the researcher's beta check keeps the measured beta, the sector beta is lost, and SAP's clearance of the required discount flips between the two (0.76 clears, 0.96 does not). | `src/domain/company.ts`, `src/results/` | The advisor had to read the alternative off a sensitivity row by hand. | Fix pass: the DCF section reports value on the alternative beta. |

## Findings in the facts and case formats

| Id | Finding | Where | Effect | Disposition |
| --- | --- | --- | --- | --- |
| F4 | The LTM row and each estimates row carry one `sourceRef`, but an LTM row is built from two documents and consensus figures often come from several. | `src/input/facts.ts` | Consensus EBIT for WKL was left null; LTM provenance was incomplete. | Fix pass: `sourceRefs` on those rows. |
| F5 | Estimates carry no basis. SAP's consensus EBIT is non-IFRS while the facts' `ebit` is IFRS operating profit. | `src/input/facts.ts` | A reader compares unlike figures. | Fix pass: a `basis` on each estimates row. |
| F6 | `interestExpense` held SAP's positive net financial income; the name and the brief assume a cost. | `src/input/facts.ts` | Misleading field. Not read by the math. | Fix pass: renamed `netFinancialResult`, signed. |
| F7 | The case cannot state a normalised cash-flow tax rate. WKL's reported 20.7% is depressed by a tax-exempt gain against a 23.6% underlying rate. | `src/input/case.ts` | NOPAT overstated by about 2.9% of EBIT in the WKL case. | Fix pass: `overrides.taxRate` with a rationale, `dcf` only. |
| F8 | The reverse DCF and the current multiples run on reported LTM figures, which include one-off gains and acquired-intangible amortisation. | `src/select/reverse-dcf.ts`, `src/select/multiples.ts` | Multiples flatter and the reverse DCF is imprecise when one-offs are large. | Deferred: needs an adjusted-figures concept in the facts, which is a design question of its own. The advisor states the caveat meanwhile. |
| F9 | An FX exposure with a null cost share is revalued as if the share were zero. | `src/select/fx.ts` | FX rows overstate translation sensitivity badly (about ±26% for a ±10% USD move at WKL). | Fix pass: an exposure with an unknown share is reported as incomplete and not revalued. |
| F10 | The reverse DCF here (ten years of constant growth on the base period's reported ratios) is not the quantity invest reports (a five-plus-five-year fade on the case's paths). | `src/math/reverse-dcf.ts` | Numbers differ between the two tools by definition. | Recorded, no change: Kosing's definition is the textbook one the valuator spec states. |

## Findings in the skills and briefs

| Id | Finding | Where | Disposition |
| --- | --- | --- | --- |
| F11 | Shares outstanding are the last reported count, stale by buybacks disclosed since the period end. | researcher brief | Fix pass: subtract disclosed post-period repurchases, citing the notice. |
| F12 | The brief is silent on carrying versus nominal debt; two research agents chose differently. | researcher brief | Fix pass: carrying amount, as on the balance sheet. |
| F13 | The brief does not say where the statutory tax rate comes from (SAP's own 26.8% against a third-party 29.93%). | researcher brief | Fix pass: the company's own tax reconciliation when published. |
| F14 | Tertiary sources need a `gaps` entry, but the rule lived only in the source registry and was missed on WKL. | `researching-company/SKILL.md` | Fix pass: the rule moves into the workflow. |
| F15 | The skill assumes one writer of `S` ids; running research in parallel needed a manual merge of source lists. | `researching-company/SKILL.md` | Fix pass: a merge rule. |
| F16 | Price-to-book is meaningless after buybacks have shrunk book equity, and nothing says so. | researcher brief | Fix pass: a note for the brief. |
| F17 | The advisor template lacks the two-by-four or marginal call the wisdom's presentation rule puts first. | `advising-on-company/SKILL.md` | Fix pass. |
| F18 | The advisor is told to ask whether the user holds a name, but Kosing has no holdings data. | `advising-on-company/SKILL.md` | Fix pass: read the standing documents first, then ask. A holdings record belongs to the funnel spec. |
| F19 | `building-case` step 1 does not say what to do when an existing case fails on a rewrite. | `building-case/SKILL.md` | Fix pass. |

## Findings in the CLI

| Id | Finding | Where | Disposition |
| --- | --- | --- | --- |
| F20 | The not-a-directory and not-absolute messages do not name `.env.example`, which the skills spec asks for. | `src/data-path.ts` | Fix pass. |
| F21 | A broken `.env` (a directory, unreadable) makes every command fail, including `schema` and `value --facts`, which never need `DATA_PATH`. | `src/cli.ts` | Fix pass: `.env` is read only by commands that resolve `DATA_PATH`. |
| F22 | One CLI test does not assert an exit code; the end-to-end test leaks its temporary directory when an assertion fails. | `src/cli.test.ts`, `src/cli.e2e.test.ts` | Fix pass. |

## Findings in the data

| Id | Finding | Disposition |
| --- | --- | --- |
| F23 | The WKL case and advice say NOPAT is overstated by "about 3.7% of EBIT"; it is 2.9% of EBIT (3.7% of NOPAT). | Fix pass: corrected when the WKL case is rewritten for F1 and F7. |

## Findings from the review of the fix pass

| Id | Finding | Where | Disposition |
| --- | --- | --- | --- |
| F24 | Under a beta override, the alternative beta repeated the override, so the advisor would report two clearances on one beta. | `src/input/decode-valuation.ts` | Fixed: the alternative is the beta facts resolved, null when the override equals it. |
| F25 | Bear and bull paths that value in the wrong order passed silently. | `src/results/assemble.ts` | Fixed: a `scenarioOrderInverted` warning. |
| F26 | A broken `.env` still stops a `DATA_PATH` command even when the variable is set in the environment, and it does so with a stack trace. | `src/cli.ts` | Deferred: read `.env` only when the environment lacks the variable, and report a read error as exit 2. |
| F27 | No test covers an unresolved id inside `estimates[].sourceRefs`. | `src/input/facts.test.ts` | Deferred. |
| F28 | The FX selector checks the missing shares twice. | `src/select/fx.ts` | Deferred: return the narrowed shares from one helper. |
| F29 | The historical skills plan still describes `interestExpense`. | `docs/superpowers/plans/2026-10-10-skills.md` | Deferred: plans are a record of what was decided then; the brief governs. |
| F30 | Zod's message for a missing nullable key does not say that `null` is accepted, which is the first error a rewrite of an older case meets. | `src/input/errors.ts` | Deferred. |
| F31 | A research refresh cannot validate with `kosing value <ID>` while the company's existing case does not decode (for example after a format change), because the command decodes the case too. | `researching-company/SKILL.md`, `src/cli.ts` | Deferred: the researcher can validate with `kosing value --facts <path>`; a facts-only form of `value <ID>` would make that explicit. |
| F32 | A source dated only by year (a contract supplement, a fee schedule) cannot be recorded: `published` takes a date, a year-month or null. | `src/input/primitives.ts` | Deferred: null with the year in the title for now; a `YYYY` form would follow the `YYYY-MM` precedent. |
| F33 | A merge script committed facts that did not decode, because the commit was not gated on the decode result. The skill says to validate before committing; a script run by hand bypassed it. | process | Recorded: the next merge gates on the decode. |
| F34 | Kosing has no record of position size or cost, and the verdict vocabulary has no state for a fully sized position. A held name that is already full cannot be `accumulate` whatever the numbers say, and the advisor learned it only when the user said so. | `advising-on-company/SKILL.md`, the funnel | Deferred to the funnel spec: positions (held, size against target, cost) belong with the funnel and ledger, kept in the private data repo. Meanwhile the advisor records what the user states in `advice.md`. |
