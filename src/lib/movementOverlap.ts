import { SLOT_CANDIDATES, type Slot } from "./slotEngine";

export type MovementFamily =
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "hinge"
  | "squat"
  | "rear_delt"
  | "lunge"
  | "biceps"
  | "triceps"
  | "calves"
  | "other";

export function getMovementFamilyForExerciseKey(key: string): MovementFamily {
  const k = String(key || "").toLowerCase();
  if (["bench_press", "dumbbell_bench_press", "chest_press", "pec_deck", "push_up"].includes(k)) return "horizontal_push";
  if (["incline_bench_press", "overhead_press", "shoulder_press", "dip", "lateral_raise"].includes(k)) return "vertical_push";
  if (["barbell_row", "chest_supported_row", "seated_cable_row", "t_bar_row", "one_arm_dumbbell_row"].includes(k)) return "horizontal_pull";
  if (["pull_up", "chin_up", "lat_pulldown", "assisted_pull_up"].includes(k)) return "vertical_pull";
  if (["face_pull", "rear_delt_fly", "reverse_pec_deck", "band_pull_apart"].includes(k)) return "rear_delt";
  if (["hammer_curl", "curl", "incline_dumbbell_curl", "preacher_curl"].includes(k)) return "biceps";
  if (["triceps_pressdown", "overhead_triceps_extension", "skullcrusher"].includes(k)) return "triceps";
  if (["ssb_squat", "squat", "leg_extension", "leg_press_calf_raise"].includes(k)) return "squat";
  if (["romanian_deadlift", "deadlift", "good_morning", "hamstring_curl", "glute_ham_raise", "seated_leg_curl"].includes(k)) return "hinge";
  if (["split_squat"].includes(k)) return "lunge";
  if (["calf_raise", "seated_calf_raise"].includes(k)) return "calves";
  return "other";
}

function hasFamily(selectedKeys: string[], family: MovementFamily): boolean {
  return selectedKeys.some((key) => getMovementFamilyForExerciseKey(key) === family);
}

function unique(list: string[]): string[] {
  return [...new Set(list.filter(Boolean))];
}

export function broadenCandidatesForCoveredSlot(slot: Slot, baseCandidates: string[], selectedKeys: string[]): string[] {
  if (slot === "SecondaryRow" && hasFamily(selectedKeys, "horizontal_pull") && hasFamily(selectedKeys, "vertical_pull")) {
    return unique([...baseCandidates, ...SLOT_CANDIDATES.RearDelts]);
  }
  if (slot === "SecondaryPress" && hasFamily(selectedKeys, "horizontal_push") && hasFamily(selectedKeys, "vertical_push")) {
    return unique([...baseCandidates, ...SLOT_CANDIDATES.Shoulders, ...SLOT_CANDIDATES.Triceps]);
  }
  if (slot === "SecondaryQuad" && hasFamily(selectedKeys, "squat") && hasFamily(selectedKeys, "hinge")) {
    return unique([...baseCandidates, ...SLOT_CANDIDATES.Hamstrings]);
  }
  return baseCandidates;
}

export function applyMovementOverlapPenalty(slot: Slot, candidateKey: string, selectedKeys: string[]): number {
  const family = getMovementFamilyForExerciseKey(candidateKey);
  const sameFamilyCount = selectedKeys.filter((key) => getMovementFamilyForExerciseKey(key) === family).length;

  let penalty = 0;
  if (sameFamilyCount === 1) penalty -= 8;
  if (sameFamilyCount >= 2) penalty -= 15;

  const broadenedSupportSlot = slot === "SecondaryRow" || slot === "SecondaryPress" || slot === "SecondaryQuad";
  if (!broadenedSupportSlot) return penalty;

  if (slot === "SecondaryRow" && hasFamily(selectedKeys, "horizontal_pull") && hasFamily(selectedKeys, "vertical_pull") && family === "horizontal_pull") {
    penalty -= 22;
  }
  if (slot === "SecondaryPress" && hasFamily(selectedKeys, "horizontal_push") && hasFamily(selectedKeys, "vertical_push") && (family === "horizontal_push" || family === "vertical_push")) {
    penalty -= 18;
  }
  if (slot === "SecondaryQuad" && hasFamily(selectedKeys, "squat") && hasFamily(selectedKeys, "hinge") && family === "squat") {
    penalty -= 18;
  }

  return penalty;
}

