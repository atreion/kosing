import assert from "node:assert/strict";
import { test } from "node:test";
import { isMain, runCli } from "./cli.ts";
import { loadFixture, mutate } from "./test-fixtures.ts";

function capture(files: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      stdout: (s: string) => out.push(s),
      stderr: (s: string) => err.push(s),
      readFile: (path: string) => {
        const text = files[path];
        if (text === undefined) throw new Error(`ENOENT: ${path}`);
        return text;
      },
    },
    out,
    err,
  };
}

const fixture = (name: string) => JSON.stringify(loadFixture(name));

test("value --facts F --case C writes results.json and exits 0", () => {
  const { io, out, err } = capture({
    "f.json": fixture("acme.facts"),
    "c.json": fixture("acme-dcf.case"),
  });
  assert.equal(runCli(["value", "--facts", "f.json", "--case", "c.json"], io), 0);
  assert.deepEqual(err, []);
  const results = JSON.parse(out.join(""));
  assert.equal(results.schemaVersion, "1.0");
  assert.equal(results.valuation.method, "dcf");
});

test("value --facts F alone is the screen, in either flag order", () => {
  const { io, out } = capture({ "f.json": fixture("acme.facts") });
  assert.equal(runCli(["value", "--facts", "f.json"], io), 0);
  assert.equal(JSON.parse(out.join("")).valuation, null);
  const swapped = capture({ "f.json": fixture("acme.facts"), "c.json": fixture("acme-dcf.case") });
  assert.equal(runCli(["value", "--case", "c.json", "--facts", "f.json"], swapped.io), 0);
});

test("decode errors go to stderr as JSON with exit 1", () => {
  const broken = JSON.stringify(mutate(loadFixture("acme.facts"), "market.price", -1));
  const { io, out, err } = capture({ "f.json": broken });
  assert.equal(runCli(["value", "--facts", "f.json"], io), 1);
  assert.deepEqual(out, []);
  const errors = JSON.parse(err.join(""));
  assert.equal(errors[0].path, "market.price");
});

test("an unreadable or non-JSON file is an error naming the document, exit 1", () => {
  const missing = capture({});
  assert.equal(runCli(["value", "--facts", "nope.json"], missing.io), 1);
  assert.deepEqual(JSON.parse(missing.err.join(""))[0], {
    file: "facts",
    layer: "schema",
    rule: "file.unreadable",
    path: "",
    message: JSON.parse(missing.err.join(""))[0].message,
  });
  const garbage = capture({ "f.json": fixture("acme.facts"), "c.json": "{not json" });
  assert.equal(runCli(["value", "--facts", "f.json", "--case", "c.json"], garbage.io), 1);
  const [e] = JSON.parse(garbage.err.join(""));
  assert.equal(e.file, "case");
  assert.equal(e.rule, "json.invalid");
});

test("value without --facts, or with an unknown flag, is a usage error", () => {
  for (const argv of [
    ["value"],
    ["value", "--case", "c.json"],
    ["value", "--facts", "f.json", "--x"],
  ]) {
    const { io, err } = capture({ "f.json": fixture("acme.facts") });
    assert.equal(runCli(argv, io), 2, argv.join(" "));
    assert.ok(err.join("").includes("usage"));
  }
});

test("schema facts prints a JSON Schema and exits 0", () => {
  const { io, out, err } = capture();
  const code = runCli(["schema", "facts"], io);
  assert.equal(code, 0);
  assert.deepEqual(err, []);
  const schema = JSON.parse(out.join(""));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.ok("company" in schema.properties);
});

test("schema case prints the case schema", () => {
  const { io, out } = capture();
  assert.equal(runCli(["schema", "case"], io), 0);
  assert.ok("method" in JSON.parse(out.join("")).properties);
});

test("an unknown subcommand or document prints usage to stderr and exits 2", () => {
  for (const argv of [[], ["schema"], ["schema", "thesis"]]) {
    const { io, out, err } = capture();
    assert.equal(runCli(argv, io), 2, argv.join(" "));
    assert.deepEqual(out, []);
    assert.ok(err.join("").includes("usage"), argv.join(" "));
  }
});

test("the entry guard recognises its own path even when the path has a space", () => {
  assert.equal(isMain("file:///a/with%20space/cli.ts", "/a/with space/cli.ts"), true);
  assert.equal(isMain("file:///a/nospace/cli.ts", "/a/nospace/cli.ts"), true);
  assert.equal(isMain("file:///a/cli.ts", "/a/other.ts"), false);
  assert.equal(isMain("file:///a/cli.ts", undefined), false);
});
