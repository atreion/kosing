import assert from "node:assert/strict";
import type { Result } from "./result.ts";

export function assertClose(actual: number, expected: number, tolerance: number): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `actual: ${actual}, expected: ${expected}`);
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    assert.fail(JSON.stringify(result.error));
  }

  return result.value;
}
