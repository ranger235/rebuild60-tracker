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
  | "Calves";

export type SessionBlueprint = {
  focus: "Push" | "Pull" | "Lower";
  slots: Slot[];
};

export type CandidateHistory = {
  key: string;
  name: string;
  recentSets?: number;
  lastPerformedDaysAgo?: number | null;
  recentTopSetE1RMs?: number[];
  recentAvgSetReps?: number[];
};

export type PreferenceLike = {
  preferredExerciseBias?: Record<string, number>;
  preferredSubstitutions?: Record<string, string>;
  volumeTolerance?: "lower" | "normal" | "higher";
} | null | undefined;

export type ScoredCandidate = {
  key: string;
  score: number;
  tags: string[];
};

export const PUSH_BLUEPRINT: SessionBlueprint = {
  focus: "Push",
  slots: ["PrimaryPress", "SecondaryPress", "Shoulders", "Triceps", "Pump"],
};

export const PULL_BLUEPRINT: SessionBlueprint = {
  focus: "Pull",
  slots: ["PrimaryRow", "VerticalPull", "SecondaryRow", "RearDelts", "Biceps"],
};

export const LOWER_BLUEPRINT: SessionBlueprint = {
  focus: "Lower",
  slots: ["PrimarySquat", "Hinge", "SecondaryQuad", "Hamstrings", "Calves"],
};

export const SLOT_CANDIDATES: Record<Slot, string[]> = {
  PrimaryPress: ["bench_press", "incline_bench_press", "dumbbell_bench_press", "chest_press"],
  SecondaryPress: ["incline_bench_press", "overhead_press", "dumbbell_bench_press", "shoulder_press"],
  Shoulders: ["overhead_press", "shoulder_press", "lateral_raise", "rear_delt_fly"],
  Triceps: ["dip", "triceps_pressdown", "overhead_triceps_extension", "skullcrusher"],
  Pump: ["lateral_raise", "triceps_pressdown", "push_up", "pec_deck"],
  PrimaryRow: ["barbell_row", "chest_supported_row", "seated_cable_row", "t_bar_row"],
  VerticalPull: ["pull_up", "chin_up", "lat_pulldown", "assisted_pull_up"],
  SecondaryRow: ["chest_supported_row", "seated_cable_row", "barbell_row", "one_arm_dumbbell_row"],
  RearDelts: ["face_pull", "rear_delt_fly", "reverse_pec_deck", "band_pull_apart"],
  Biceps: ["hammer_curl", "curl", "incline_dumbbell_curl", "preacher_curl"],
  PrimarySquat: ["ssb_squat", "squat", "leg_press", "hack_squat"],
  Hinge: ["romanian_deadlift", "deadlift", "good_morning", "hamstring_curl"],
  SecondaryQuad: ["leg_press", "hack_squat", "leg_extension", "split_squat"],
  Hamstrings: ["hamstring_curl", "romanian_deadlift", "glute_ham_raise", "seated_leg_curl"],
  Calves: ["calf_raise", "seated_calf_raise", "leg_press_calf_raise"],
};

export function blueprintForFocus(focus: string): SessionBlueprint {
  if (focus === "Push") return PUSH_BLUEPRINT;
  if (focus === "Pull") return PULL_BLUEPRINT;
  return LOWER_BLUEPRINT;
}

export function candidatesForSlot(slot: Slot): string[] {
  return SLOT_CANDIDATES[slot] ?? [];
}

export function slotHasCandidate(slot: Slot, exerciseKey: string): boolean {
  return candidatesForSlot(slot).includes(exerciseKey);
}

export function allSlotsForFocus(focus: string): Array<{ slot: Slot; candidates: string[] }> {
  const blueprint = blueprintForFocus(focus);
  return blueprint.slots.map((slot) => ({
    slot,
    candidates: candidatesForSlot(slot),
  }));
}

function analyzeMemory(hist: CandidateHistory | null): { stalled: boolean; improving: boolean } {
  const top = hist?.recentTopSetE1RMs ?? [];
  const avg = hist?.recentAvgSetReps ?? [];
  if (top.length < 3 || avg.length < 3) return { stalled: false, improving: false };

  const [t1, t2, t3] = top.slice(-3);
  const [a1, a2, a3] = avg.slice(-3);
  const priorTop = Math.max(t1, t2);
  const topDelta = priorTop > 0 ? (t3 - priorTop) / priorTop : 0;
  const improving = topDelta > 0.015;
  const fatigueRising = a3 < a1 - 0.5 || a3 < a2 - 0.5;
  const stalled = !improving && fatigueRising;
  return { stalled, improving };
}

function lowerCostInReducedVolume(slot: Slot, key: string): boolean {
  if (slot === "Shoulders" || slot === "Biceps" || slot === "Triceps" || slot === "RearDelts" || slot === "Pump" || slot === "Calves") {
    return true;
  }
  return key === "chest_supported_row" || key === "seated_cable_row" || key === "lat_pulldown" || key === "leg_press" || key === "hack_squat" || key === "hamstring_curl";
}

export function scoreCandidateForSlot(
  slot: Slot,
  candidateKey: string,
  history: CandidateHistory[],
  mode: "Progression" | "Base" | "Reduced volume",
  preferences?: PreferenceLike
): ScoredCandidate {
  const hist = history.find((h) => h.key === candidateKey) ?? null;
  const tags: string[] = [];
  let score = 40;

  if (hist) {
    score += 18;
    tags.push("Familiar");
    score += Math.min(14, Math.max(0, Math.round((hist.recentSets ?? 0) / 2)));
  }

  const daysAgo = hist?.lastPerformedDaysAgo ?? null;
  if (typeof daysAgo === "number") {
    if (daysAgo >= 8) {
      score += 10;
      tags.push("Fresh");
    } else if (daysAgo <= 3) {
      score -= 6;
    }
  }

  const memory = analyzeMemory(hist);
  if (memory.improving) {
    score += 8;
    tags.push("Progression path");
  }
  if (memory.stalled) {
    score -= 18;
    tags.push("Stall penalty");
  }

  if (mode === "Reduced volume" && lowerCostInReducedVolume(slot, candidateKey)) {
    score += 10;
    tags.push("Recovery-friendly");
  }

  const prefBias = preferences?.preferredExerciseBias?.[candidateKey] ?? 0;
  if (prefBias > 0) {
    score += prefBias;
    tags.push("Preference lean");
  }

  // 70/30 familiarity/freshness flavor, expressed as mild modifiers instead of hard math.
  if (tags.includes("Familiar") && !tags.includes("Fresh")) {
    score += 6;
  }
  if (tags.includes("Fresh")) {
    score += 4;
  }

  return {
    key: candidateKey,
    score,
    tags: [...new Set(tags)],
  };
}

export function pickBestCandidateForSlot(
  slot: Slot,
  history: CandidateHistory[],
  mode: "Progression" | "Base" | "Reduced volume",
  preferences?: PreferenceLike
): ScoredCandidate[] {
  return candidatesForSlot(slot)
    .map((key) => scoreCandidateForSlot(slot, key, history, mode, preferences))
    .sort((a, b) => b.score - a.score);
}



