/**
 * The only file that knows about processes, files and streams. `runCli` is
 * pure over its arguments and the io it is handed, which is how the tests
 * call it.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { DecodeError } from "./input/errors.ts";
import { emitJsonSchema } from "./input/schema.ts";
import { valuate } from "./valuate.ts";

export type CliIo = {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  /** Throws when the file cannot be read. */
  readonly readFile: (path: string) => string;
};

const USAGE = `usage:
  kosing value --facts F [--case C]   results.json on stdout, exit 0; DecodeError[] on stderr, exit 1
  kosing schema facts | case          print the JSON Schema for that document
`;

function isDocument(name: string | undefined): name is "facts" | "case" {
  return name === "facts" || name === "case";
}

type ValueArgs = { readonly facts: string; readonly investmentCase: string | null };

function parseValueArgs(rest: readonly string[]): ValueArgs | null {
  let facts: string | null = null;
  let investmentCase: string | null = null;
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const path = rest[i + 1];
    if (path === undefined) return null;
    if (flag === "--facts") facts = path;
    else if (flag === "--case") investmentCase = path;
    else return null;
  }
  return facts === null ? null : { facts, investmentCase };
}

type Loaded =
  | { readonly ok: true; readonly json: unknown }
  | { readonly ok: false; readonly error: DecodeError };

function loadJson(io: CliIo, file: DecodeError["file"], path: string): Loaded {
  let text: string;
  try {
    text = io.readFile(path);
  } catch (e) {
    return { ok: false, error: fileError(file, "file.unreadable", `${path}: ${message(e)}`) };
  }
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: fileError(file, "json.invalid", `${path}: ${message(e)}`) };
  }
}

function fileError(file: DecodeError["file"], rule: string, text: string): DecodeError {
  return { file, layer: "schema", rule, path: "", message: text };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function runValue(args: ValueArgs, io: CliIo): number {
  const facts = loadJson(io, "facts", args.facts);
  const investmentCase =
    args.investmentCase === null ? null : loadJson(io, "case", args.investmentCase);
  const loadErrors = [facts, investmentCase].flatMap((l) => (l !== null && !l.ok ? [l.error] : []));
  if (!facts.ok || (investmentCase !== null && !investmentCase.ok)) {
    io.stderr(`${JSON.stringify(loadErrors, null, 2)}\n`);
    return 1;
  }
  const result = valuate(facts.json, investmentCase === null ? undefined : investmentCase.json);
  if (!result.success) {
    io.stderr(`${JSON.stringify(result.error, null, 2)}\n`);
    return 1;
  }
  io.stdout(`${JSON.stringify(result.data, null, 2)}\n`);
  return 0;
}

export function runCli(argv: readonly string[], io: CliIo): number {
  const [command, ...rest] = argv;
  if (command === "schema" && isDocument(rest[0]) && rest.length === 1) {
    io.stdout(`${JSON.stringify(emitJsonSchema(rest[0]), null, 2)}\n`);
    return 0;
  }
  if (command === "value") {
    const args = parseValueArgs(rest);
    if (args !== null) return runValue(args, io);
  }
  io.stderr(USAGE);
  return 2;
}

/**
 * Whether this module is the process entry point. import.meta.url is
 * percent-encoded, so the path from argv has to go through pathToFileURL
 * rather than a template string, or a directory with a space never matches.
 */
export function isMain(importMetaUrl: string, argv1: string | undefined): boolean {
  return argv1 !== undefined && importMetaUrl === pathToFileURL(argv1).href;
}

if (isMain(import.meta.url, process.argv[1])) {
  process.exitCode = runCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    readFile: (path) => readFileSync(path, "utf8"),
  });
}
