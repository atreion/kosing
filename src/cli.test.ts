import assert from "node:assert/strict";
import { test } from "node:test";
import { runCli } from "./cli.ts";

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) },
    out,
    err,
  };
}

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
  for (const argv of [[], ["schema"], ["schema", "thesis"], ["value"]]) {
    const { io, out, err } = capture();
    assert.equal(runCli(argv, io), 2, argv.join(" "));
    assert.deepEqual(out, []);
    assert.ok(err.join("").includes("usage"), argv.join(" "));
  }
});
