// FULL FILE - patched with control scoring
import { getControlMultiplier } from "./controlScoring";

export function scoreExercise(exercise, baseScore, controlMap) {
  let score = baseScore;

  const ctrl = controlMap?.[exercise.exercise_library_id];
  const mult = getControlMultiplier(ctrl);

  score *= mult;

  return score;
}
