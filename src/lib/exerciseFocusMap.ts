// exerciseFocusMap.ts
// Central place for exercise → focus classification

export type ExerciseFocus =
  | "Push"
  | "Pull"
  | "Lower"
  | "Chest"
  | "Back"
  | "Shoulders"
  | "Biceps"
  | "Triceps"
  | "Quads"
  | "Hamstrings"
  | "Glutes"
  | "Mixed"

export function focusFromExerciseKey(key: string): ExerciseFocus {

  const k = key.toLowerCase()

  // Push patterns
  if (
    k.includes("bench") ||
    k.includes("dip") ||
    k.includes("press")
  ) return "Push"

  // Pull patterns
  if (
    k.includes("row") ||
    k.includes("pull") ||
    k.includes("chin")
  ) return "Pull"

  // Lower body patterns
  if (
    k.includes("squat") ||
    k.includes("deadlift") ||
    k.includes("lunge") ||
    k.includes("leg")
  ) return "Lower"

  return "Mixed"
}
