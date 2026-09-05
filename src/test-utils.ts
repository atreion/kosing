import assert from "node:assert/strict";
import type { Result } from "./result.ts";

export function assertClose(
  actual: number,
  expected: number,
  tolerance: number,
  label?: string,
): void {
  const prefix = label ? `${label}: ` : "";
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${prefix}actual: ${actual}, expected: ${expected}`,
  );
}

export function assertAllClose(
  actual: Record<string, number>,
  expected: Record<string, number>,
  tolerance: number,
): void {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key];
    assert.ok(actualValue !== undefined, `${key} is missing`);
    assertClose(actualValue, expectedValue, tolerance, key);
  }
}

export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    assert.fail(JSON.stringify(result.error));
  }

  return result.value;
}
