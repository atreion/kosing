import assert from "node:assert/strict";
import { test } from "node:test";
import { FinancialRow, QuarterlyRow } from "./financials.ts";

const fiscal = {
  is_ltm: false,
  fy: 2025,
  fy_end_date: "2025-12-31",
  currency: "SEK",
  unit: "millions",
  revenue: 1000,
  ebit: 120,
  net_income: 90,
  source_ref: "S1",
};

test("a fiscal row parses", () => {
  assert.equal(FinancialRow.safeParse(fiscal).success, true);
});

test("an ltm row carrying an fy is rejected", () => {
  const bad = { ...fiscal, is_ltm: true, fy: 2025 };
  const result = FinancialRow.safeParse(bad);
  assert.equal(result.success, false);
  assert.ok(result.error?.issues.some((i) => i.path.includes("fy")));
});

test("an ltm row with a null fy parses", () => {
  assert.equal(FinancialRow.safeParse({ ...fiscal, is_ltm: true, fy: null }).success, true);
});

test("a fiscal row without an fy is rejected", () => {
  const { fy: _fy, ...bad } = fiscal;
  assert.equal(FinancialRow.safeParse(bad).success, false);
});

test("a fiscal row with a null fy is rejected", () => {
  assert.equal(FinancialRow.safeParse({ ...fiscal, fy: null }).success, false);
});

test("a row without a unit is rejected", () => {
  const { unit: _unit, ...bad } = fiscal;
  assert.equal(FinancialRow.safeParse(bad).success, false);
});

test("an fy outside the schema's range is rejected", () => {
  assert.equal(FinancialRow.safeParse({ ...fiscal, fy: 1899 }).success, false);
  assert.equal(FinancialRow.safeParse({ ...fiscal, fy: 2201 }).success, false);
  assert.equal(FinancialRow.safeParse({ ...fiscal, fy: 2025.5 }).success, false);
});

test("a negative share count is rejected", () => {
  assert.equal(FinancialRow.safeParse({ ...fiscal, shares_basic_m: -1 }).success, false);
  assert.equal(FinancialRow.safeParse({ ...fiscal, shares_diluted_m: null }).success, true);
});

test("a misspelled field is an error rather than silently dropped", () => {
  assert.equal(FinancialRow.safeParse({ ...fiscal, revenu: 1000 }).success, false);
});

const quarter = {
  fq: "2026Q2",
  fq_end_date: "2026-06-30",
  is_ltm: false,
  currency: "SEK",
  unit: "millions",
  revenue: 260,
  source_ref: "S1",
};

test("a quarterly row parses", () => {
  assert.equal(QuarterlyRow.safeParse(quarter).success, true);
});

test("a quarterly row's fq must be YYYYQn", () => {
  assert.equal(QuarterlyRow.safeParse({ ...quarter, fq: "2026-Q2" }).success, false);
  assert.equal(QuarterlyRow.safeParse({ ...quarter, fq: "2026Q5" }).success, false);
});

test("a quarterly row can never be the ltm row", () => {
  assert.equal(QuarterlyRow.safeParse({ ...quarter, is_ltm: true }).success, false);
});
