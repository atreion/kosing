/** The whole valuator in one call, for tests, the CLI and anything in-process. */

import { decode } from "./input/decode.ts";
import { type DecodeResult, decoded, failed } from "./input/errors.ts";
import { assemble } from "./results/assemble.ts";
import { DEFAULT_VALUATOR_OPTIONS, type Results, type ValuatorOptions } from "./results/types.ts";

export function valuate(
  factsJson: unknown,
  caseJson?: unknown,
  options: ValuatorOptions = DEFAULT_VALUATOR_OPTIONS,
): DecodeResult<Results> {
  const d = decode(factsJson, caseJson, options.pointInTime ? options.valuedOn : null);
  if (!d.success) return failed(d.error);
  return decoded(assemble(d.data, options));
}
