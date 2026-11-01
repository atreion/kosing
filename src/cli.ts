/**
 * The only file that knows about processes, files and streams. `runCli` is
 * pure over its arguments and the io it is handed, which is how the tests
 * call it.
 */

import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { type CompanyId, companyDir, parseCompanyId, resolveDataPath } from "./data-path.ts";
import type { DecodeError } from "./input/errors.ts";
import { IsoDateString } from "./input/primitives.ts";
import { emitJsonSchema, flattenJsonSchema } from "./input/schema.ts";
import { buildReportModel } from "./report/model.ts";
import { renderReport } from "./report/render.ts";
import { DEFAULT_VALUATOR_OPTIONS, type Results } from "./results/types.ts";
import { valuate } from "./valuate.ts";

export type CliIo = {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  /** Throws when the file cannot be read. */
  readonly readFile: (path: string) => string;
  readonly env: Readonly<Record<string, string | undefined>>;
  /**
   * Reads .env at the repo root, or null when there is none. A function, so
   * only commands that resolve DATA_PATH read it and a broken file cannot
   * stop `schema` or `value --facts`.
   */
  readonly envFile: () => string | null;
  readonly isDirectory: (path: string) => boolean;
  readonly fileExists: (path: string) => boolean;
  readonly writeFile: (path: string, text: string) => void;
  /** Today's local date as YYYY-MM-DD, the valuation date in results.json. */
  readonly today: () => string;
};

