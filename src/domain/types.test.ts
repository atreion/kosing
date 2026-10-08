import assert from "node:assert/strict";
import { test } from "node:test";
import { BASIS_VALUES, CLASSIFICATIONS, isNonEmpty, UNIT_VALUES } from "./types.ts";

test("closed sets carry their members at runtime", () => {
  assert.deepEqual([...BASIS_VALUES], ["listed", "unlisted"]);
  assert.deepEqual([...UNIT_VALUES], ["millions", "thousands", "ones"]);
  assert.equal(CLASSIFICATIONS.length, 9);
  assert.ok(CLASSIFICATIONS.includes("specialSituation"));
  assert.ok(
    CLASSIFICATIONS.every((c) => !c.includes("_")),
    "classification values are camelCase",
  );
});

test("isNonEmpty narrows an array", () => {
  const empty: readonly number[] = [];
  const full: readonly number[] = [1, 2];
  assert.equal(isNonEmpty(empty), false);
  assert.equal(isNonEmpty(full), true);
});
