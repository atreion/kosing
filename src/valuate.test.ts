import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFixture, mutate } from "./test-fixtures.ts";
import { valuate } from "./valuate.ts";

test("valuate runs decode and assemble in-process", () => {
  const r = valuate(loadFixture("acme.facts"), loadFixture("acme-dcf.case"));
  assert.ok(r.success);
  assert.equal(r.data.valuation?.method, "dcf");
});

test("decode errors come back unchanged", () => {
  const r = valuate(mutate(loadFixture("acme.facts"), "market.price", -1));
  assert.equal(r.success, false);
  assert.equal(r.error?.[0]?.path, "market.price");
});

test("options reach the reverse dcf", () => {
  const r = valuate(loadFixture("acme.facts"), undefined, {
    reverseDcf: { horizonYears: 5, terminalGrowth: 0.01 },
    fxMoves: [0.1],
    valuedOn: null,
    pointInTime: false,
  });
  assert.equal(r.data?.pricedIn.reverseDcf?.horizonYears, 5);
  assert.equal(r.data?.pricedIn.reverseDcf?.terminalGrowth, 0.01);
});
