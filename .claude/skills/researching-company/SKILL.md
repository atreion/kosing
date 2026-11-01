---
name: researching-company
description: Research a listed company into Kosing's facts.json and research.md, or refresh them. Use when the user asks to research a company, refresh its price or filings, or repair facts that kosing value rejects.
---

# Researching Company

Run commands from the Kosing repo root.

1. The id is `TICKER.EXCHANGE` as the exchange quotes it, for example
   `SAP.ETR`. `D="$(npm run --silent kosing -- where <ID>)"` prints the
   company's directory; create it if it does not exist.
2. `npm run --silent kosing -- schema facts --flat` is the contract,
   conventions included, one line per field. Read it once. Fill
   `$D/facts.json` from the company's own filings first. Every figure cites a
   source; what you cannot source is null with a gap.

   Do not read documents yourself. Dispatch `extracting-filing` agents in
   parallel, in one message: one per filing (the latest annual report, the
   annual report three years earlier for the older years, each interim report
   of the current year, the latest earnings release), and one each for the
   small-page batches (price and price history; risk-free rate, Damodaran,
   beta and FX; peers and consensus). A brief names the company id, the
   document, the facts paths with the periods wanted, and any research.md
   topics. Agents report values as printed; you apply the schema's signs and
   `unit`.

   Two cost-of-capital rules are where facts have gone wrong. A company beta
   is a published five-year beta with its provider and window, never a
   regression you or an agent ran; without one, use the sector beta.
   Damodaran's tables come from `$DATA/reference/damodaran`, never a guess
   when his site is slow.

   Each returns JSON with a verbatim quote per statement line, misses and
   flags. Read every flag. Check each value against its quote (period,
   group versus segment). Give each document the next `S` id. Re-dispatch for
   a miss rather than opening the document. Write `facts.json` with a script
   that holds the values, derives the LTM from the annual and year-to-date
   figures, and lists a gap for every null, so figures are not re-typed
   through the conversation. Never Read a file under `tool-results/`; grep
   it.
3. Write `$D/research.md`: what the business does and how it makes money, its
   moat and competition, management, customers, risks, and its exposure to the
   AI cycle, from the agents' notes. Cite the same source ids. Describe what you find; judging the
   stock is the analyst's job.
4. Run `npm run --silent kosing -- value --facts "$D/facts.json" >/dev/null` and fix what
   it reports until it exits 0.
5. `git -C "$D" add facts.json research.md && git -C "$D" commit -m "research(<ID>): <created|price|quarterly|annual> as of <asOf>"`.
   If an agent added a Damodaran edition to `reference/damodaran`, commit
   that separately as its README says.

A refresh keeps every value it does not touch. A price refresh changes
`market` and `fx.spotRates` and moves only `market.asOf`; a report refresh
also moves the document's `asOf`.
