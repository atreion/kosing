import assert from "node:assert/strict";
import { test } from "node:test";
import { CaseSchema } from "./input/case.ts";
import { FactsSchema } from "./input/facts.ts";
import { loadFixture, mutate, VALID_FIXTURES } from "./test-fixtures.ts";

for (const name of VALID_FIXTURES.facts) {
  test(`${name} is a valid facts document`, () => {
    const result = FactsSchema.safeParse(loadFixture(name));
    assert.ok(result.success, JSON.stringify(result.error?.issues.slice(0, 3)));
  });
}

for (const name of VALID_FIXTURES.cases) {
  test(`${name} is a valid case document`, () => {
    const result = CaseSchema.safeParse(loadFixture(name));
    assert.ok(result.success, JSON.stringify(result.error?.issues.slice(0, 3)));
  });
}

test("mutate replaces one path and leaves the original untouched", () => {
  const original = { a: { b: [1, 2] }, c: 3 };
  const changed = mutate(original, "a.b.1", 9);
  assert.deepEqual(changed, { a: { b: [1, 9] }, c: 3 });
  assert.deepEqual(original, { a: { b: [1, 2] }, c: 3 });
  assert.deepEqual(mutate(original, "c", "__delete__"), { a: { b: [1, 2] } });
});
