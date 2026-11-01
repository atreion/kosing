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

test("a company beta far from its sector's warns, inside the band it does not", () => {
  const facts = mutate(
    mutate(loadFixture("acme.facts"), "costOfCapital.betaSector", 1.0),
    "costOfCapital.betaCompany",
    0.5,
  );
  const low = decode(facts);
  assert.ok(low.success);
  assert.deepEqual(
    low.data.warnings.map((w) => [w.rule, w.path]),
    [["betaFarFromSector", "costOfCapital.betaCompany"]],
  );
  const near = decode(mutate(facts, "costOfCapital.betaCompany", 1.3));
  assert.ok(near.success);
  assert.deepEqual(near.data.warnings, []);
  const noCompany = decode(mutate(facts, "costOfCapital.betaCompany", null));
  assert.ok(noCompany.success);
  assert.deepEqual(noCompany.data.warnings, []);
});
