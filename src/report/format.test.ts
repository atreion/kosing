import assert from "node:assert/strict";
import { test } from "node:test";
import { fixed, formatMultiple, formatPercent, formatPerShare } from "./format.ts";

test("a value that rounds to zero never prints as -0", () => {
  assert.equal(fixed(-0.12, 0), "0");
  assert.equal(fixed(-0.004, 2), "0.00");
  assert.equal(fixed(-0.6, 0), "-1");
  assert.equal(formatPercent(-0.0001, 0), "0%");
  assert.equal(formatPerShare("USD", -0.001), "USD 0.00");
  assert.equal(formatMultiple(-0.01), "0.0x");
});
