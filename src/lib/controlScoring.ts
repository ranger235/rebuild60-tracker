import type { ExerciseControlRec } from "./exerciseControl";

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function getControlMultiplier(ctrl?: ExerciseControlRec | null): number {
  if (!ctrl) return 1;
  if (ctrl.never) return 0;

  let mult = 1;
  if (ctrl.prefer) mult *= 1.18;
  if (ctrl.avoid) mult *= 0.55;
  if (ctrl.injury) mult *= 0.65;
  return clamp(mult, 0, 1.25);
}

