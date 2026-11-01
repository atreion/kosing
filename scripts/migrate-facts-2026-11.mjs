// One-off: adds the facts keys introduced 2026-11-01 to a facts.json, with
// neutral values. Usage: node scripts/migrate-facts-2026-11.mjs <facts.json>...
import { readFileSync, writeFileSync } from "node:fs";

function insertAfter(object, afterKey, entries) {
  const out = {};
  for (const [k, v] of Object.entries(object)) {
    out[k] = v;
    if (k === afterKey) Object.assign(out, entries);
  }
  return out;
}

const ADDED = "Field added 2026-11-01; filled at the company's next report refresh.";

function migrate(facts) {
  const fi = facts.financialInstitution != null;
  const withLease = (row) =>
    "leasePayments" in row ? row : insertAfter(row, "dividendsPaid", { leasePayments: null });
  const financials = {
    ...facts.financials,
    fiscalYears: facts.financials.fiscalYears.map(withLease),
  };
  if (financials.ltm) financials.ltm = withLease(financials.ltm);
  const financialsOut =
    "basisChanges" in financials
      ? financials
      : insertAfter(financials, "fiscalYears", { basisChanges: [] });
  const balanceSheet =
    "cashAfterBalanceSheet" in facts.balanceSheet
      ? facts.balanceSheet
      : insertAfter(facts.balanceSheet, "dividendPayable", {
          cashAfterBalanceSheet: 0,
          nonControllingInterests: null,
        });
  const market =
    "dividendPerShareRunRate" in facts.market
      ? facts.market
      : insertAfter(facts.market, "week52Low", { dividendPerShareRunRate: null });
  const gaps = [...(facts.gaps ?? [])];
  const has = (field) => gaps.some((g) => g.field === field);
  if (!has("financials.*.leasePayments"))
    gaps.push({ field: "financials.*.leasePayments", reason: ADDED });
  if (!fi && !has("balanceSheet.nonControllingInterests"))
    gaps.push({ field: "balanceSheet.nonControllingInterests", reason: ADDED });
  return { ...facts, market, financials: financialsOut, balanceSheet, gaps };
}

for (const path of process.argv.slice(2)) {
  const facts = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, `${JSON.stringify(migrate(facts), null, 2)}\n`);
  console.log(path);
}
