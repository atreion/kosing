import assert from "node:assert/strict";

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

/** Walks any JSON-like value; fails on the first NaN or infinite number, naming its path. */
export function assertAllFinite(value: unknown, path = "$"): void {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} is ${value}`);
  } else if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) assertAllFinite(v, `${path}[${i}]`);
  } else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) assertAllFinite(v, `${path}.${k}`);
  }
}
