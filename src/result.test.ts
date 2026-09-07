import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectResults, err, ok, type Result } from "./result.ts";

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

describe("collectResults", () => {
  it("unwraps every value when all succeed", () => {
    const actual = collectResults({ a: ok(1), b: ok("x"), c: ok({ y: "y" }) });
    const expected = { ok: true, value: { a: 1, b: "x", c: { y: "y" } } };
    assert.deepEqual(actual, expected);
  });

  it("reports the single failure", () => {
    const actual = collectResults({ a: ok(1), b: err("b"), c: ok({ y: "y" }) });
    const expected = { ok: false, error: ["b"] };
    assert.deepEqual(actual, expected);
  });

  it("reports failures in key order", () => {
    const actual = collectResults({ a: err("first"), b: ok("x"), c: err("second") });
    const expected = { ok: false, error: ["first", "second"] };
    assert.deepEqual(actual, expected);
  });

  it("accepts an empty record", () => {
    const actual = collectResults({});
    const expected = { ok: true, value: {} };
    assert.deepEqual(actual, expected);
  });
});
