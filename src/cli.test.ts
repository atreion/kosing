import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isMain, runCli, writeFileAtomic } from "./cli.ts";
import { loadFixture, mutate } from "./test-fixtures.ts";

type CaptureOptions = {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly envFile?: string | null;
  readonly dirs?: readonly string[];
};

function capture(files: Record<string, string> = {}, options: CaptureOptions = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const fs: Record<string, string> = { ...files };
  return {
    io: {
      stdout: (s: string) => out.push(s),
      stderr: (s: string) => err.push(s),
      readFile: (path: string) => {
        const text = fs[path];
        if (text === undefined) throw new Error(`ENOENT: ${path}`);
        return text;
      },
      env: options.env ?? {},
      envFile: options.envFile ?? null,
      isDirectory: (path: string) => (options.dirs ?? []).includes(path),
      fileExists: (path: string) => path in fs,
      writeFile: (path: string, text: string) => {
        fs[path] = text;
      },
    },
    out,
    err,
    fs,
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

const DATA = "/data";
const ACME = join(DATA, "companies", "ACME.STO");
const withData = { env: { DATA_PATH: DATA }, dirs: [DATA] };

function acmeFiles(withCase: boolean): Record<string, string> {
  const files: Record<string, string> = { [join(ACME, "facts.json")]: fixture("acme.facts") };
  if (withCase) files[join(ACME, "case.json")] = fixture("acme-dcf.case");
  return files;
}

test("where prints the data path, from the environment or from .env, environment first", () => {
  const fromEnv = capture({}, withData);
  assert.equal(runCli(["where"], fromEnv.io), 0);
  assert.equal(fromEnv.out.join(""), "/data\n");

  const fromFile = capture({}, { envFile: "DATA_PATH=/file\n", dirs: ["/file"] });
  assert.equal(runCli(["where"], fromFile.io), 0);
  assert.equal(fromFile.out.join(""), "/file\n");

  const both = capture(
    {},
    { env: { DATA_PATH: DATA }, envFile: "DATA_PATH=/file\n", dirs: [DATA, "/file"] },
  );
  runCli(["where"], both.io);
  assert.equal(both.out.join(""), "/data\n");
});

test("where <ID> prints the company directory and echoes the data path on stderr", () => {
  const c = capture({}, withData);
  assert.equal(runCli(["where", "BRK.B.NYSE"], c.io), 0);
  assert.equal(c.out.join(""), `${join(DATA, "companies", "BRK.B.NYSE")}\n`);
  assert.ok(c.err.join("").includes("DATA_PATH=/data"));
});

test("an unset, relative or missing DATA_PATH is exit 2 with a message naming it", () => {
  for (const options of [
    {},
    { env: { DATA_PATH: "relative/dir" }, dirs: ["relative/dir"] },
    { env: { DATA_PATH: "/nowhere" } },
  ]) {
    for (const argv of [["where"], ["where", "ACME.STO"], ["value", "ACME.STO"]]) {
      const c = capture(acmeFiles(true), options);
      assert.equal(runCli(argv, c.io), 2, `${argv.join(" ")} ${JSON.stringify(options)}`);
      assert.ok(c.err.join("").includes("DATA_PATH"));
      assert.deepEqual(c.out, []);
    }
  }
});

test("a malformed or escaping id is a usage error before any path is built", () => {
  for (const id of ["ACME", "../x.STO", "a/b.STO", "ACME.sto"]) {
    for (const command of ["where", "value"]) {
      const c = capture({}, withData);
      assert.equal(runCli([command, id], c.io), 2, `${command} ${id}`);
      assert.ok(c.err.join("").includes("usage"));
      assert.deepEqual(c.fs, {});
    }
  }
});

test("value <ID> writes results.json beside the documents and prints its path", () => {
  const c = capture(acmeFiles(true), withData);
  assert.equal(runCli(["value", "ACME.STO"], c.io), 0);
  const written = c.fs[join(ACME, "results.json")];
  assert.ok(written !== undefined);
  assert.equal(JSON.parse(written).valuation.method, "dcf");
  assert.equal(c.out.join(""), `${join(ACME, "results.json")}\n`);
  assert.ok(c.err.join("").includes("DATA_PATH=/data"));
});

test("value <ID> without case.json is the screen", () => {
  const c = capture(acmeFiles(false), withData);
  assert.equal(runCli(["value", "ACME.STO"], c.io), 0);
  assert.equal(JSON.parse(c.fs[join(ACME, "results.json")] ?? "{}").valuation, null);
});

test("a company directory without facts.json is exit 1 naming the facts, nothing written", () => {
  const c = capture({}, withData);
  assert.equal(runCli(["value", "ACME.STO"], c.io), 1);
  const errors = JSON.parse(c.err.join("").split("\n").slice(1).join("\n"));
  assert.equal(errors[0].file, "facts");
  assert.equal(errors[0].rule, "file.unreadable");
  assert.equal(c.fs[join(ACME, "results.json")], undefined);
});

test("facts for another company than the id is exit 1 and nothing is written", () => {
  const files = { [join(DATA, "companies", "BETA.STO", "facts.json")]: fixture("acme.facts") };
  const c = capture(files, withData);
  assert.equal(runCli(["value", "BETA.STO"], c.io), 1);
  const errors = JSON.parse(c.err.join("").split("\n").slice(1).join("\n"));
  assert.deepEqual(
    errors.map((e: { rule: string; path: string }) => [e.rule, e.path]),
    [["semantic.companyIdMismatch", "company"]],
  );
  assert.equal(c.fs[join(DATA, "companies", "BETA.STO", "results.json")], undefined);
});

test("a failed run leaves an earlier results.json byte for byte", () => {
  const files = {
    ...acmeFiles(false),
    [join(ACME, "facts.json")]: JSON.stringify(
      mutate(loadFixture("acme.facts"), "market.price", -1),
    ),
    [join(ACME, "results.json")]: "earlier",
  };
  const c = capture(files, withData);
  assert.equal(runCli(["value", "ACME.STO"], c.io), 1);
  assert.equal(c.fs[join(ACME, "results.json")], "earlier");
});

test("a results.json that cannot be written is exit 3 with a message, not a decode error", () => {
  const c = capture(acmeFiles(true), withData);
  const io = {
    ...c.io,
    writeFile: () => {
      throw new Error("EACCES: permission denied");
    },
  };
  assert.equal(runCli(["value", "ACME.STO"], io), 3);
  const err = c.err.join("");
  assert.ok(err.includes(join(ACME, "results.json")), err);
  assert.ok(err.includes("EACCES"), err);
  assert.ok(!err.includes('"rule"'), "not reported as DecodeError[]");
  assert.deepEqual(c.out, []);
});

test("writeFileAtomic replaces the file whole and leaves no temporary behind", () => {
  const dir = mkdtempSync(join(tmpdir(), "kosing-atomic-"));
  const target = join(dir, "results.json");
  writeFileSync(target, "earlier");
  writeFileAtomic(target, "later");
  assert.equal(readFileSync(target, "utf8"), "later");
  assert.deepEqual(readdirSync(dir), ["results.json"]);
  rmSync(dir, { recursive: true, force: true });
});
