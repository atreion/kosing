import { readFileSync } from "node:fs";
import { join } from "node:path";

export const VALID_FIXTURES = {
  facts: ["acme.facts", "holdco.facts", "dual.facts", "nordbank.facts", "safeins.facts"],
  cases: ["acme-dcf.case", "acme-normalised.case", "holdco-nav.case"],
} as const;

export function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join("tests", "fixtures", "valid", `${name}.json`), "utf8"));
}

/**
 * A deep copy with one dotted path replaced, so an invalid case is one visible
 * line away from a valid fixture. The value "__delete__" removes the key.
 *
 * The two casts are test-utility casts over structuredClone's `unknown`; this
 * is the one place the no-cast rule yields, and nothing in src/ outside tests
 * imports this module.
 */
export function mutate<T>(doc: T, path: string, value: unknown): T {
  const copy = structuredClone(doc) as Record<string, unknown>;
  const segments = path.split(".");
  const last = segments.pop();
  if (last === undefined) throw new Error("mutate needs a path");
  let cursor: Record<string, unknown> = copy;
  for (const segment of segments) {
    const next = cursor[segment];
    if (typeof next !== "object" || next === null) {
      throw new Error(`mutate: ${path} does not exist in the document`);
    }
    cursor = next as Record<string, unknown>;
  }
  if (value === "__delete__") {
    delete cursor[last];
  } else {
    cursor[last] = value;
  }
  return copy as T;
}
