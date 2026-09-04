import assert from "node:assert/strict";
import { test } from "node:test";
import { err, ok, type Result } from "./result.ts";

test("ok wraps a value", () => {
  const r = ok(42);
  assert.equal(r.ok, true);
});

test("err wraps an error", () => {
  const e = err("you died");
  assert.equal(e.ok, false);
});

test("narrowing on ok exposes value", () => {
  const r: Result<number, string> = ok(42);
  if (!r.ok) {
    assert.fail("expected ok");
  }
  assert.equal(r.value, 42);
});

test("value is not accessible before narrowing", () => {
  const r: Result<number, string> = err("computer says no");
  // @ts-expect-error value only exists on the ok variant
  r.value;
});
