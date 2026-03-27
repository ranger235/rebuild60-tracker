export type ExerciseFocus = "Push" | "Pull" | "Lower" | "Mixed";

export function focusFromExerciseKey(key: string): ExerciseFocus {
  const k = key.toLowerCase();

  // Push: chest, shoulders, triceps
  if (
    k.includes("bench") ||
    k.includes("chest press") ||
    k.includes("dip") ||
    k.includes("overhead press") ||
    k.includes("shoulder press") ||
    k.includes("lateral raise") ||
    k.includes("tricep") ||
    k.includes("pushdown") ||
    k.includes("skull") ||
    k.includes("push-up") ||
    k.includes("push up") ||
    k.includes("pec deck")
  ) return "Push";

  // Pull: back, rear delts, biceps
  if (
    k.includes("row") ||
    k.includes("pull") ||
    k.includes("chin") ||
    k.includes("lat pulldown") ||
    k.includes("face pull") ||
    k.includes("reverse pec deck") ||
    k.includes("curl")
  ) return "Pull";

  // Lower: quads, hamstrings, glutes, general leg work
  if (
    k.includes("squat") ||
    k.includes("leg press") ||
    k.includes("rdl") ||
    k.includes("romanian deadlift") ||
    k.includes("hamstring") ||
    k.includes("hip thrust") ||
    k.includes("glute") ||
    k.includes("deadlift") ||
    k.includes("lunge") ||
    k.includes("leg") ||
    k.includes("calf")
  ) return "Lower";

  return "Mixed";
}


