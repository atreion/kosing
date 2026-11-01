/**
 * The JSON Schema the researcher and analyst skills fill in, generated from
 * the Zod schemas so there is one source of truth. The input side is emitted:
 * branded transforms become their string shape, discriminated unions become
 * oneOf, and superRefine predicates are dropped. schema.test.ts lists the
 * dropped ones with a proof for each.
 */

import { z } from "zod";
import { CaseSchema } from "./case.ts";
import { FactsSchema } from "./facts.ts";

export function emitJsonSchema(doc: "facts" | "case"): Record<string, unknown> {
  const schema = doc === "facts" ? FactsSchema : CaseSchema;
  return z.toJSONSchema(schema, { io: "input", unrepresentable: "throw" });
}

type SchemaNode = Record<string, unknown>;

type FlatField = {
  readonly path: string;
  readonly type: string;
  readonly optional: boolean;
  readonly description: string | null;
};

/**
 * The same contract as one line per field, `path: type -- description`, for
 * an agent that needs the conventions without JSON Schema's nesting. A union
 * variant is addressed as `method{kind=dcf}`, array items as `fiscalYears[]`.
 * A description shared by several fields is printed at the first only.
 */
export function flattenJsonSchema(schema: SchemaNode): string {
  const fields = withoutRepeatedDescriptions(fieldsOf(schema, "", false));
  return fields.map(formatField).join("\n");
}

function formatField(field: FlatField): string {
  const optional = field.optional ? " (optional)" : "";
  const description = field.description === null ? "" : ` -- ${field.description}`;
  return `${field.path || "(document)"}: ${field.type}${optional}${description}`;
}

function withoutRepeatedDescriptions(fields: readonly FlatField[]): FlatField[] {
  return fields.map((field, i) =>
    field.description !== null && fields.findIndex((f) => f.description === field.description) !== i
      ? { ...field, description: null }
      : field,
  );
}

function fieldsOf(node: SchemaNode, path: string, optional: boolean): FlatField[] {
  const description = typeof node.description === "string" ? node.description : null;
  const nullable = nullableInner(node);
  if (nullable !== null) {
    const [own, ...children] = fieldsOf(
      { ...nullable, description: description ?? nullable.description },
      path,
      optional,
    );
    return own === undefined ? [] : [{ ...own, type: `${own.type} | null` }, ...children];
  }
  if (Array.isArray(node.oneOf)) {
    return variantFields(node.oneOf as SchemaNode[], path, optional, description);
  }
  const own: FlatField = {
    path,
    type: typeLabel(node),
    optional,
    description: description ?? scalarItemsDescription(node),
  };
  return [own, ...childFields(node, path)];
}

function scalarItemsDescription(node: SchemaNode): string | null {
  const items = node.type === "array" ? (node.items as SchemaNode | undefined) : undefined;
  return items !== undefined && isScalar(items) && typeof items.description === "string"
    ? items.description
    : null;
}

function nullableInner(node: SchemaNode): SchemaNode | null {
  const options = (node.anyOf ?? []) as SchemaNode[];
  const nonNull = options.filter((o) => o.type !== "null");
  return options.length === 2 && nonNull.length === 1 ? (nonNull[0] as SchemaNode) : null;
}

function variantFields(
  variants: readonly SchemaNode[],
  path: string,
  optional: boolean,
  description: string | null,
): FlatField[] {
  const key = discriminatorOf(variants);
  const labels = variants.map((v, i) =>
    key === null ? `#${i + 1}` : String((propertiesOf(v)[key] as SchemaNode).const),
  );
  const head: FlatField = {
    path,
    type: key === null ? `one of ${variants.length}` : `one of ${key} = ${labels.join(" | ")}`,
    optional,
    description,
  };
  return [
    head,
    ...variants.flatMap((variant, i) => {
      const at = key === null ? `${path}{${labels[i]}}` : `${path}{${key}=${labels[i]}}`;
      const rest = Object.fromEntries(
        Object.entries(propertiesOf(variant)).filter(([name]) => name !== key),
      );
      return [
        ...(typeof variant.description === "string"
          ? [{ path: at, type: "object", optional: false, description: variant.description }]
          : []),
        ...childFields({ ...variant, properties: rest }, at),
      ];
    }),
  ];
}

function discriminatorOf(variants: readonly SchemaNode[]): string | null {
  const first = variants[0];
  if (first === undefined) return null;
  const key = Object.keys(propertiesOf(first)).find((name) =>
    variants.every((v) => (propertiesOf(v)[name] as SchemaNode | undefined)?.const !== undefined),
  );
  return key ?? null;
}

function propertiesOf(node: SchemaNode): Record<string, SchemaNode> {
  return (node.properties ?? {}) as Record<string, SchemaNode>;
}

function childFields(node: SchemaNode, path: string): FlatField[] {
  const required = new Set((node.required ?? []) as string[]);
  const properties = Object.entries(propertiesOf(node)).flatMap(([name, child]) =>
    fieldsOf(child, path === "" ? name : `${path}.${name}`, !required.has(name)),
  );
  const items = node.type === "array" ? (node.items as SchemaNode | undefined) : undefined;
  if (items === undefined || isScalar(items)) return properties;
  const at = `${path}[]`;
  const itemFields =
    typeof items.description === "string" || items.oneOf !== undefined
      ? fieldsOf(items, at, false)
      : childFields(items, at);
  return [...properties, ...itemFields];
}

function isScalar(node: SchemaNode): boolean {
  if (node.properties !== undefined || node.oneOf !== undefined) return false;
  if (node.type === "array") return false;
  const inner = nullableInner(node);
  return inner === null ? node.type !== "object" : isScalar(inner);
}

function typeLabel(node: SchemaNode): string {
  if (node.const !== undefined) return JSON.stringify(node.const);
  if (Array.isArray(node.enum)) return node.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (Array.isArray(node.anyOf)) return (node.anyOf as SchemaNode[]).map(typeLabel).join(" | ");
  if (Array.isArray(node.type)) {
    return (node.type as string[]).map((t) => typeLabel({ ...node, type: t })).join(" | ");
  }
  if (node.type === "array") return arrayLabel(node);
  if (node.type === "string") return stringLabel(node);
  if (node.type === "number" || node.type === "integer") return numberLabel(node);
  return String(node.type ?? "any");
}

function arrayLabel(node: SchemaNode): string {
  const items = node.items as SchemaNode | undefined;
  const suffix = node.minItems === 1 ? " (non-empty)" : "";
  if (items === undefined || !isScalar(items)) return `array${suffix}`;
  const label = typeLabel(items);
  const element = label.includes(" ") ? `(${label})` : label;
  return `${element}[]${suffix}`;
}

function stringLabel(node: SchemaNode): string {
  if (node.format === "date") return "date";
  const pattern = typeof node.pattern === "string" ? node.pattern : null;
  return pattern !== null && pattern.length <= 30 ? `string ${pattern}` : "string";
}

const SAFE_BOUND = 1e15;

function numberLabel(node: SchemaNode): string {
  const bounds = [
    ["exclusiveMinimum", ">"],
    ["minimum", ">="],
    ["exclusiveMaximum", "<"],
    ["maximum", "<="],
  ]
    .filter(([key]) => {
      const value = node[key as string];
      return typeof value === "number" && Math.abs(value) < SAFE_BOUND;
    })
    .map(([key, op]) => `${op}${node[key as string]}`);
  return [String(node.type), ...bounds].join(" ");
}
