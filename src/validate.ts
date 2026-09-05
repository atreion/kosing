import { err, ok, type Result } from "./result.ts";

declare const brand: unique symbol;

export type Brand<T, Name extends string> = T & { readonly [brand]: Name };
export type PositiveNumber = Brand<number, "PositiveNumber">;
export type NonNegativeNumber = Brand<number, "NonNegativeNumber">;
export type UnitInterval = Brand<number, "UnitInterval">;
export type PositiveInteger = Brand<number, "PositiveInteger">;

type Named = { readonly name: string };
type Rejected<Kind extends string> = Named & { readonly kind: Kind; readonly value: number };

export type NotPositive = Rejected<"notPositive">;
export type NotNonNegative = Rejected<"notNonNegative">;
export type NotUnitInterval = Rejected<"notUnitInterval">;
export type NotPositiveInteger = Rejected<"notPositiveInteger">;
export type WrongLength = Named & {
  readonly kind: "wrongLength";
  readonly actual: number;
  readonly expected: number;
};

export type ValidationError =
  | NotPositive
  | NotNonNegative
  | NotUnitInterval
  | NotPositiveInteger
  | WrongLength;

export function parsePositiveNumber(
  value: number,
  name: string,
): Result<PositiveNumber, NotPositive> {
  if (value > 0) {
    return ok(value as PositiveNumber);
  }

  return err({ kind: "notPositive", name, value });
}

export function parseNonNegativeNumber(
  value: number,
  name: string,
): Result<NonNegativeNumber, NotNonNegative> {
  if (value >= 0) {
    return ok(value as NonNegativeNumber);
  }

  return err({ kind: "notNonNegative", name, value });
}

export function parseUnitInterval(
  value: number,
  name: string,
): Result<UnitInterval, NotUnitInterval> {
  if (value >= 0 && value <= 1) {
    return ok(value as UnitInterval);
  }

  return err({ kind: "notUnitInterval", name, value });
}

export function parsePositiveInteger(
  value: number,
  name: string,
): Result<PositiveInteger, NotPositiveInteger> {
  if (Number.isInteger(value) && value > 0) {
    return ok(value as PositiveInteger);
  }

  return err({ kind: "notPositiveInteger", name, value });
}

export function parsePathLength(
  path: readonly number[],
  expected: number,
  name: string,
): Result<readonly number[], WrongLength> {
  if (path.length === expected) {
    return ok(path);
  }

  return err({ kind: "wrongLength", name, actual: path.length, expected });
}
