import assert from "node:assert/strict";
import { test } from "node:test";
import type { IsoDate } from "../domain/types.ts";
import { loadFixture, mutate } from "../test-fixtures.ts";
import { decode } from "./decode.ts";

const asOf = (d: string) => d as IsoDate;

function rules(facts: unknown, date: string): string[] {
  const r = decode(facts, undefined, asOf(date));
  return r.success ? [] : r.error.map((e) => e.rule);
}

test("facts whose every source and date precede the as-of date pass", () => {
  assert.deepEqual(rules(loadFixture("acme.facts"), "2026-10-15"), []);
});

test("a source published after the as-of date is rejected with its path", () => {
  const r = decode(loadFixture("acme.facts"), undefined, asOf("2026-10-15"));
  assert.ok(r.success);
  const late = mutate(loadFixture("acme.facts"), "sources.0.published", "2026-10-20");
  const failed = decode(late, undefined, asOf("2026-10-15"));
  assert.ok(!failed.success);
  assert.ok(
    failed.error.some(
      (e) => e.rule === "pointInTime.sourcePublishedAfter" && e.path === "sources.0.published",
    ),
  );
});

test("a month-only publication date counts as published within its month", () => {
  const monthly = mutate(loadFixture("acme.facts"), "sources.0.published", "2026-10");
  assert.deepEqual(rules(monthly, "2026-10-15"), []);
  assert.ok(rules(monthly, "2026-09-30").includes("pointInTime.sourcePublishedAfter"));
});

test("an undated source other than a price feed is rejected", () => {
  const facts = loadFixture("acme.facts") as { sources: { kind: string; published: unknown }[] };
  const i = facts.sources.findIndex((s) => s.kind !== "marketDataFeed");
  const undated = mutate(facts, `sources.${i}.published`, null);
  assert.ok(rules(undated, "2026-10-15").includes("pointInTime.sourceUndated"));
});

test("a price, report period or balance sheet dated after the as-of date is rejected", () => {
  assert.ok(rules(loadFixture("acme.facts"), "2026-09-30").includes("pointInTime.datedAfter"));
});

test("without an as-of date nothing is checked", () => {
  const late = mutate(loadFixture("acme.facts"), "sources.0.published", "2030-01-01");
  assert.ok(decode(late).success);
});
