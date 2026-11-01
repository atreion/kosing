import assert from "node:assert/strict";
import { test } from "node:test";
import { type Decoded, decode } from "../input/decode.ts";
import { loadFixture, mutate } from "../test-fixtures.ts";
import { assemble } from "./assemble.ts";

function decoded(facts: unknown, c?: unknown): Decoded {
  const result = decode(facts, c);
  if (!result.success) throw new Error(JSON.stringify(result.error));
  return result.data;
}

function rules(facts: unknown, c: unknown): string[] {
  return assemble(decoded(facts, c)).warnings.map((w) => w.rule);
}

const acme = () => loadFixture("acme.facts");

test("a normalised bear margin above the current margin is not a downside", () => {
  const c = mutate(
    mutate(loadFixture("acme-normalised.case"), "method.ebitMargin.bear", 0.125),
    "method.ebitMargin.base",
    0.13,
  );
  assert.ok(rules(acme(), c).includes("bearMarginAboveCurrent"));
  assert.ok(!rules(acme(), loadFixture("acme-normalised.case")).includes("bearMarginAboveCurrent"));
});

test("a dcf bear whose first-year margin beats the base period's warns", () => {
  const dcf = loadFixture("acme-dcf.case") as { method: { revenueGrowthPath: number[] } };
  const growth = dcf.method.revenueGrowthPath;
  const scenarios = {
    bear: { revenueGrowthPath: growth, ebitMarginPath: Array(10).fill(0.125), rationale: "x" },
    bull: { revenueGrowthPath: growth, ebitMarginPath: Array(10).fill(0.16), rationale: "x" },
  };
  assert.ok(
    rules(acme(), mutate(dcf, "method.scenarios", scenarios)).includes("bearMarginAboveCurrent"),
  );
  const lower = { ...scenarios, bear: { ...scenarios.bear, ebitMarginPath: Array(10).fill(0.09) } };
  assert.ok(
    !rules(acme(), mutate(dcf, "method.scenarios", lower)).includes("bearMarginAboveCurrent"),
  );
});

test("a bear within 20% of base is flagged as narrow", () => {
  const near = mutate(
    mutate(loadFixture("acme-normalised.case"), "method.ebitMargin.bear", 0.115),
    "method.evEbitMultiple.bear",
    12.5,
  );
  assert.ok(rules(acme(), near).includes("scenariosNarrow"));
  assert.ok(!rules(acme(), loadFixture("acme-normalised.case")).includes("scenariosNarrow"));
});

test("a mine plan beyond its recoverable reserve warns; within it does not", () => {
  const c = loadFixture("miner-mine-nav.case") as {
    method: { parts: { kind: string; production?: { volume: number }[] }[] };
  };
  const index = c.method.parts.findIndex((p) => p.kind === "mine");
  const planned = (c.method.parts[index]?.production ?? []).reduce((s, r) => s + r.volume, 0);
  const over = mutate(c, `method.parts.${index}.recoverableReserve`, planned * 0.9);
  assert.ok(rules(loadFixture("miner.facts"), over).includes("productionBeyondReserve"));
  const within = mutate(c, `method.parts.${index}.recoverableReserve`, planned);
  assert.ok(!rules(loadFixture("miner.facts"), within).includes("productionBeyondReserve"));
});

test("a producing mine worth less than nothing in a scenario warns", () => {
  const c = loadFixture("miner-mine-nav.case") as {
    method: { parts: { kind: string }[] };
  };
  const index = c.method.parts.findIndex((p) => p.kind === "mine");
  const name = (c.method.parts[index] as { name?: string }).name ?? "";
  const messages = (doc: unknown) =>
    assemble(decoded(loadFixture("miner.facts"), doc))
      .warnings.filter((w) => w.rule === "mineValueNegative")
      .map((w) => w.message);
  const costly = mutate(c, `method.parts.${index}.cashCostPerUnit`, 500);
  assert.ok(messages(costly).some((m) => m.startsWith(name)));
  assert.ok(!messages(c).some((m) => m.startsWith(name)), "the producer is profitable as written");
});
