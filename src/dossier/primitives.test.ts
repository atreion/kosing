import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Iso4217,
  IsoDateString,
  RevisionEntry,
  ScenarioTriple,
  SourceEntry,
  TenNumberPath,
} from "./primitives.ts";

test("iso4217 accepts three uppercase letters only", () => {
  assert.equal(Iso4217.safeParse("SEK").success, true);
  assert.equal(Iso4217.safeParse("sek").success, false);
  assert.equal(Iso4217.safeParse("SEKK").success, false);
});

test("isoDate accepts YYYY-MM-DD only", () => {
  assert.equal(IsoDateString.safeParse("2026-10-07").success, true);
  assert.equal(IsoDateString.safeParse("2026-10-07T00:00:00Z").success, false);
  assert.equal(IsoDateString.safeParse("07/10/2026").success, false);
});

test("tenNumberPath requires exactly ten numbers", () => {
  const ten = Array.from({ length: 10 }, (_, i) => i);
  assert.equal(TenNumberPath.safeParse(ten).success, true);
  assert.equal(TenNumberPath.safeParse(ten.slice(1)).success, false);
});

test("scenarioTriple rejects unknown keys", () => {
  assert.equal(ScenarioTriple.safeParse({ bear: 1, base: 2, bull: 3 }).success, true);
  assert.equal(ScenarioTriple.safeParse({ bear: 1, base: 2, bull: 3, baseline: 2 }).success, false);
});

const source = {
  id: "S1",
  kind: "annual_report",
  issuer: "Volvo AB",
  title: "Annual and Sustainability Report 2025",
  url: "https://www.volvogroup.com/ar2025.pdf",
  publication_date: "2026-02-12",
  retrieved: "2026-10-01",
  pages: "48-51",
  trust_tier: "primary",
};

test("a source entry parses with every property present", () => {
  assert.equal(SourceEntry.safeParse(source).success, true);
});

test("a source entry parses without its optional properties", () => {
  const { publication_date: _p, pages: _pages, ...required } = source;
  assert.equal(SourceEntry.safeParse(required).success, true);
});

test("a publication date may be a year-month, which two real sources are", () => {
  assert.equal(SourceEntry.safeParse({ ...source, publication_date: "2026-01" }).success, true);
  assert.equal(SourceEntry.safeParse({ ...source, publication_date: null }).success, true);
});

test("a publication date that is neither a date nor a year-month is rejected", () => {
  assert.equal(SourceEntry.safeParse({ ...source, publication_date: "Jan 2026" }).success, false);
  assert.equal(SourceEntry.safeParse({ ...source, publication_date: "2026-13" }).success, false);
  assert.equal(SourceEntry.safeParse({ ...source, publication_date: "2026" }).success, false);
});

test("the looser shape is confined to publication_date, not to IsoDateString", () => {
  assert.equal(IsoDateString.safeParse("2026-01").success, false);
  assert.equal(SourceEntry.safeParse({ ...source, retrieved: "2026-01" }).success, false);
});

test("a source id must be S followed by digits", () => {
  assert.equal(SourceEntry.safeParse({ ...source, id: "source-1" }).success, false);
});

test("a source kind outside the enum is rejected", () => {
  assert.equal(SourceEntry.safeParse({ ...source, kind: "blog_post" }).success, false);
});

test("a revision entry parses and its kind is closed", () => {
  const revision = {
    revision: 2,
    as_of: "2026-10-01",
    kind: "price_refresh",
    fields_changed: ["market_data", "multiples", "data_as_of"],
    trigger: "weekly price refresh",
  };
  assert.equal(RevisionEntry.safeParse(revision).success, true);
  assert.equal(RevisionEntry.safeParse({ ...revision, kind: "rewrite" }).success, false);
});
