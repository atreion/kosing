import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { decoded, failed, zodIssuesToErrors } from "./errors.ts";

test("decoded and failed build the two arms", () => {
  assert.deepEqual(decoded(1), { success: true, data: 1 });
  const e = {
    file: "facts",
    layer: "semantic",
    rule: "semantic.x",
    path: "a.b",
    message: "m",
  } as const;
  assert.deepEqual(failed([e]), { success: false, error: [e] });
});

test("zod issues become schema-layer errors with dotted paths and the file name", () => {
  const S = z.strictObject({ a: z.strictObject({ b: z.array(z.number()) }) });
  const result = S.safeParse({ a: { b: [1, "x"] } });
  assert.equal(result.success, false);
  const errors = zodIssuesToErrors("case", result.error?.issues ?? []);
  assert.equal(errors.length, 1);
  assert.deepEqual(errors[0], {
    file: "case",
    layer: "schema",
    rule: "schema.violation",
    path: "a.b.1",
    message: errors[0]?.message,
  });
  assert.ok((errors[0]?.message.length ?? 0) > 0);
});
