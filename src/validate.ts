import { err, ok, type Result } from "./result.ts";

declare const positiveBrand: unique symbol;
declare const nonNegativeBrand: unique symbol;

export type PositiveNumber = number & { readonly [positiveBrand]: true };

export type NonNegativeNumber = number & { readonly [nonNegativeBrand]: true };

export type ValidationError =
  | {
      readonly kind: "not_positive";
      readonly name: string;
      readonly value: number;
    }
  | {
      readonly kind: "not_non_negative";
      readonly name: string;
      readonly value: number;
    }
  | {
      readonly kind: "wrong_length";
      readonly name: string;
      readonly actual: number;
      readonly expected: number;
    };

export function requirePositive(
  value: number,
  name: string,
): Result<PositiveNumber, ValidationError> {
  if (value > 0) {
    return ok(value as PositiveNumber);
  }

  return err({ kind: "not_positive", name, value });
}

export function requireNonNegative(
  value: number,
  name: string,
): Result<NonNegativeNumber, ValidationError> {
  if (value >= 0) {
    return ok(value as NonNegativeNumber);
  }

  return err({ kind: "not_non_negative", name, value });
}

export function requirePathLength(
  path: readonly number[],
  expected: number,
  name: string,
): Result<readonly number[], ValidationError> {
  if (path.length === expected) {
    return ok(path);
  }

  return err({ kind: "wrong_length", name, actual: path.length, expected });
}
