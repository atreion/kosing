import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Gap,
  Iso4217,
  IsoDateString,
  RangeBand,
  ScenarioTriple,
  SourceEntry,
  SourceId,
  SourceRefs,
  TenNumberPath,
  YearMonth,
} from "./primitives.ts";

test("iso4217 accepts three uppercase letters only", () => {
  assert.equal(Iso4217.safeParse("SEK").success, true);
  assert.equal(Iso4217.safeParse("sek").success, false);
  assert.equal(Iso4217.safeParse("SEKK").success, false);
});

test("isoDate accepts YYYY-MM-DD only", () => {
  assert.equal(IsoDateString.safeParse("2026-10-07").success, true);
  assert.equal(IsoDateString.safeParse("2026-10").success, false);
  assert.equal(IsoDateString.safeParse("2026-10-07T00:00:00Z").success, false);
});

test("yearMonth accepts YYYY-MM only", () => {
  assert.equal(YearMonth.safeParse("2026-01").success, true);
  assert.equal(YearMonth.safeParse("2026-13").success, false);
  assert.equal(YearMonth.safeParse("2026").success, false);
});

test("tenNumberPath requires exactly ten numbers", () => {
  const ten = Array.from({ length: 10 }, (_, i) => i);
  assert.equal(TenNumberPath.safeParse(ten).success, true);
  assert.equal(TenNumberPath.safeParse(ten.slice(1)).success, false);
});

test("scenarioTriple rejects unknown keys", () => {
  assert.equal(ScenarioTriple.safeParse({ bear: 1, base: 2, bull: 3 }).success, true);
  assert.equal(ScenarioTriple.safeParse({ bear: 1, base: 2, bull: 3, mid: 2 }).success, false);
});

test("rangeBand requires every key, each nullable", () => {
  assert.equal(
    RangeBand.safeParse({ y5Low: 1, y5High: 2, y10Low: null, y10High: null }).success,
    true,
  );
  assert.equal(RangeBand.safeParse({ y5Low: 1, y5High: 2 }).success, false);
});

test("a source id is S followed by digits and refs need at least one", () => {
  assert.equal(SourceId.safeParse("S12").success, true);
  assert.equal(SourceId.safeParse("source-1").success, false);
  assert.equal(SourceRefs.safeParse(["S1"]).success, true);
  assert.equal(SourceRefs.safeParse([]).success, false);
});

const source = {
  id: "S1",
  kind: "annualReport",
  issuer: "Acme Industrial AB",
  title: "Annual Report 2025",
  url: "https://acme.example/ar2025.pdf",
  published: "2026-02-12",
  retrieved: "2026-10-01",
  pages: "48-51",
  tier: "primary",
};

test("a source entry parses, and published may be a year-month or null", () => {
  assert.equal(SourceEntry.safeParse(source).success, true);
  assert.equal(SourceEntry.safeParse({ ...source, published: "2026-01" }).success, true);
  assert.equal(SourceEntry.safeParse({ ...source, published: null }).success, true);
  assert.equal(SourceEntry.safeParse({ ...source, published: "Jan 2026" }).success, false);
});

test("a source entry's kind and tier are closed, and no key may be absent", () => {
  assert.equal(SourceEntry.safeParse({ ...source, kind: "blogPost" }).success, false);
  assert.equal(SourceEntry.safeParse({ ...source, tier: "quaternary" }).success, false);
  const { pages: _p, ...missing } = source;
  assert.equal(SourceEntry.safeParse(missing).success, false);
});

test("a gap names a field and a reason", () => {
  assert.equal(Gap.safeParse({ field: "financials.ltm", reason: "not reported" }).success, true);
  assert.equal(Gap.safeParse({ field: "", reason: "x" }).success, false);
});
