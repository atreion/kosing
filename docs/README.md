# Kosing documentation

This is the guide for people. It explains what Kosing is, how a company moves
through it, and the finance behind the numbers it produces. It assumes no
background in valuation; it is meant to work as a short course in value
investing, using Kosing as the worked example.

The skills, the schemas and `CLAUDE.md` are what the agents read. Nothing here
is an instruction to them, and nothing here overrides them: when this guide and
the code disagree, the code is right and this guide is out of date.

Finance reuses words: "discount", "base", "case" and "position" each have
more than one meaning, and Kosing uses several of them. Where a word could be
read two ways, a note in the text says which meaning is in use.

## Reading order

1. [Value investing in brief](value-investing.md): price and value, the margin
   of safety, and why Kosing splits math from judgement.
2. [The workflow](workflow.md): research, case, valuation and advice, who
   does each step, and where the files live.
3. [The documents](documents.md): `facts.json`, `case.json`, `results.json`
   and the two prose documents, and why facts and case are kept apart.
4. [Cost of capital](cost-of-capital.md): WACC, CAPM, beta and the other
   inputs that set the discount rate, and why small changes to them matter.
5. [The valuation math](valuation.md): DCF, reverse DCF, scenarios,
   sensitivity, multiples, the methods for cyclicals, holding companies and
   banks, and the required discount.

[Design specs and plans](superpowers/) are the history of how Kosing was built.
They are not needed to use it.

## The running example

The numbers in this guide come from Acme Industrial AB, a fictional company in
the test fixtures (`tests/fixtures/valid/acme.facts.json` and
`acme-dcf.case.json`). You can reproduce every figure:

```
npm run kosing -- value --facts tests/fixtures/valid/acme.facts.json \
  --case tests/fixtures/valid/acme-dcf.case.json
```

Acme reports in millions of SEK, trades at SEK 212 with 115 million diluted
shares, had LTM revenue of SEK 11,400m and EBIT of SEK 1,380m, and carries
SEK 2,000m of net debt.
