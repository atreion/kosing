import assert from "node:assert/strict";
import { test } from "node:test";
import type { Results } from "../results/types.ts";
import { loadFixture } from "../test-fixtures.ts";
import { valuate } from "../valuate.ts";
import { buildReportModel, parseVerdict } from "./model.ts";
import { renderReport } from "./render.ts";

function acmeResults(caseName: string): Results {
  const r = valuate(loadFixture("acme.facts"), loadFixture(caseName));
  if (!r.success) throw new Error(JSON.stringify(r.error));
  return r.data;
}

test("the verdict and conviction come from the first bold verdict line", () => {
  assert.deepEqual(parseVerdict("# X\n\n**Verdict: `watching`, conviction medium. Entry**"), {
    label: "watching",
    conviction: "medium",
  });
  assert.deepEqual(parseVerdict("**Verdict: `pass`.** Conviction: high on the business"), {
    label: "pass",
    conviction: "high",
  });
  assert.equal(parseVerdict("no verdict here"), null);
});

test("a dcf report carries the projection after the reported years with growth from the base", () => {
  const results = acmeResults("acme-dcf.case");
  const model = buildReportModel(results, null);
  const reported = model.history.filter((p) => p.kind === "reported");
  const projected = model.history.filter((p) => p.kind === "case");
  assert.ok(reported.length > 0);
  assert.equal(
    projected.length,
    results.valuation?.method === "dcf" ? results.valuation.projection.length : -1,
  );
  assert.deepEqual(
    model.history.map((p) => p.kind),
    [...reported.map(() => "reported"), ...projected.map(() => "case")],
  );
  assert.ok(projected.every((p) => p.growth !== null));
  assert.notEqual(model.composition, null);
});

test("a normalised-earnings report has its three scenarios and no projection", () => {
  const model = buildReportModel(acmeResults("acme-normalised.case"), null);
  assert.ok(model.values !== null && model.values.bear !== null && model.values.bull !== null);
  assert.ok(model.history.every((p) => p.kind === "reported"));
  assert.equal(model.composition, null);
});

test("the page renders the advice and escapes the company name", () => {
  const results = acmeResults("acme-dcf.case");
  const named: Results = {
    ...results,
    inputs: {
      ...results.inputs,
      company: {
        ...results.inputs.company,
        identity: { ...results.inputs.company.identity, name: "A&B <Corp>" },
      },
    },
  };
  const html = renderReport(buildReportModel(named, "**Verdict: `accumulate`**\n\n## Why\n\ntext"));
  assert.match(html, /A&amp;B &lt;Corp&gt;/);
  assert.match(html, /<span class="pill pill-verdict">accumulate<\/span>/);
  assert.match(html, /<h2>Why<\/h2>/);
  assert.doesNotMatch(html, /NaN|undefined/);
});
