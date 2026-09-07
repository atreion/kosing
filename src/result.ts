export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

type ResultRecord = Record<string, Result<unknown, unknown>>;

type ValueOf<R> = R extends { readonly ok: true; readonly value: infer T } ? T : never;
type ErrorOf<R> = R extends { readonly ok: false; readonly error: infer E } ? E : never;

type Values<R extends ResultRecord> = { readonly [K in keyof R]: ValueOf<R[K]> };
type Errors<R extends ResultRecord> = ErrorOf<R[keyof R]>;

/**
 * Combines a record of Results into one: the unwrapped values under the same
 * keys when every entry succeeded, otherwise every error found, in key order.
 *
 * The two `as` casts are sanctioned: the values object is assembled key by
 * key at runtime, and the compiler cannot relate that back to `Values<R>`.
 */
export function collectResults<R extends ResultRecord>(
  results: R,
): Result<Values<R>, readonly Errors<R>[]> {
  const values: Record<string, unknown> = {};
  const errors: Errors<R>[] = [];

  for (const [key, result] of Object.entries(results)) {
    if (result.ok) {
      values[key] = result.value;
    } else {
      errors.push(result.error as Errors<R>);
    }
  }

  if (errors.length > 0) {
    return err(errors);
  }

  return ok(values as Values<R>);
}
