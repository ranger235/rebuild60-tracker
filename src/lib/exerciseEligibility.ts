import { getAllExercises } from "./exerciseRegistry";
import type { ExerciseDefinition } from "./exerciseTypes";
import { DEFAULT_EQUIPMENT_PROFILE, normalizeEquipmentProfile } from "./equipmentRegistry";
import type { EquipmentId, EquipmentProfile, EquipmentRequirementGroup } from "./equipmentTypes";

const REQUIREMENT_RULES: Record<string, EquipmentRequirementGroup[]> = {
  bench_press: [["barbell", "adjustable_bench", "power_rack"]],
  incline_bench_press: [["barbell", "adjustable_bench", "power_rack"]],
  dumbbell_bench_press: [["adjustable_dumbbells", "adjustable_bench"]],
  chest_press: [["chest_press_machine"]],
  overhead_press: [["barbell", "power_rack"]],
  shoulder_press: [["adjustable_dumbbells", "adjustable_bench"], ["adjustable_dumbbells"], ["cable_pulldown_station"]],
  lateral_raise: [["adjustable_dumbbells"], ["resistance_bands"], ["cable_pulldown_station"]],
  rear_delt_fly: [["adjustable_dumbbells"], ["cable_pulldown_station"], ["reverse_pec_deck_machine"]],
  dip: [["dip_station"]],
  triceps_pressdown: [["cable_pulldown_station"], ["resistance_bands"]],
  overhead_triceps_extension: [["adjustable_dumbbells"], ["resistance_bands"], ["cable_pulldown_station"]],
  skullcrusher: [["barbell", "adjustable_bench"], ["adjustable_dumbbells", "adjustable_bench"]],
  push_up: [["bodyweight_space"]],
  pec_deck: [["pec_deck_machine"]],
  barbell_row: [["barbell"]],
  chest_supported_row: [["adjustable_dumbbells", "adjustable_bench"]],
  seated_cable_row: [["cable_pulldown_station"]],
  t_bar_row: [["t_bar_row_station"], ["landmine_attachment", "barbell"]],
  pull_up: [["chin_up_bar"]],
  chin_up: [["chin_up_bar"]],
  lat_pulldown: [["cable_pulldown_station"]],
  assisted_pull_up: [["chin_up_bar", "resistance_bands"]],
  one_arm_dumbbell_row: [["adjustable_dumbbells", "adjustable_bench"]],
  face_pull: [["cable_pulldown_station"], ["resistance_bands"]],
  reverse_pec_deck: [["reverse_pec_deck_machine"]],
  band_pull_apart: [["resistance_bands"]],
  hammer_curl: [["adjustable_dumbbells"], ["resistance_bands"]],
  curl: [["barbell"], ["adjustable_dumbbells"], ["cable_pulldown_station"], ["resistance_bands"]],
  incline_dumbbell_curl: [["adjustable_dumbbells", "adjustable_bench"]],
  preacher_curl: [["preacher_station"], ["adjustable_dumbbells", "adjustable_bench"]],
  ssb_squat: [["safety_squat_bar", "power_rack"]],
  squat: [["barbell", "power_rack"]],
  leverage_squat: [["leverage_squat_attachment"]],
  romanian_deadlift: [["barbell"], ["adjustable_dumbbells"]],
  deadlift: [["barbell"]],
  good_morning: [["barbell", "power_rack"]],
  back_extension: [["roman_chair"]],
  hamstring_curl: [["leg_extension_curl_attachment"]],
  leg_extension: [["leg_extension_curl_attachment"]],
  split_squat: [["adjustable_dumbbells"], ["barbell", "power_rack"], ["bodyweight_space"]],
  glute_ham_raise: [["glute_ham_bench"], ["roman_chair"]],
  seated_leg_curl: [["leg_extension_curl_attachment"]],
  calf_raise: [["bodyweight_space"], ["adjustable_dumbbells"], ["barbell"]],
  seated_calf_raise: [["seated_calf_machine"], ["adjustable_dumbbells", "adjustable_bench"]],
  leg_press_calf_raise: [["leg_press_machine"]],
};

export function normalizeProfile(profile: unknown): EquipmentProfile {
  return normalizeEquipmentProfile(profile ?? DEFAULT_EQUIPMENT_PROFILE);
}

function groupSatisfied(group: EquipmentRequirementGroup, available: Set<EquipmentId>): boolean {
  return group.every((item) => available.has(item));
}

export function isExerciseEligibleForProfile(exercise: ExerciseDefinition, profile: EquipmentProfile): boolean {
  const normalized = normalizeProfile(profile);
  const available = new Set(normalized.available);
  const rules = REQUIREMENT_RULES[exercise.key];
  if (rules?.length) {
    return rules.some((group) => groupSatisfied(group, available));
  }

  // Conservative fallback for anything not explicitly modeled yet.
  if (!exercise.equipment.length) return true;
  return exercise.equipment.some((tag) => {
    if (tag === "bodyweight") return available.has("bodyweight_space");
    if (tag === "band") return available.has("resistance_bands");
    if (tag === "barbell") return available.has("barbell");
    if (tag === "dumbbell") return available.has("adjustable_dumbbells");
    if (tag === "bench") return available.has("adjustable_bench");
    if (tag === "rack") return available.has("power_rack");
    if (tag === "ssb") return available.has("safety_squat_bar");
    if (tag === "cable") return available.has("cable_pulldown_station");
    return false;
  });
}

export function getEligibleExerciseKeysForProfile(profile: EquipmentProfile): Set<string> {
  const normalized = normalizeProfile(profile);
  return new Set(
    getAllExercises()
      .filter((exercise) => isExerciseEligibleForProfile(exercise, normalized))
      .map((exercise) => exercise.key)
  );
}
