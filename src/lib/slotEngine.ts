export type Slot =
  | "PrimaryPress"
  | "SecondaryPress"
  | "Shoulders"
  | "Triceps"
  | "Pump"
  | "PrimaryRow"
  | "VerticalPull"
  | "SecondaryRow"
  | "RearDelts"
  | "Biceps"
  | "PrimarySquat"
  | "Hinge"
  | "SecondaryQuad"
  | "Hamstrings"
  | "Calves"

export type SessionBlueprint = {
  focus: "Push" | "Pull" | "Lower"
  slots: Slot[]
}

export const PUSH_BLUEPRINT: SessionBlueprint = {
  focus: "Push",
  slots: [
    "PrimaryPress",
    "SecondaryPress",
    "Shoulders",
    "Triceps",
    "Pump"
  ]
}

export const PULL_BLUEPRINT: SessionBlueprint = {
  focus: "Pull",
  slots: [
    "PrimaryRow",
    "VerticalPull",
    "SecondaryRow",
    "RearDelts",
    "Biceps"
  ]
}

export const LOWER_BLUEPRINT: SessionBlueprint = {
  focus: "Lower",
  slots: [
    "PrimarySquat",
    "Hinge",
    "SecondaryQuad",
    "Hamstrings",
    "Calves"
  ]
}

export const SLOT_CANDIDATES: Record<Slot, string[]> = {
  PrimaryPress: [
    "bench_press",
    "incline_bench_press",
    "dumbbell_bench_press",
    "chest_press"
  ],

  SecondaryPress: [
    "incline_bench_press",
    "overhead_press",
    "dumbbell_bench_press",
    "shoulder_press"
  ],

  Shoulders: [
    "overhead_press",
    "shoulder_press",
    "lateral_raise",
    "rear_delt_fly"
  ],

  Triceps: [
    "dip",
    "triceps_pressdown",
    "overhead_triceps_extension",
    "skullcrusher"
  ],

  Pump: [
    "lateral_raise",
    "triceps_pressdown",
    "push_up",
    "pec_deck"
  ],

  PrimaryRow: [
    "barbell_row",
    "chest_supported_row",
    "seated_cable_row",
    "t_bar_row"
  ],

  VerticalPull: [
    "pull_up",
    "chin_up",
    "lat_pulldown",
    "assisted_pull_up"
  ],

  SecondaryRow: [
    "chest_supported_row",
    "seated_cable_row",
    "barbell_row",
    "one_arm_dumbbell_row"
  ],

  RearDelts: [
    "face_pull",
    "rear_delt_fly",
    "reverse_pec_deck",
    "band_pull_apart"
  ],

  Biceps: [
    "hammer_curl",
    "curl",
    "incline_dumbbell_curl",
    "preacher_curl"
  ],

  PrimarySquat: [
    "ssb_squat",
    "squat",
    "leg_press",
    "hack_squat"
  ],

  Hinge: [
    "romanian_deadlift",
    "deadlift",
    "good_morning",
    "hamstring_curl"
  ],

  SecondaryQuad: [
    "leg_press",
    "hack_squat",
    "leg_extension",
    "split_squat"
  ],

  Hamstrings: [
    "hamstring_curl",
    "romanian_deadlift",
    "glute_ham_raise",
    "seated_leg_curl"
  ],

  Calves: [
    "calf_raise",
    "seated_calf_raise",
    "leg_press_calf_raise"
  ]
}

export function blueprintForFocus(focus: string): SessionBlueprint {
  if (focus === "Push") return PUSH_BLUEPRINT
  if (focus === "Pull") return PULL_BLUEPRINT
  return LOWER_BLUEPRINT
}

export function candidatesForSlot(slot: Slot): string[] {
  return SLOT_CANDIDATES[slot] ?? []
}

export function slotHasCandidate(slot: Slot, exerciseKey: string): boolean {
  return candidatesForSlot(slot).includes(exerciseKey)
}

export function allSlotsForFocus(focus: string): Array<{ slot: Slot; candidates: string[] }> {
  const blueprint = blueprintForFocus(focus)
  return blueprint.slots.map((slot) => ({
    slot,
    candidates: candidatesForSlot(slot)
  }))
}

