import type { NeedKey, NeedSnapshot, NeedScore } from "./sessionNeedsEngine";

export type PreferenceHistoryEntry = {
  sessionId: string;
  timestamp: number;
  recommendedFocus: string;
  actualFocus: string;
  adherenceScore: number;
  substitutionKeys: Array<{ recommendedKey: string; actualKey: string }>;
  extrasKeys: string[];
  missedKeys: string[];
  volumeDelta: number | null;
  loadDeltaAvg: number | null;
  sessionOutcome?: "as_prescribed" | "modified" | "partial" | "abandoned";
  daysSinceRecommendation?: number | null;
  daysSinceLastTrainingSession?: number | null;
  exerciseFidelity?: Array<{
    recommendedKey: string;
    actualKey: string | null;
    status: "matched" | "substituted" | "partial" | "missed";
    recommendedSets: number | null;
    actualSets: number;
    recommendedLoadLbs: number | null;
    actualTopLoadLbs: number | null;
    recommendedReps: string | null;
    actualTopReps: number | null;
  }>;
  primaryOutcome?: "progressed" | "matched" | "regressed" | "unknown";
  fidelityScore?: number;
};

export type PreferenceSignals = {
  preferredExerciseBias: Record<string, number>;
  preferredSubstitutions: Record<string, string>;
  preferredPairings: Partial<Record<NeedKey, NeedKey[]>>;
  needBiases: Partial<Record<NeedKey, number>>;
  volumeTolerance: "lower" | "normal" | "higher";
  anchorCompliance: "weak" | "normal" | "strong";
  delaySensitivity: "normal" | "high";
  reasons: string[];
};

const NEED_KEYS: NeedKey[] = [
  "horizontalPress",
  "verticalPress",
  "row",
  "verticalPull",
  "quadDominant",
  "hinge",
  "biceps",
  "triceps",
  "delts",
  "calves",
];

function classifyNeed(key: string): NeedKey {
  if (
    key === "bench_press" ||
    key === "incline_bench_press" ||
    key === "dumbbell_bench_press" ||
    key === "chest_press" ||
    key === "dip" ||
    key === "push_up" ||
    key === "pec_deck"
  ) return "horizontalPress";

  if (key === "overhead_press" || key === "shoulder_press") return "verticalPress";

  if (
    key === "barbell_row" ||
    key === "chest_supported_row" ||
    key === "seated_cable_row" ||
    key === "t_bar_row" ||
    key === "one_arm_dumbbell_row"
  ) return "row";

  if (
    key === "pull_up" ||
    key === "chin_up" ||
    key === "lat_pulldown" ||
    key === "assisted_pull_up"
  ) return "verticalPull";

  if (
    key === "ssb_squat" ||
    key === "squat" ||
    key === "leg_press" ||
    key === "hack_squat" ||
    key === "leg_extension" ||
    key === "split_squat"
  ) return "quadDominant";

  if (
    key === "romanian_deadlift" ||
    key === "deadlift" ||
    key === "good_morning" ||
    key === "hamstring_curl" ||
    key === "glute_ham_raise" ||
    key === "seated_leg_curl"
  ) return "hinge";

  if (
    key === "hammer_curl" ||
    key === "curl" ||
    key === "incline_dumbbell_curl" ||
    key === "preacher_curl"
  ) return "biceps";

  if (
    key === "triceps_pressdown" ||
    key === "overhead_triceps_extension" ||
    key === "skullcrusher"
  ) return "triceps";

  if (
    key === "lateral_raise" ||
    key === "rear_delt_fly" ||
    key === "face_pull" ||
    key === "reverse_pec_deck" ||
    key === "band_pull_apart"
  ) return "delts";

  if (
    key === "calf_raise" ||
    key === "seated_calf_raise" ||
    key === "leg_press_calf_raise"
  ) return "calves";

  return "horizontalPress";
}

