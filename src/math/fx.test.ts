import assert from "node:assert/strict";
import { test } from "node:test";
import { computeFxSensitivity, shockFor } from "./fx.ts";

test("a move scales revenue and cost by their shares in that currency", () => {
  assert.deepEqual(shockFor({ pair: "USDSEK", revenueShare: 0.4, costShare: 0.1 }, 0.1), {
    revenueFactor: 1.04,
    costFactor: 1.01,
  });
  assert.deepEqual(shockFor({ pair: "USDSEK", revenueShare: 0.4, costShare: 0.1 }, -0.05), {
    revenueFactor: 0.98,
    costFactor: 0.995,
  });
});

test("each pair gets every move, revalued through the supplied function", () => {
  const exposures = [
    { pair: "USDSEK", revenueShare: 0.5, costShare: 0 },
    { pair: "EURSEK", revenueShare: 0.2, costShare: 0.3 },
  ];
  const r = computeFxSensitivity(
    exposures,
    [-0.1, 0.1],
    (s) => 100 * s.revenueFactor - 50 * s.costFactor,
  );
  assert.deepEqual(r, [
    {
      pair: "USDSEK",
      moves: [
        { pct: -0.1, valuePerShare: 45 },
        { pct: 0.1, valuePerShare: 55 },
      ],
    },
    {
      pair: "EURSEK",
      moves: [
        { pct: -0.1, valuePerShare: 100 * 0.98 - 50 * 0.97 },
        { pct: 0.1, valuePerShare: 100 * 1.02 - 50 * 1.03 },
      ],
    },
  ]);
});

test("property: zero exposure leaves the value unchanged, and a null revaluation is carried", () => {
  const unchanged = computeFxSensitivity(
    [{ pair: "USDSEK", revenueShare: 0, costShare: 0 }],
    [-0.1, -0.05, 0.05, 0.1],
    (s) => (s.revenueFactor === 1 && s.costFactor === 1 ? 42 : null),
  );
  assert.ok(unchanged[0]?.moves.every((m) => m.valuePerShare === 42));
  const undefinedValue = computeFxSensitivity(
    [{ pair: "USDSEK", revenueShare: 1, costShare: 0 }],
    [0.1],
    () => null,
  );
  assert.deepEqual(undefinedValue[0]?.moves, [{ pct: 0.1, valuePerShare: null }]);
});
