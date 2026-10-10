/**
 * Value per share over a WACC x terminal-growth grid. Steps are absolute
 * deltas around the base inputs and are sorted so each axis reads low to
 * high and monotonicity is a property. A cell the Gordon formula cannot
 * define is null. With an exit-multiple terminal, growth has no meaning and
 * the grid is one column wide.
 */

import type { NonEmpty } from "../domain/types.ts";
import { computeDcf, type DcfInputs, type Terminal } from "./dcf.ts";

export type SensitivityInputs = {
  readonly base: DcfInputs;
  readonly waccSteps: NonEmpty<number>;
  readonly terminalGrowthSteps: NonEmpty<number>;
};

export type SensitivityResult = {
  readonly axes: {
    readonly wacc: readonly number[];
    readonly terminalGrowth: readonly number[] | null;
  };
  /** grid[i][j]: wacc axis i, terminal growth axis j. */
  readonly grid: readonly (readonly (number | null)[])[];
  readonly base: readonly [number, number];
};

function sorted(steps: readonly number[]): readonly number[] {
  return [...steps].sort((a, b) => a - b);
}

function indexOfZero(steps: readonly number[]): number {
  const i = steps.indexOf(0);
  if (i < 0) throw new Error("unreachable: decode requires a 0 step");
  return i;
}

function withGrowth(terminal: Terminal, delta: number): Terminal {
  return terminal.kind === "perpetuityGrowth"
    ? { kind: "perpetuityGrowth", growth: terminal.growth + delta }
    : terminal;
}

function cell(base: DcfInputs, waccDelta: number, growthDelta: number): number | null {
  const r = computeDcf({
    ...base,
    wacc: base.wacc + waccDelta,
    terminal: withGrowth(base.terminal, growthDelta),
  });
  return r.kind === "value" ? r.valuePerShare : null;
}

export function computeSensitivity(inputs: SensitivityInputs): SensitivityResult {
  const { base } = inputs;
  const { terminal } = base;
  const waccSteps = sorted(inputs.waccSteps);
  const growthSteps =
    terminal.kind === "perpetuityGrowth" ? sorted(inputs.terminalGrowthSteps) : [0];
  const grid = waccSteps.map((dw) => growthSteps.map((dg) => cell(base, dw, dg)));
  return {
    axes: {
      wacc: waccSteps.map((d) => base.wacc + d),
      terminalGrowth:
        terminal.kind === "perpetuityGrowth" ? growthSteps.map((d) => terminal.growth + d) : null,
    },
    grid,
    base: [indexOfZero(waccSteps), indexOfZero(growthSteps)],
  };
}
