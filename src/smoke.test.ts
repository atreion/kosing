import assert from "node:assert/strict";
import { describe, it } from "node:test";

enum Answer {
  Life = 42,
}

function double(n: number): number {
  return n * 2;
}

describe("toolchain", () => {
  it("runs full TypeScript syntax, enums included", () => {
    assert.equal(double(21), Answer.Life);
  });
});
