import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { err, ok, type Result } from "./result.ts";

describe("ok", () => {
  it("wraps a value", () => {
    assert.deepEqual(ok(42), { ok: true, value: 42 });
  });

  it("exposes value after narrowing", () => {
    const r: Result<number, string> = ok(42);
    if (!r.ok) {
      assert.fail("expected ok");
    }
    assert.equal(r.value, 42);
  });
});

describe("err", () => {
  it("wraps an error", () => {
    assert.deepEqual(err("you died"), { ok: false, error: "you died" });
  });

  it("hides value before narrowing", () => {
    const r: Result<number, string> = err("computer says no");
    // @ts-expect-error value only exists on the ok variant
    r.value;
  });
});
