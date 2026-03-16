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

export type CandidateSelectionMode = "Progression" | "Base" | "Reduced volume"

export type CandidateHistoryLite = {
  key: string
  recentSets?: number | null
  lastPerformedDaysAgo?: number | null
  recentTopSetE1RMs?: number[]
  recentAvgSetReps?: number[]
}

export type CandidateScore = {
  key: string
  score: number
  tags: string[]
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

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function isRecoveryFriendly(key: string): boolean {
  return key.includes("machine") || key.includes("press") || key.includes("supported") || key.includes("cable") || key.includes("extension") || key.includes("curl") || key.includes("raise")
}

function hasPositiveTrend(hist?: CandidateHistoryLite | null): boolean {
  const top = hist?.recentTopSetE1RMs ?? []
  if (top.length < 3) return false
  const [a, b, c] = top.slice(-3)
  const prior = Math.max(a, b)
  return prior > 0 ? (c - prior) / prior > 0.015 : false
}

function isStalled(hist?: CandidateHistoryLite | null): boolean {
  const top = hist?.recentTopSetE1RMs ?? []
  const avg = hist?.recentAvgSetReps ?? []
  if (top.length < 3 || avg.length < 3) return false
  const [t1, t2, t3] = top.slice(-3)
  const [a1, a2, a3] = avg.slice(-3)
  const prior = Math.max(t1, t2)
  const topDelta = prior > 0 ? (t3 - prior) / prior : 0
  const fatigueRising = a3 < a1 - 0.5 || a3 < a2 - 0.5
  return topDelta <= 0.01 && fatigueRising
}

export function scoreCandidateForSlot(
  slot: Slot,
  candidateKey: string,
  histories: CandidateHistoryLite[],
  mode: CandidateSelectionMode
): CandidateScore {
  const hist = histories.find((h) => h.key === candidateKey) ?? null
  const recentSets = Math.max(0, hist?.recentSets ?? 0)
  const daysAgo = hist?.lastPerformedDaysAgo ?? 999

  const familiarity = clamp01(recentSets / 12)
  const freshness = clamp01(Math.min(daysAgo, 28) / 28)

  let score = familiarity * 0.7 + freshness * 0.3
  const tags: string[] = []

  if (familiarity >= 0.55) tags.push("Familiar")
  if (freshness >= 0.6) tags.push("Fresh")

  if (isStalled(hist)) {
    score -= 0.35
    tags.push("Stall penalty")
  }

  if (mode === "Progression" && hasPositiveTrend(hist)) {
    score += 0.18
    tags.push("Progression path")
  }

  if (mode === "Reduced volume" && isRecoveryFriendly(candidateKey)) {
    score += 0.15
    tags.push("Recovery-friendly")
  }

  if ((slot === "Pump" || slot === "RearDelts" || slot === "Shoulders" || slot === "Biceps" || slot === "Triceps" || slot === "Calves") && freshness >= 0.65) {
    score += 0.08
  }

  if (daysAgo <= 5) {
    score -= 0.06
  }

  return {
    key: candidateKey,
    score: Math.round(score * 1000) / 1000,
    tags
  }
}

export function pickBestCandidateForSlot(
  slot: Slot,
  histories: CandidateHistoryLite[],
  mode: CandidateSelectionMode
): CandidateScore[] {
  return candidatesForSlot(slot)
    .map((candidateKey) => scoreCandidateForSlot(slot, candidateKey, histories, mode))
    .sort((a, b) => b.score - a.score)
}


