import assert from "node:assert/strict";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { loadFixture, mutate, VALID_FIXTURES } from "../test-fixtures.ts";
import { CaseSchema } from "./case.ts";
import { FactsSchema } from "./facts.ts";
import { emitJsonSchema } from "./schema.ts";

function validator(doc: "facts" | "case") {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  // ajv-formats is CommonJS; under nodenext its default import is the module
  // namespace, so the plugin sits at .default both for tsc and at runtime.
  addFormats.default(ajv);
  return ajv.compile(emitJsonSchema(doc));
}

/**
 * The value rules the emitted JSON Schema cannot carry. Each has a mutation
 * that Zod rejects and ajv accepts; if a rule ever becomes representable, the
 * ajv half fails and this list has to shrink. The skills spec restates each in
 * English for the AI role that fills the document in.
 */
const UNREPRESENTABLE_RULES: readonly {
  doc: "facts" | "case";
  rule: string;
  mutation: (valid: unknown) => unknown;
}[] = [
  {
    doc: "facts",
    rule: "every sourceRef resolves to a sources[].id",
    mutation: (v) => mutate(v, "market.sourceRefs.0", "S99"),
  },
  {
    doc: "facts",
    rule: "fiscalYears[].fy values are distinct",
    mutation: (v) => mutate(v, "financials.fiscalYears.1.fy", 2021),
  },
  {
    doc: "facts",
    rule: "equityWeight + debtWeight is 1",
    mutation: (v) => mutate(v, "costOfCapital.debtWeight", 0.3),
  },
  {
    doc: "facts",
    rule: "a priceCurrency differing from currency needs a spot rate",
    mutation: (v) => mutate(v, "market.priceCurrency", "USD"),
  },
  {
    doc: "case",
    rule: "bear <= base <= bull",
    mutation: (v) => mutate(v, "method.ebitMargin.bear", 0.5),
  },
  {
    doc: "case",
    rule: "no scenario multiple above multipleCeiling",
    mutation: (v) => mutate(v, "method.evEbitMultiple.bull", 40),
  },
  {
    doc: "case",
    rule: "an override needs a rationale",
    mutation: (v) =>
      mutate(v, "overrides", { beta: 1.3, wacc: null, taxRate: null, rationale: null }),
  },
  {
    doc: "case",
    rule: "overrides apply to dcf only",
    mutation: (v) =>
      mutate(v, "overrides", { beta: 1.3, wacc: null, taxRate: null, rationale: "x" }),
  },
  {
    doc: "case",
    rule: "sensitivity applies to dcf only",
    mutation: (v) => mutate(v, "sensitivity", { waccSteps: [0], terminalGrowthSteps: [0] }),
  },
];

test("every valid fixture validates against the emitted schema", () => {
  const facts = validator("facts");
  for (const name of VALID_FIXTURES.facts) {
    assert.ok(facts(loadFixture(name)), `${name}: ${JSON.stringify(facts.errors?.slice(0, 2))}`);
  }
  const c = validator("case");
  for (const name of VALID_FIXTURES.cases) {
    assert.ok(c(loadFixture(name)), `${name}: ${JSON.stringify(c.errors?.slice(0, 2))}`);
  }
});

test("the emitted schema rejects a misspelled key, like the Zod schema does", () => {
  const facts = validator("facts");
  const bad = mutate(loadFixture("acme.facts"), "market.priceCurency", "SEK");
  assert.equal(facts(bad), false);
});

for (const { doc, rule, mutation } of UNREPRESENTABLE_RULES) {
  test(`${doc}: ${rule} is enforced by Zod and not by the emitted schema`, () => {
    const base = loadFixture(doc === "facts" ? "acme.facts" : "acme-normalised.case");
    const bad = mutation(base);
    const zod = doc === "facts" ? FactsSchema : CaseSchema;
    assert.equal(zod.safeParse(bad).success, false, "Zod must reject it");
    assert.equal(validator(doc)(bad), true, "the JSON Schema cannot express it, so it passes");
  });
}

