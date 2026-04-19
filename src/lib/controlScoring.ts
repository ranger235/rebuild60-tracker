import { ExerciseControl } from "./exerciseControl";

export function getControlMultiplier(ctrl?: ExerciseControl) {
  if (!ctrl) return 1;

  if (ctrl.never) return 0;

  let mult = 1;

  if (ctrl.prefer) mult *= 1.25;
  if (ctrl.avoid) mult *= 0.6;
  if (ctrl.injury) mult *= 0.5;

  return mult;
}
