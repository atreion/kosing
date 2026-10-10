import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("end to end: value <ID> against a temporary data repo", () => {
  const data = mkdtempSync(join(tmpdir(), "kosing-data-"));
  try {
    const dir = join(data, "companies", "ACME.STO");
    mkdirSync(dir, { recursive: true });
    copyFileSync("tests/fixtures/valid/acme.facts.json", join(dir, "facts.json"));
    copyFileSync("tests/fixtures/valid/acme-dcf.case.json", join(dir, "case.json"));
    const r = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "value", "ACME.STO"], {
      encoding: "utf8",
      env: { ...process.env, DATA_PATH: data },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), join(dir, "results.json"));
    const results = JSON.parse(readFileSync(join(dir, "results.json"), "utf8"));
    assert.equal(results.inputs.ticker, "ACME");
    assertAllFinite(results);
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
});
