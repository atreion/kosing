/**
 * Where the data repo is, and where one company's documents live in it.
 * Pure: the caller reads the environment and the .env file and passes them
 * in, which is what lets the tests cover precedence without touching
 * process.env.
 */

import { isAbsolute, join } from "node:path";
import { parseEnv } from "node:util";

export const DATA_PATH_KEY = "DATA_PATH";

export type CompanyId = {
  readonly ticker: string;
  readonly exchange: string;
  /** The id as written, which is also the directory name. */
  readonly text: string;
};

const EXCHANGE = /^[A-Z0-9]+$/;
const UNSAFE_IN_TICKER = /[\s/\\]/;

/** Splits at the last dot, so BRK.B.NYSE is ticker BRK.B on NYSE. */
export function parseCompanyId(text: string): CompanyId | null {
  const dot = text.lastIndexOf(".");
  if (dot <= 0) return null;
  const ticker = text.slice(0, dot);
  const exchange = text.slice(dot + 1);
  if (!EXCHANGE.test(exchange)) return null;
  if (UNSAFE_IN_TICKER.test(ticker) || ticker.includes("..") || ticker.startsWith(".")) {
    return null;
  }
  return { ticker, exchange, text };
}

export type DataPath =
  | { readonly ok: true; readonly path: string }
  | {
      readonly ok: false;
      readonly reason: "unset" | "notAbsolute" | "notADirectory";
      readonly message: string;
    };

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** parseEnv is typed loosely across Node versions; reading through entries keeps it honest. */
function fromEnvFile(text: string | null): string | undefined {
  if (text === null) return undefined;
  const entry = Object.entries(parseEnv(text)).find(([key]) => key === DATA_PATH_KEY);
  return nonEmpty(entry?.[1]);
}

export function resolveDataPath(
  env: Readonly<Record<string, string | undefined>>,
  envFileText: string | null,
  isDirectory: (path: string) => boolean,
): DataPath {
  const value = nonEmpty(env[DATA_PATH_KEY]) ?? fromEnvFile(envFileText);
  if (value === undefined) {
    return {
      ok: false,
      reason: "unset",
      message: `${DATA_PATH_KEY} is not set. Set it in the environment or in .env at the Kosing repo root; see .env.example.`,
    };
  }
  if (!isAbsolute(value)) {
    return {
      ok: false,
      reason: "notAbsolute",
      message: `${DATA_PATH_KEY} must be an absolute path, got ${value}; see .env.example.`,
    };
  }
  if (!isDirectory(value)) {
    return {
      ok: false,
      reason: "notADirectory",
      message: `${DATA_PATH_KEY} is ${value}, which is not a directory; see .env.example.`,
    };
  }
  return { ok: true, path: value };
}

export function companyDir(dataPath: string, id: CompanyId): string {
  return join(dataPath, "companies", id.text);
}
