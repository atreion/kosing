import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { assertAllFinite } from "./test-utils.ts";

function kosing(...args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    encoding: "utf8",
  });
}

test("end to end: the real process values the acme pair", () => {
  const r = kosing(
    "value",
    "--facts",
    "tests/fixtures/valid/acme.facts.json",
    "--case",
    "tests/fixtures/valid/acme-dcf.case.json",
  );
  assert.equal(r.status, 0, r.stderr);
  const results = JSON.parse(r.stdout);
  assert.equal(results.inputs.ticker, "ACME");
  assert.equal(results.valuation.method, "dcf");
  assert.equal(results.sensitivity.grid.length, 5);
  assertAllFinite(results);
});

test("end to end: a missing file exits 1 with JSON on stderr", () => {
  const r = kosing("value", "--facts", "tests/fixtures/valid/missing.json");
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stderr)[0].rule, "file.unreadable");
});
