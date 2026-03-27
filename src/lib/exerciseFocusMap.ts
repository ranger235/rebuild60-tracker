export type ExerciseFocus = "Push" | "Pull" | "Lower" | "Mixed"

export function focusFromExerciseKey(key: string): ExerciseFocus {
  const k = String(key || "").toLowerCase();

  // Lower first so compounds do not get stolen by generic upper-body matches.
  if (
    k.includes("squat") ||
    k.includes("deadlift") ||
    k.includes("rdl") ||
    k.includes("romanian_deadlift") ||
    k.includes("hinge") ||
    k.includes("split_squat") ||
    k.includes("lunge") ||
    k.includes("leg_extension") ||
    k.includes("leg_curl") ||
    k.includes("hamstring") ||
    k.includes("glute") ||
    k.includes("hip_thrust") ||
    k.includes("calf") ||
    k.includes("good_morning")
  ) return "Lower";

  if (
    k.includes("row") ||
    k.includes("pull") ||
    k.includes("chin") ||
    k.includes("pulldown") ||
    k.includes("rear_delt") ||
    k.includes("face_pull") ||
    k.includes("shrug") ||
    k.includes("curl")
  ) return "Pull";

  if (
    k.includes("bench") ||
    k.includes("chest_press") ||
    k.includes("press") ||
    k.includes("dip") ||
    k.includes("pushdown") ||
    k.includes("triceps") ||
    k.includes("skull") ||
    k.includes("fly") ||
    k.includes("lateral_raise") ||
    k.includes("push_up")
  ) return "Push";

  return "Mixed";
}


