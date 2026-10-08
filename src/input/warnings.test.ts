import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFixture, mutate } from "../test-fixtures.ts";
import { decode } from "./decode.ts";

test("a clean pair produces no warnings", () => {
  const result = decode(loadFixture("acme.facts"), loadFixture("acme-dcf.case"));
  assert.ok(result.success, JSON.stringify(result.error));
  assert.deepEqual(result.data.warnings, []);
});

test("a case written against older facts warns at factsAsOf", () => {
  const stale = mutate(loadFixture("acme-dcf.case"), "factsAsOf", "2026-06-01");
  const result = decode(loadFixture("acme.facts"), stale);
  assert.ok(result.success);
  assert.deepEqual(
    result.data.warnings.map((w) => [w.rule, w.path]),
    [["casePredatesFacts", "factsAsOf"]],
  );
});

test("an ltm row older than the latest fiscal year warns", () => {
  const old = mutate(loadFixture("acme.facts"), "financials.ltm.endDate", "2025-06-30");
  const result = decode(old);
  assert.ok(result.success);
  assert.deepEqual(
    result.data.warnings.map((w) => w.rule),
    ["ltmOlderThanFiscalYear"],
  );
});
