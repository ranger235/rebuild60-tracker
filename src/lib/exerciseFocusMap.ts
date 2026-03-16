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

  // --- CHEST ---
  if (
    k.includes("bench") ||
    k.includes("chest press") ||
    k.includes("dip")
  ) return "Chest"

  // --- BACK ---
  if (
    k.includes("row") ||
    k.includes("pull") ||
    k.includes("chin")
  ) return "Back"

  // --- SHOULDERS ---
  if (
    k.includes("overhead press") ||
    k.includes("shoulder press") ||
    k.includes("lateral raise")
  ) return "Shoulders"

  // --- BICEPS ---
  if (
    k.includes("curl")
  ) return "Biceps"

  // --- TRICEPS ---
  if (
    k.includes("tricep") ||
    k.includes("pushdown") ||
    k.includes("skull")
  ) return "Triceps"

  // --- QUADS ---
  if (
    k.includes("squat") ||
    k.includes("leg press")
  ) return "Quads"

  // --- HAMSTRINGS ---
  if (
    k.includes("rdl") ||
    k.includes("hamstring")
  ) return "Hamstrings"

  // --- GLUTES ---
  if (
    k.includes("hip thrust") ||
    k.includes("glute")
  ) return "Glutes"

  // --- FALLBACK LOWER ---
  if (
    k.includes("deadlift") ||
    k.includes("lunge") ||
    k.includes("leg")
  ) return "Lower"

  return "Mixed"
}

