/** Text for the report. Every function here returns a plain string; escaping is the caller's. */

/** toFixed without "-0": a value that rounds to zero prints as zero. */
export function fixed(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return Number(text) === 0 ? (0).toFixed(digits) : text;
}

export function formatPerShare(currency: string, value: number): string {
  return `${currency} ${Number(fixed(value, 2)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Statement figures are in millions; one decimal on billions, none on millions. */
export function formatMillions(currency: string, millions: number): string {
  const abs = Math.abs(millions);
  const sign = millions < 0 ? "-" : "";
  if (abs >= 1000) return `${sign}${currency} ${(abs / 1000).toFixed(1)}bn`;
  return `${sign}${currency} ${abs.toFixed(0)}m`;
}

/** Axis ticks: no currency, compact. */
export function formatMillionsTick(millions: number): string {
  const abs = Math.abs(millions);
  if (abs >= 1000) return `${(millions / 1000).toFixed(abs >= 10000 ? 0 : 1)}bn`;
  return Number(fixed(millions, 0)) === 0 ? "0" : `${fixed(millions, 0)}m`;
}

export function formatPercent(fraction: number, digits = 1): string {
  return `${fixed(fraction * 100, digits)}%`;
}

export function formatSignedPercent(fraction: number, digits = 0): string {
  const text = formatPercent(fraction, digits);
  return fraction > 0 ? `+${text}` : text.replace("-", "−");
}

export function formatMultiple(value: number): string {
  return `${fixed(value, 1)}x`;
}

/** camelCase vocabulary from the documents, for display: qualityCompounder -> quality compounder. */
export function humanise(identifier: string): string {
  return identifier.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
