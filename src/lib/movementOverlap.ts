import type { Slot } from "./slotEngine";

export type MovementFamily =
  | "horizontal_press"
  | "incline_press"
  | "vertical_press"
  | "chest_isolation"
  | "horizontal_pull"
  | "vertical_pull"
  | "rear_delt"
  | "biceps"
  | "triceps"
  | "squat"
  | "unilateral_quad"
  | "hinge"
  | "hamstring_curl"
  | "calves"
  | "other";

function normalizeKey(input: string): string {
  return String(input || "").trim().toLowerCase();
}

export function movementFamilyForExercise(exerciseKey: string): MovementFamily {
  const key = normalizeKey(exerciseKey);

  if (["bench_press", "dumbbell_bench_press", "chest_press", "push_up", "dip"].includes(key)) {
    return "horizontal_press";
  }
  if (["incline_bench_press"].includes(key)) return "incline_press";
  if (["overhead_press", "shoulder_press"].includes(key)) return "vertical_press";
  if (["pec_deck"].includes(key)) return "chest_isolation";

  if (["barbell_row", "chest_supported_row", "seated_cable_row", "t_bar_row", "one_arm_dumbbell_row"].includes(key)) {
    return "horizontal_pull";
  }
  if (["pull_up", "chin_up", "lat_pulldown", "assisted_pull_up"].includes(key)) return "vertical_pull";
  if (["face_pull", "rear_delt_fly", "reverse_pec_deck", "band_pull_apart"].includes(key)) return "rear_delt";
  if (["hammer_curl", "curl", "incline_dumbbell_curl", "preacher_curl"].includes(key)) return "biceps";
  if (["triceps_pressdown", "overhead_triceps_extension", "skullcrusher"].includes(key)) return "triceps";

  if (["ssb_squat", "squat"].includes(key)) return "squat";
  if (["split_squat", "leg_extension"].includes(key)) return "unilateral_quad";
  if (["romanian_deadlift", "deadlift", "good_morning"].includes(key)) return "hinge";
  if (["hamstring_curl", "glute_ham_raise", "seated_leg_curl"].includes(key)) return "hamstring_curl";
  if (["calf_raise", "seated_calf_raise", "leg_press_calf_raise"].includes(key)) return "calves";

  if (key.includes("row")) return "horizontal_pull";
  if (key.includes("pull") || key.includes("pulldown") || key.includes("chin")) return "vertical_pull";
  if (key.includes("bench") || key.includes("chest_press") || key.includes("push_up") || key == 'dip') return "horizontal_press";
  if (key.includes("overhead") || key.includes("shoulder_press")) return "vertical_press";
  if (key.includes("rear_delt") || key.includes("face_pull") || key.includes("reverse_pec_deck")) return "rear_delt";
  if (key.includes("curl")) return "biceps";
  if (key.includes("triceps") || key.includes("skullcrusher") || key.includes("pressdown")) return "triceps";
  if (key.includes("squat")) return "squat";
  if (key.includes("deadlift") || key.includes("romanian") || key.includes("good_morning")) return "hinge";
  if (key.includes("hamstring")) return "hamstring_curl";
  if (key.includes("calf")) return "calves";

  return "other";
}

function isSupportSlot(slot: Slot): boolean {
  return ["SecondaryPress", "SecondaryRow", "Pump", "Shoulders", "RearDelts", "Biceps", "Triceps", "SecondaryQuad", "Hamstrings", "Calves"].includes(slot);
}

function sameFamilyPenalty(family: MovementFamily, duplicateCount: number, slot: Slot): number {
  if (family === "other" || duplicateCount <= 0) return 0;

  const supportMultiplier = isSupportSlot(slot) ? 1.15 : 1;

  if (duplicateCount >= 2) return Math.round(-12 * supportMultiplier);

  switch (family) {
    case "horizontal_pull":
    case "horizontal_press":
    case "squat":
    case "hinge":
      return Math.round(-10 * supportMultiplier);
    case "vertical_pull":
    case "vertical_press":
      return Math.round(-7 * supportMultiplier);
    case "rear_delt":
    case "biceps":
    case "triceps":
    case "unilateral_quad":
    case "hamstring_curl":
    case "calves":
    case "chest_isolation":
      return Math.round(-4 * supportMultiplier);
    default:
      return Math.round(-6 * supportMultiplier);
  }
}

export function applyMovementOverlapPenalty(
  candidateKey: string,
  selectedKeys: Iterable<string>,
  slot: Slot
): { delta: number; reason?: string } {
  const family = movementFamilyForExercise(candidateKey);
  if (family === "other") return { delta: 0 };

  const selectedFamilies = Array.from(selectedKeys, movementFamilyForExercise).filter((value) => value !== "other");
  const duplicateCount = selectedFamilies.filter((value) => value === family).length;
  if (duplicateCount <= 0) return { delta: 0 };

  const delta = sameFamilyPenalty(family, duplicateCount, slot);
  if (delta === 0) return { delta: 0 };

  return {
    delta,
    reason:
      duplicateCount >= 2
        ? `Overlap guard: heavy ${family.replace(/_/g, " ")} redundancy already exists in this session.`
        : `Overlap guard: another ${family.replace(/_/g, " ")} pattern is already covering this lane.`
  };
}
