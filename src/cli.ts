/**
 * The only file that knows about processes and streams. `runCli` is pure over
 * its arguments and the io it is handed, which is how the tests call it.
 */

import { pathToFileURL } from "node:url";
import { emitJsonSchema } from "./input/schema.ts";

export type CliIo = {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
};

const USAGE = `usage:
  kosing schema facts | case          print the JSON Schema for that document
  kosing value --facts F [--case C]   (arrives in plan 2)
`;

function isDocument(name: string | undefined): name is "facts" | "case" {
  return name === "facts" || name === "case";
}

export function runCli(argv: readonly string[], io: CliIo): number {
  const [command, ...rest] = argv;
  if (command === "schema" && isDocument(rest[0]) && rest.length === 1) {
    io.stdout(`${JSON.stringify(emitJsonSchema(rest[0]), null, 2)}\n`);
    return 0;
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
  });
}