test("sensitivity steps including 0 is a dcf-only rule the schema cannot carry either", () => {
  const bad = mutate(loadFixture("acme-dcf.case"), "sensitivity", {
    waccSteps: [-0.01, 0.01],
    terminalGrowthSteps: [0],
  });
  assert.equal(CaseSchema.safeParse(bad).success, false);
  assert.equal(validator("case")(bad), true);
});

test("duplicate source ids are a rule the schema cannot carry", () => {
  const doc = loadFixture("acme.facts") as { sources: { id: string }[] };
  const bad = mutate(doc, "sources", [...doc.sources, { ...doc.sources[0], title: "again" }]);
  assert.equal(FactsSchema.safeParse(bad).success, false);
  assert.equal(validator("facts")(bad), true);
});

test("a financial institution's fixed debt values are a rule the schema cannot carry", () => {
  const bad = mutate(loadFixture("nordbank.facts"), "balanceSheet.totalDebt", 100);
  assert.equal(FactsSchema.safeParse(bad).success, false);
  assert.equal(validator("facts")(bad), true);
});

/**
 * The conventions a researcher or analyst cannot infer from a field's name
 * travel in the emitted schema as descriptions, so `kosing schema` is the whole
 * brief. A path walks `properties`, array `items` and nullable `anyOf`.
 */
const DESCRIBED_FIELDS: Record<"facts" | "case", readonly string[]> = {
  facts: [
    "",
    "financialInstitution",
    "financialInstitution.tangibleBookEquity",
    "financialInstitution.capitalTarget",
    "financialInstitution.niiSensitivity",
    "asOf",
    "currency",
    "unit",
    "market.price",
    "market.asOf",
    "market.sharesOutstandingM",
    "financials.ltm",
    "financials.fiscalYears.capex",
    "financials.fiscalYears.taxExpense",
    "financials.fiscalYears.netFinancialResult",
    "financials.fiscalYears.fcf",
    "financials.fiscalYears.ebitda",
    "financials.fiscalYears.cogs",
    "financials.fiscalYears.opex",
    "financials.quarters",
    "balanceSheet.operatingLeaseLiabilities",
    "balanceSheet.pensionObligations",
    "sources.id",
    "balanceSheet.totalDebt",
    "balanceSheet.totalEquity",
    "costOfCapital.riskFreeRate",
    "costOfCapital.erp",
    "costOfCapital.betaCompany",
    "costOfCapital.betaSector",
    "costOfCapital.pretaxCostOfDebt",
    "costOfCapital.taxRateStatutory",
    "costOfCapital.equityWeight",
    "estimates.basis",
    "fx.exposures",
    "sources.tier",
    "gaps",
  ],
  case: [
    "",
    "factsAsOf",
    "classification",
    "aiExposure",
    "method",
    "method.revenueGrowthPath",
    "method.capexPctRevenuePath",
    "method.workingCapitalPctRevenue",
    "overrides",
    "sensitivity",
  ],
};

function descriptionAt(schema: Record<string, unknown>, path: string): unknown {
  let node: Record<string, unknown> | undefined = schema;
  for (const key of path === "" ? [] : path.split(".")) {
    node = childOf(node, key);
  }
  return node?.description;
}

function childOf(
  node: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  if (node === undefined) return undefined;
  const props = node.properties as Record<string, Record<string, unknown>> | undefined;
  if (props?.[key]) return props[key];
  const items = node.items as Record<string, unknown> | undefined;
  if (items) return childOf(items, key);
  for (const option of (node.anyOf ?? node.oneOf ?? []) as Record<string, unknown>[]) {
    const found = childOf(option, key);
    if (found) return found;
  }
  return undefined;
}

for (const doc of ["facts", "case"] as const) {
  for (const path of DESCRIBED_FIELDS[doc]) {
    test(`${doc}: ${path || "the document"} carries a description`, () => {
      const description = descriptionAt(emitJsonSchema(doc), path);
      assert.equal(typeof description, "string", `${path || "root"} has no description`);
    });
  }
}
