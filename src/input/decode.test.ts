import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFixture, mutate, VALID_FIXTURES } from "../test-fixtures.ts";
import { decode } from "./decode.ts";

const pairs: readonly [string, string][] = [
  ["acme.facts", "acme-dcf.case"],
  ["acme.facts", "acme-normalised.case"],
  ["holdco.facts", "holdco-nav.case"],
];

for (const [f, c] of pairs) {
  test(`${f} + ${c} decodes`, () => {
    const result = decode(loadFixture(f), loadFixture(c));
    assert.ok(result.success, JSON.stringify(result.error));
    assert.notEqual(result.data.valuation, null);
    const expected = loadFixture(c) as { classification: string; aiExposure: string };
    assert.equal(result.data.classification, expected.classification);
    assert.equal(result.data.aiExposure, expected.aiExposure);
  });
}

for (const f of VALID_FIXTURES.facts) {
  test(`${f} decodes alone, with no valuation and empty theses`, () => {
    const result = decode(loadFixture(f));
    assert.ok(result.success, JSON.stringify(result.error));
    assert.equal(result.data.valuation, null);
    assert.equal(result.data.classification, null);
    assert.equal(result.data.aiExposure, null);
    assert.deepEqual(result.data.theses, []);
  });
}

test("theses pass through untouched", () => {
  const result = decode(loadFixture("acme.facts"), loadFixture("acme-dcf.case"));
  assert.deepEqual(result.data?.theses, ["ai-disruption-overreaction", "eu-digital-sovereignty"]);
});

test("schema errors from both files are reported together, with file and dotted path", () => {
  const badFacts = mutate(loadFixture("acme.facts"), "market.price", -1);
  const badCase = mutate(loadFixture("acme-dcf.case"), "method.revenueGrowthPath", [0.05]);
  const result = decode(badFacts, badCase);
  assert.equal(result.success, false);
  assert.deepEqual(
    result.error?.map((e) => [e.file, e.layer, e.path]),
    [
      ["facts", "schema", "market.price"],
      ["case", "schema", "method.revenueGrowthPath"],
    ],
  );
});

test("a non-object input is a schema error at the root", () => {
  const result = decode("not json at all");
  assert.equal(result.success, false);
  assert.equal(result.error?.[0]?.file, "facts");
  assert.equal(result.error?.[0]?.path, "");
});

test("resolutions from both decoders are concatenated in order", () => {
  const result = decode(loadFixture("acme.facts"), loadFixture("acme-normalised.case"));
  assert.ok(result.success);
  assert.deepEqual(
    result.data.resolutions.map((r) => r.kind),
    ["betaFromSector", "netDebtDerived", "revenueBaseAveraged"],
  );
});

test("caseFactsAsOf is echoed from the case and null without one", () => {
  const withCase = decode(loadFixture("acme.facts"), loadFixture("acme-dcf.case"));
  assert.equal(withCase.data?.caseFactsAsOf, "2026-10-01");
  const alone = decode(loadFixture("acme.facts"));
  assert.equal(alone.data?.caseFactsAsOf, null);
});