function mapFocusToAnchorNeeds(focus: string): NeedKey[] {
  if (focus === "Push") return ["horizontalPress", "verticalPress"];
  if (focus === "Pull") return ["row", "verticalPull"];
  if (focus === "Lower") return ["quadDominant", "hinge"];
  return ["horizontalPress"];
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function derivePreferenceSignals(history: PreferenceHistoryEntry[]): PreferenceSignals {
  const preferredExerciseBias: Record<string, number> = {};
  const preferredSubstitutions: Record<string, string> = {};
  const preferredPairings: Partial<Record<NeedKey, NeedKey[]>> = {};
  const needBiases: Partial<Record<NeedKey, number>> = {};
  const reasons: string[] = [];

  if (!history || history.length === 0) {
    return {
      preferredExerciseBias,
      preferredSubstitutions,
      preferredPairings,
      needBiases,
      volumeTolerance: "normal",
      anchorCompliance: "normal",
      delaySensitivity: "normal",
      reasons,
    };
  }

  const recent = history
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 24);

  const swapCounts = new Map<string, number>();
  const extraNeedCounts = new Map<NeedKey, number>();
  const missedNeedCounts = new Map<NeedKey, number>();
  const pairingCounts = new Map<string, number>();
  const volumeDeltas: number[] = [];
  const fidelityScores: number[] = [];
  let partialCount = 0;
  let abandonedCount = 0;
  let modifiedCount = 0;
  let delayedCount = 0;
  let anchorProgressedCount = 0;
  let anchorRegressedCount = 0;
  let anchorUnknownCount = 0;

  for (const entry of recent) {
    if (typeof entry.volumeDelta === "number" && Number.isFinite(entry.volumeDelta)) {
      volumeDeltas.push(entry.volumeDelta);
    }
    if (typeof entry.fidelityScore === "number" && Number.isFinite(entry.fidelityScore)) {
      fidelityScores.push(entry.fidelityScore);
    }

    if (entry.sessionOutcome === "partial") partialCount += 1;
    if (entry.sessionOutcome === "abandoned") abandonedCount += 1;
    if (entry.sessionOutcome === "modified") modifiedCount += 1;
    if (typeof entry.daysSinceLastTrainingSession === "number" && entry.daysSinceLastTrainingSession >= 3) delayedCount += 1;
    if (entry.primaryOutcome === "progressed") anchorProgressedCount += 1;
    else if (entry.primaryOutcome === "regressed") anchorRegressedCount += 1;
    else if (entry.primaryOutcome === "unknown") anchorUnknownCount += 1;

    for (const fidelity of entry.exerciseFidelity || []) {
      const need = classifyNeed(fidelity.recommendedKey);
      if (fidelity.status === "missed" || fidelity.status === "partial") {
        missedNeedCounts.set(need, (missedNeedCounts.get(need) ?? 0) + 1);
      }
      if (fidelity.status === "substituted" && fidelity.actualKey) {
        const actualNeed = classifyNeed(fidelity.actualKey);
        extraNeedCounts.set(actualNeed, (extraNeedCounts.get(actualNeed) ?? 0) + 1);
      }
    }

    for (const sub of entry.substitutionKeys || []) {
      const token = `${sub.recommendedKey}->${sub.actualKey}`;
      swapCounts.set(token, (swapCounts.get(token) ?? 0) + 1);
    }

    for (const key of entry.extrasKeys || []) {
      const need = classifyNeed(key);
      extraNeedCounts.set(need, (extraNeedCounts.get(need) ?? 0) + 1);

      for (const anchor of mapFocusToAnchorNeeds(entry.actualFocus)) {
        const token = `${anchor}->${need}`;
        pairingCounts.set(token, (pairingCounts.get(token) ?? 0) + 1);
      }
    }

    for (const key of entry.missedKeys || []) {
      const need = classifyNeed(key);
      missedNeedCounts.set(need, (missedNeedCounts.get(need) ?? 0) + 1);
    }
  }

  for (const [token, count] of swapCounts.entries()) {
    if (count < 2) continue;
    const [recommendedKey, actualKey] = token.split("->");
    const existing = preferredSubstitutions[recommendedKey];
    const existingCount = existing ? swapCounts.get(`${recommendedKey}->${existing}`) ?? 0 : 0;
    if (!existing || count > existingCount) {
      preferredSubstitutions[recommendedKey] = actualKey;
    }
  }

  for (const [recommendedKey, actualKey] of Object.entries(preferredSubstitutions)) {
    preferredExerciseBias[actualKey] = Math.max(preferredExerciseBias[actualKey] ?? 0, 12);
    reasons.push(`Reality check: you often turn ${recommendedKey} into ${actualKey}, so the brain will lean that way when it fits.`);
  }

  for (const key of NEED_KEYS) {
    const extra = extraNeedCounts.get(key) ?? 0;
    const missed = missedNeedCounts.get(key) ?? 0;
    let bias = 1;

    if (extra >= 3) {
      bias += 0.08;
      reasons.push(`Preference learning: you keep adding or preserving ${key} work, so that lane gets a small positive bias.`);
    }
    if (missed >= 3) {
      bias -= 0.06;
      reasons.push(`Preference learning: ${key} work gets skipped often enough to soften that lane a touch.`);
    }

    if (bias !== 1) {
      needBiases[key] = Number(bias.toFixed(2));
    }
  }

  for (const [token, count] of pairingCounts.entries()) {
    if (count < 2) continue;
    const [anchor, paired] = token.split("->") as [NeedKey, NeedKey];
    preferredPairings[anchor] = unique([...(preferredPairings[anchor] ?? []), paired]);
  }

  const avgVolumeDelta =
    volumeDeltas.length > 0
      ? volumeDeltas.reduce((a, b) => a + b, 0) / volumeDeltas.length
      : 0;
  const avgFidelity =
    fidelityScores.length > 0
      ? fidelityScores.reduce((a, b) => a + b, 0) / fidelityScores.length
      : null;

  let volumeTolerance: "lower" | "normal" | "higher" =
    avgVolumeDelta >= 10 ? "higher" : avgVolumeDelta <= -10 ? "lower" : "normal";

  if (partialCount >= 3 || abandonedCount >= 2) volumeTolerance = "lower";
  if (avgFidelity != null && avgFidelity < 65) volumeTolerance = "lower";
  if (avgFidelity != null && avgFidelity >= 88 && avgVolumeDelta >= 5 && partialCount === 0 && abandonedCount === 0) volumeTolerance = "higher";

  if (volumeTolerance === "higher") {
    reasons.push("Recommendation history says you often do a bit more work than prescribed, so the brain can tolerate a slightly denser session.");
  } else if (volumeTolerance === "lower") {
    reasons.push("Recommendation history says you often trim volume, so the brain will keep one eye on session density.");
  }
  if (avgFidelity != null && avgFidelity < 65) {
    reasons.push("Recent session fidelity has been soft enough that the brain should respect reality before adding density.");
  } else if (avgFidelity != null && avgFidelity >= 85) {
    reasons.push("Recent session fidelity has been strong, which makes the prescription signal more trustworthy.");
  }

  const anchorCompliance: "weak" | "normal" | "strong" =
    anchorRegressedCount >= 3
      ? "weak"
      : anchorProgressedCount >= 3 && anchorUnknownCount <= Math.max(2, Math.floor(recent.length / 3))
        ? "strong"
        : "normal";

  if (anchorCompliance === "weak") {
    reasons.push("Primary lift reality has been inconsistent, so progression confidence should stay a touch conservative.");
  } else if (anchorCompliance === "strong") {
    reasons.push("Primary lift reality has been landing well, which supports steadier progression confidence.");
  }

  const delaySensitivity: "normal" | "high" = delayedCount >= 4 ? "high" : "normal";
  if (delaySensitivity === "high") {
    reasons.push("Recent sessions have been spreading out more than planned, so stale-session drift should be treated as real context.");
  }

  if (modifiedCount >= 4) {
    reasons.push("Reality checks show you regularly modify sessions, which is useful signal rather than noise for future recommendations.");
  }

  return {
    preferredExerciseBias,
    preferredSubstitutions,
    preferredPairings,
    needBiases,
    volumeTolerance,
    anchorCompliance,
    delaySensitivity,
    reasons: unique(reasons).slice(0, 8),
  };
}

export function applyPreferenceSignalsToNeeds(
  snapshot: NeedSnapshot,
  signals: PreferenceSignals | null | undefined
): NeedSnapshot {
  if (!signals) return snapshot;

  const scores = {} as Record<NeedKey, NeedScore>;

  for (const key of NEED_KEYS) {
    const base = snapshot.scores[key];
    const bias = signals.needBiases[key] ?? 1;
    const weighted = Math.max(0, Math.min(100, Math.round(base.score * bias)));
    const reasons = [...base.reasons];

    if (bias > 1) {
      reasons.push(`Preference learning boosted ${key} with a ${bias.toFixed(2)}x multiplier.`);
    } else if (bias < 1) {
      reasons.push(`Preference learning softened ${key} with a ${bias.toFixed(2)}x multiplier.`);
    }

    scores[key] = { key, score: weighted, reasons };
  }

  return {
    scores,
    ranked: Object.values(scores).sort((a, b) => b.score - a.score),
    recoveryBias: snapshot.recoveryBias,
  };
}




