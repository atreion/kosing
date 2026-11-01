/**
 * For a valuation as of a past date: every source must have been published
 * by then, and so must the price and the reports the facts rest on, or the
 * valuation knows something the market did not.
 */

import type { IsoDate } from "../domain/types.ts";
import { type DecodeError, decodeError } from "./errors.ts";
import type { Facts } from "./facts.ts";

/** A price feed has no publication date; the price's own date stands for it. */
const UNDATED_KINDS = new Set(["marketDataFeed"]);

/** A month-only date is taken as published by the as-of date when it is that month or earlier. */
function publishedBy(published: string, asOf: IsoDate): boolean {
  return published.length === 7 ? published <= asOf.slice(0, 7) : published <= asOf;
}

function datedAfter(path: string, date: IsoDate, asOf: IsoDate, what: string): DecodeError[] {
  return date <= asOf
    ? []
    : [decodeError("facts", "pointInTime.datedAfter", path, `${what} ${date} is after ${asOf}`)];
}

export function checkPointInTime(facts: Facts, asOf: IsoDate): DecodeError[] {
  const sources = facts.sources.flatMap((s, i): DecodeError[] => {
    const path = `sources.${i}.published`;
    if (s.published === null) {
      return UNDATED_KINDS.has(s.kind)
        ? []
        : [
            decodeError(
              "facts",
              "pointInTime.sourceUndated",
              path,
              `${s.id} has no publication date`,
            ),
          ];
    }
    return publishedBy(s.published, asOf)
      ? []
      : [
          decodeError(
            "facts",
            "pointInTime.sourcePublishedAfter",
            path,
            `${s.id} "${s.title}" was published ${s.published}, after ${asOf}`,
          ),
        ];
  });
  return [
    ...datedAfter("market.asOf", facts.market.asOf, asOf, "the price"),
    ...datedAfter("asOf", facts.asOf, asOf, "the facts' report period"),
    ...datedAfter("balanceSheet.asOf", facts.balanceSheet.asOf, asOf, "the balance sheet"),
    ...sources,
  ];
}
