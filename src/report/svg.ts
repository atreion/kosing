/** Small SVG primitives for the report's charts. Strings in, strings out. */

import { escapeHtml } from "./format.ts";

export type Scale = (value: number) => number;

export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}

/** Round ticks covering [lo, hi]; the returned domain is the first and last tick. */
export function niceTicks(lo: number, hi: number, count = 5): readonly number[] {
  const step = niceStep(hi - lo || Math.abs(hi) || 1, count);
  const first = Math.floor(lo / step) * step;
  const last = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= last + step / 2; t += step) ticks.push(Number(t.toPrecision(12)));
  return ticks;
}

export function svg(width: number, height: number, label: string, body: string): string {
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}" class="chart">${body}</svg>`;
}

export function text(
  x: number,
  y: number,
  content: string,
  options: { readonly anchor?: "start" | "middle" | "end"; readonly cls?: string } = {},
): string {
  const anchor = options.anchor ?? "start";
  const cls = options.cls ?? "tick";
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" class="${cls}">${escapeHtml(content)}</text>`;
}

export function line(x1: number, y1: number, x2: number, y2: number, cls: string): string {
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${cls}"/>`;
}

export function tooltip(content: string): string {
  return `<title>${escapeHtml(content)}</title>`;
}

/** A column rounded 4px at its data end and square at the baseline, either side of it. */
export function columnPath(x: number, width: number, baseline: number, top: number): string {
  const height = Math.abs(baseline - top);
  const r = Math.min(4, width / 2, height);
  if (top <= baseline) {
    return `M${x},${baseline}V${top + r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top + r}V${baseline}Z`;
  }
  return `M${x},${baseline}V${top - r}Q${x},${top} ${x + r},${top}H${x + width - r}Q${x + width},${top} ${x + width},${top - r}V${baseline}Z`;
}

export function polyline(points: readonly (readonly [number, number])[], cls: string): string {
  if (points.length < 2) return "";
  const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  return `<path d="${d.join("")}" class="${cls}"/>`;
}
