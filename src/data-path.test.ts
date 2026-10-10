import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { companyDir, parseCompanyId, resolveDataPath } from "./data-path.ts";

const existing = (dirs: readonly string[]) => (path: string) => dirs.includes(path);

test("an id splits at the last dot, so a dotted ticker stays whole", () => {
  assert.deepEqual(parseCompanyId("ACME.STO"), {
    ticker: "ACME",
    exchange: "STO",
    text: "ACME.STO",
  });
  assert.deepEqual(parseCompanyId("BRK.B.NYSE"), {
    ticker: "BRK.B",
    exchange: "NYSE",
    text: "BRK.B.NYSE",
  });
  assert.deepEqual(parseCompanyId("9984.T"), { ticker: "9984", exchange: "T", text: "9984.T" });
});

test("ids that are malformed or could leave the data repo are rejected", () => {
  for (const bad of [
    "",
    "ACME",
    "ACME.",
    ".STO",
    "ACME.sto",
    "AC ME.STO",
    "a/b.STO",
    "a\\b.STO",
    "../x.STO",
    "..STO",
    "A..B.STO",
    "ACME.ST-O",
  ]) {
    assert.equal(parseCompanyId(bad), null, JSON.stringify(bad));
  }
});

test("the environment wins over .env, and .env is used when the environment is silent", () => {
  const dirs = existing(["/env", "/file"]);
  assert.deepEqual(resolveDataPath({ DATA_PATH: "/env" }, "DATA_PATH=/file\n", dirs), {
    ok: true,
    path: "/env",
  });
  assert.deepEqual(resolveDataPath({}, "# comment\nDATA_PATH=/file\nOTHER=1\n", dirs), {
    ok: true,
    path: "/file",
  });
  assert.deepEqual(resolveDataPath({}, 'DATA_PATH="/file"\n', dirs), { ok: true, path: "/file" });
});

test("an empty value counts as unset, so it does not mask the file", () => {
  const dirs = existing(["/file"]);
  assert.deepEqual(resolveDataPath({ DATA_PATH: "" }, "DATA_PATH=/file\n", dirs), {
    ok: true,
    path: "/file",
  });
});

test("unset, relative and missing paths are errors that name the variable", () => {
  const unset = resolveDataPath({}, null, existing([]));
  assert.equal(unset.ok, false);
  if (!unset.ok) {
    assert.equal(unset.reason, "unset");
    assert.match(unset.message, /DATA_PATH/);
    assert.match(unset.message, /\.env\.example/);
  }
  const blankFile = resolveDataPath({}, "DATA_PATH=\n", existing([]));
  assert.equal(blankFile.ok ? "" : blankFile.reason, "unset");

  const relative = resolveDataPath({ DATA_PATH: "data" }, null, existing(["data"]));
  assert.equal(relative.ok ? "" : relative.reason, "notAbsolute");
  if (!relative.ok) assert.match(relative.message, /DATA_PATH/);

  const missing = resolveDataPath({ DATA_PATH: "/nowhere" }, null, existing([]));
  assert.equal(missing.ok ? "" : missing.reason, "notADirectory");
  if (!missing.ok) assert.match(missing.message, /\/nowhere/);
});

test("a company directory is companies/<id> under the data path", () => {
  const id = parseCompanyId("BRK.B.NYSE");
  assert.ok(id);
  assert.equal(companyDir("/data", id), join("/data", "companies", "BRK.B.NYSE"));
});