const USAGE = `usage:
  kosing value <TICKER.EXCHANGE>      value one company in DATA_PATH; writes its results.json
                                      (exit 3 when results.json cannot be written)
  kosing value --facts F [--case C]   results.json on stdout, exit 0; DecodeError[] on stderr, exit 1
  kosing report <TICKER.EXCHANGE>     render results.json and advice.md into report.html
                                      (exit 3 when report.html cannot be written)
  kosing where [TICKER.EXCHANGE]      print DATA_PATH, or one company's directory in it
  kosing schema facts | case          print the JSON Schema for that document
  kosing schema facts | case --flat   the same contract as one line per field
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

function fileError(file: DecodeError["file"], rule: string, text: string): DecodeError {
  return { file, layer: "schema", rule, path: "", message: text };
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

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

type Evaluated =
  | { readonly ok: true; readonly results: Results }
  | { readonly ok: false; readonly errors: readonly DecodeError[] };

function evaluate(args: ValueArgs, io: CliIo): Evaluated {
  const facts = loadJson(io, "facts", args.facts);
  const investmentCase =
    args.investmentCase === null ? null : loadJson(io, "case", args.investmentCase);
  const loadErrors = [facts, investmentCase].flatMap((l) => (l !== null && !l.ok ? [l.error] : []));
  if (!facts.ok || (investmentCase !== null && !investmentCase.ok)) {
    return { ok: false, errors: loadErrors };
  }
  const result = valuate(facts.json, investmentCase === null ? undefined : investmentCase.json, {
    ...DEFAULT_VALUATOR_OPTIONS,
    valuedOn: IsoDateString.parse(io.today()),
  });
  return result.success ? { ok: true, results: result.data } : { ok: false, errors: result.error };
}

function reportErrors(io: CliIo, errors: readonly DecodeError[]): number {
  io.stderr(`${JSON.stringify(errors, null, 2)}\n`);
  return 1;
}

function runValueFiles(args: ValueArgs, io: CliIo): number {
  const evaluated = evaluate(args, io);
  if (!evaluated.ok) return reportErrors(io, evaluated.errors);
  io.stdout(`${JSON.stringify(evaluated.results, null, 2)}\n`);
  return 0;
}

/** Resolves DATA_PATH, or reports why not. Exit 2 is the caller's. */
function dataPath(io: CliIo, echo: boolean): string | null {
  const resolved = resolveDataPath(io.env, io.envFile(), io.isDirectory);
  if (!resolved.ok) {
    io.stderr(`${resolved.message}\n`);
    return null;
  }
  if (echo) io.stderr(`DATA_PATH=${resolved.path}\n`);
  return resolved.path;
}

/** A directory renamed by hand must not price the wrong company. */
function checkCompanyId(id: CompanyId, results: Results): readonly DecodeError[] {
  const { ticker, exchange } = results.inputs.company.identity;
  if (ticker === id.ticker && exchange === id.exchange) return [];
  return [
    {
      file: "facts",
      layer: "semantic",
      rule: "semantic.companyIdMismatch",
      path: "company",
      message: `directory is ${id.text}, facts are for ${ticker}.${exchange}`,
    },
  ];
}

function runValueId(id: CompanyId, io: CliIo): number {
  const data = dataPath(io, true);
  if (data === null) return 2;
  const dir = companyDir(data, id);
  const casePath = join(dir, "case.json");
  const evaluated = evaluate(
    { facts: join(dir, "facts.json"), investmentCase: io.fileExists(casePath) ? casePath : null },
    io,
  );
  if (!evaluated.ok) return reportErrors(io, evaluated.errors);
  const mismatch = checkCompanyId(id, evaluated.results);
  if (mismatch.length > 0) return reportErrors(io, mismatch);
  const out = join(dir, "results.json");
  // Not a DecodeError: nothing in facts or case is wrong, so exit 1 would send the reader there.
  return writeOutput(io, out, `${JSON.stringify(evaluated.results, null, 2)}\n`) ? 0 : 3;
}

/** Writes and prints the path, or reports why not; false means exit 3. */
function writeOutput(io: CliIo, path: string, text: string): boolean {
  try {
    io.writeFile(path, text);
  } catch (e) {
    io.stderr(`could not write ${path}: ${message(e)}\n`);
    return false;
  }
  io.stdout(`${path}\n`);
  return true;
}

/** Run after advice.md is written: the report shows the results and the advice together. */
function writeReport(io: CliIo, dir: string, results: Results): number {
  const advicePath = join(dir, "advice.md");
  const advice = io.fileExists(advicePath) ? io.readFile(advicePath) : null;
  const html = renderReport(buildReportModel(results, advice));
  return writeOutput(io, join(dir, "report.html"), html) ? 0 : 3;
}

/** results.json is Kosing's own output, so it is trusted rather than decoded; the version is the guard. */
function readResults(io: CliIo, path: string): Results | null {
  const loaded = loadJson(io, "facts", path);
  if (!loaded.ok) {
    io.stderr(`${loaded.error.message}\n`);
    return null;
  }
  const json = loaded.json as { readonly schemaVersion?: unknown };
  if (json.schemaVersion !== "1.0") {
    io.stderr(
      `${path}: schemaVersion ${String(json.schemaVersion)} is not 1.0; run kosing value again\n`,
    );
    return null;
  }
  return loaded.json as Results;
}

function runReport(rest: readonly string[], io: CliIo): number {
  const id = rest.length === 1 && rest[0] !== undefined ? parseCompanyId(rest[0]) : null;
  if (id === null) return usage(io);
  const data = dataPath(io, true);
  if (data === null) return 2;
  const dir = companyDir(data, id);
  const results = readResults(io, join(dir, "results.json"));
  return results === null ? 1 : writeReport(io, dir, results);
}

function usage(io: CliIo): number {
  io.stderr(USAGE);
  return 2;
}

function runWhere(rest: readonly string[], io: CliIo): number {
  if (rest.length === 0) {
    const data = dataPath(io, false);
    if (data === null) return 2;
    io.stdout(`${data}\n`);
    return 0;
  }
  const id = rest.length === 1 && rest[0] !== undefined ? parseCompanyId(rest[0]) : null;
  if (id === null) return usage(io);
  const data = dataPath(io, true);
  if (data === null) return 2;
  io.stdout(`${companyDir(data, id)}\n`);
  return 0;
}

function runValue(rest: readonly string[], io: CliIo): number {
  const [first] = rest;
  if (rest.length === 1 && first !== undefined && !first.startsWith("--")) {
    const id = parseCompanyId(first);
    return id === null ? usage(io) : runValueId(id, io);
  }
  const args = parseValueArgs(rest);
  return args === null ? usage(io) : runValueFiles(args, io);
}

export function runCli(argv: readonly string[], io: CliIo): number {
  const [command, ...rest] = argv;
  if (command === "schema" && isDocument(rest[0]) && rest.length === 1) {
    io.stdout(`${JSON.stringify(emitJsonSchema(rest[0]), null, 2)}\n`);
    return 0;
  }
  if (command === "schema" && isDocument(rest[0]) && rest[1] === "--flat" && rest.length === 2) {
    io.stdout(`${flattenJsonSchema(emitJsonSchema(rest[0]))}\n`);
    return 0;
  }
  if (command === "value") return runValue(rest, io);
  if (command === "where") return runWhere(rest, io);
  if (command === "report") return runReport(rest, io);
  return usage(io);
}

/**
 * Whether this module is the process entry point. import.meta.url is
 * percent-encoded, so the path from argv has to go through pathToFileURL
 * rather than a template string, or a directory with a space never matches.
 */
export function isMain(importMetaUrl: string, argv1: string | undefined): boolean {
  return argv1 !== undefined && importMetaUrl === pathToFileURL(argv1).href;
}

/**
 * Writes beside the target and renames over it, so a failed write (disk full,
 * killed process) leaves the earlier file whole rather than truncated.
 */
export function writeFileAtomic(path: string, text: string): void {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, text);
  renameSync(temporary, path);
}

function localIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** .env at the repo root, found from this file rather than the working directory. */
function readEnvFile(): string | null {
  try {
    return readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") return null;
    throw e;
  }
}

if (isMain(import.meta.url, process.argv[1])) {
  process.exitCode = runCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    readFile: (path) => readFileSync(path, "utf8"),
    env: process.env,
    envFile: readEnvFile,
    isDirectory: (path) => existsSync(path) && statSync(path).isDirectory(),
    fileExists: (path) => existsSync(path),
    writeFile: writeFileAtomic,
    today: localIsoDate,
  });
}
