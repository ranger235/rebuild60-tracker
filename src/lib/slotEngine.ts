import { getExerciseKeysForSlot } from "./exerciseRegistry";
import type { Slot } from "./slotTypes";
export type { Slot } from "./slotTypes";


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

export type BlockBiasLike = {
  progressionBonus?: number;
  anchorBonus?: number;
  noveltyPenalty?: number;
  balanceBonus?: number;
  fatiguePenalty?: number;
  noveltyBudgetPerWeek?: number;
  minAnchorExposure?: number;
  minPrimaryAccessoryExposure?: number;
  forcedCarryPatterns?: string[];
} | null | undefined;

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
  PrimaryPress: getExerciseKeysForSlot("PrimaryPress"),
  SecondaryPress: getExerciseKeysForSlot("SecondaryPress"),
  Shoulders: getExerciseKeysForSlot("Shoulders"),
  Triceps: getExerciseKeysForSlot("Triceps"),
  Pump: getExerciseKeysForSlot("Pump"),
  PrimaryRow: getExerciseKeysForSlot("PrimaryRow"),
  VerticalPull: getExerciseKeysForSlot("VerticalPull"),
  SecondaryRow: getExerciseKeysForSlot("SecondaryRow"),
  RearDelts: getExerciseKeysForSlot("RearDelts"),
  Biceps: getExerciseKeysForSlot("Biceps"),
  PrimarySquat: getExerciseKeysForSlot("PrimarySquat"),
  Hinge: getExerciseKeysForSlot("Hinge"),
  SecondaryQuad: getExerciseKeysForSlot("SecondaryQuad"),
  Hamstrings: getExerciseKeysForSlot("Hamstrings"),
  Calves: getExerciseKeysForSlot("Calves"),
};

export function blueprintForFocus(focus: string): SessionBlueprint {
  if (focus === "Push") return PUSH_BLUEPRINT;
  if (focus === "Pull") return PULL_BLUEPRINT;
  return LOWER_BLUEPRINT;
}

export type AllowedExerciseFilter = ReadonlySet<string> | readonly string[] | null | undefined;

function normalizeAllowedExerciseFilter(allowedExerciseKeys?: AllowedExerciseFilter): ReadonlySet<string> | null {
  if (!allowedExerciseKeys) return null;
  if (allowedExerciseKeys instanceof Set) return allowedExerciseKeys;
  const next = new Set((allowedExerciseKeys ?? []).map((key) => String(key || "").trim()).filter(Boolean));
  return next.size > 0 ? next : null;
}

export function candidatesForSlot(slot: Slot, allowedExerciseKeys?: AllowedExerciseFilter): string[] {
  const base = SLOT_CANDIDATES[slot] ?? [];
  const allowed = normalizeAllowedExerciseFilter(allowedExerciseKeys);
  if (!allowed) return base;
  return base.filter((key) => allowed.has(key));
}

export function slotHasCandidate(slot: Slot, exerciseKey: string, allowedExerciseKeys?: AllowedExerciseFilter): boolean {
  return candidatesForSlot(slot, allowedExerciseKeys).includes(exerciseKey);
}

export function allSlotsForFocus(focus: string, allowedExerciseKeys?: AllowedExerciseFilter): Array<{ slot: Slot; candidates: string[] }> {
  const blueprint = blueprintForFocus(focus);
  return blueprint.slots.map((slot) => ({
    slot,
    candidates: candidatesForSlot(slot, allowedExerciseKeys),
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


function candidateAddressesForcedPattern(candidateKey: string, forcedCarryPatterns: string[]): boolean {
  if (!Array.isArray(forcedCarryPatterns) || forcedCarryPatterns.length === 0) return false;
  const k = candidateKey.toLowerCase();
  return forcedCarryPatterns.some((pattern) => {
    const p = String(pattern || '').toLowerCase();
    if (!p) return false;
    if (p.includes('row') || p.includes('upper back')) return k.includes('row') || k.includes('face_pull') || k.includes('rear_delt') || k.includes('reverse_pec_deck');
    if (p.includes('vertical pull') || p.includes('lat')) return k.includes('pull') || k.includes('chin') || k.includes('pulldown');
    if (p.includes('press')) return k.includes('press') || k.includes('dip') || k.includes('push_up');
    if (p.includes('quad')) return k.includes('squat') || k.includes('leg_extension') || k.includes('split_squat');
    if (p.includes('hinge') || p.includes('ham')) return k.includes('deadlift') || k.includes('romanian') || k.includes('hamstring') || k.includes('good_morning') || k.includes('glute_ham');
    if (p.includes('calf')) return k.includes('calf');
    if (p.includes('rear delt')) return k.includes('rear_delt') || k.includes('face_pull') || k.includes('reverse_pec_deck') || k.includes('band_pull_apart');
    return k.includes(p.replace(/\s+/g, '_')) || k.includes(p.replace(/\s+/g, ''));
  });
}

function slotIsAnchor(slot: Slot): boolean {
  return slot === "PrimaryPress" || slot === "PrimaryRow" || slot === "PrimarySquat" || slot === "Hinge" || slot === "VerticalPull";
}

function lowerCostInReducedVolume(slot: Slot, key: string): boolean {
  if (slot === "Shoulders" || slot === "Biceps" || slot === "Triceps" || slot === "RearDelts" || slot === "Pump" || slot === "Calves") {
    return true;
  }
  return key === "chest_supported_row" || key === "seated_cable_row" || key === "lat_pulldown" || key === "hamstring_curl";
}

export function scoreCandidateForSlot(
  slot: Slot,
  candidateKey: string,
  history: CandidateHistory[],
  mode: "Progression" | "Base" | "Reduced volume",
  preferences?: PreferenceLike,
  blockBias?: BlockBiasLike
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

  if (blockBias) {
    const exposureFloor = slotIsAnchor(slot)
      ? blockBias.minAnchorExposure ?? 0
      : blockBias.minPrimaryAccessoryExposure ?? 0;

    if (hist && slotIsAnchor(slot)) {
      score += blockBias.anchorBonus ?? 0;
      tags.push("Block anchor carry");
    }

    if (memory.improving) {
      score += blockBias.progressionBonus ?? 0;
      tags.push("Block progression push");
    }

    if (!hist) {
      score -= blockBias.noveltyPenalty ?? 0;
      tags.push("Block novelty tax");
    } else if ((hist.recentSets ?? 0) < exposureFloor) {
      score += (blockBias.anchorBonus ?? 0) * 0.5;
      tags.push("Exposure protection");
    }

    if (mode === "Reduced volume" && lowerCostInReducedVolume(slot, candidateKey)) {
      score += (blockBias.fatiguePenalty ?? 0) * 0.4;
      tags.push("Block fatigue restraint");
    }

    if (candidateAddressesForcedPattern(candidateKey, blockBias.forcedCarryPatterns ?? [])) {
      score += blockBias.balanceBonus ?? 0;
      tags.push("Forced carry pattern");
    }
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
  preferences?: PreferenceLike,
  blockBias?: BlockBiasLike,
  allowedExerciseKeys?: AllowedExerciseFilter
): ScoredCandidate[] {
  return candidatesForSlot(slot, allowedExerciseKeys)
    .map((key) => scoreCandidateForSlot(slot, key, history, mode, preferences, blockBias))
    .sort((a, b) => b.score - a.score);
}







