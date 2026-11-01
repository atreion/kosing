---
name: researching-company
description: Research a listed company into Kosing's facts.json and research.md, or refresh them. Use when the user asks to research a company, refresh its price or filings, or repair facts that kosing value rejects.
---

# Researching Company

Run commands from the Kosing repo root.

1. The id is `TICKER.EXCHANGE` as the exchange quotes it, for example
   `SAP.ETR`. `D="$(npm run --silent kosing -- where <ID>)"` prints the
   company's directory; create it if it does not exist.
2. `npm run --silent kosing -- schema facts` is the contract, conventions
   included. Read it once. Fill `$D/facts.json` from the company's own filings
   first. Every figure cites a source; what you cannot source is null with a
   gap.

   Do not read filings yourself. Dispatch one `extracting-filing` agent per
   document (annual report, latest interim report, price, FX, peers), in
   parallel, each with the company id, the document, the facts paths it should
   fill and any topics for research.md notes. Each returns figures with a
   verbatim quote and page, and the misses. Check each value against its quote
   (scale, period, group versus segment), give each document the next `S` id,
   and convert to the facts `unit` yourself. Re-dispatch for a miss rather
   than opening the document. Never Read a file under `tool-results/`; grep
   it.
3. Write `$D/research.md`: what the business does and how it makes money, its
   moat and competition, management, customers, risks, and its exposure to the
   AI cycle, from the agents' notes. Cite the same source ids. Describe what you find; judging the
   stock is the analyst's job.
4. Run `npm run --silent kosing -- value --facts "$D/facts.json" >/dev/null` and fix what
   it reports until it exits 0.
5. `git -C "$D" add facts.json research.md && git -C "$D" commit -m "research(<ID>): <created|price|quarterly|annual> as of <asOf>"`

A refresh keeps every value it does not touch. A price refresh changes
`market` and `fx.spotRates` and moves only `market.asOf`; a report refresh
also moves the document's `asOf`.
