/**
 * The JSON Schema the researcher and analyst skills fill in, generated from
 * the Zod schemas so there is one source of truth. The input side is emitted:
 * branded transforms become their string shape, discriminated unions become
 * oneOf, and superRefine predicates are dropped. schema.test.ts lists the
 * dropped ones with a proof for each.
 */

import { z } from "zod";
import { CaseSchema } from "./case.ts";
import { FactsSchema } from "./facts.ts";

export function emitJsonSchema(doc: "facts" | "case"): Record<string, unknown> {
  const schema = doc === "facts" ? FactsSchema : CaseSchema;
  return z.toJSONSchema(schema, { io: "input", unrepresentable: "throw" });
}
