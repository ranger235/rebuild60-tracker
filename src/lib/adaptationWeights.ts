import type { NeedKey } from "./sessionNeedsEngine";
import type { BehaviorFingerprint } from "./behaviorFingerprint";
import type { PredictionAccuracySummary, PredictionReviewEntry } from "./predictionReview";
import type { PreferenceHistoryEntry, PreferenceSignals } from "./preferenceLearning";

export type AdaptationWeights = {
  generatedAt: string;
  policy: "bounded_v1";
  active: boolean;
  confidence: number;
  evidenceWindow: number;
  needBiasMultipliers: Partial<Record<NeedKey, number>>;
  exerciseBiasAdjustments: Record<string, number>;
  preferredSubstitutions: Record<string, string>;
  volumeTolerance: "lower" | "normal" | "higher";
  anchorCompliance: "weak" | "normal" | "strong";
  delaySensitivity: "normal" | "high";
  noveltyBudget: "normal" | "reduced" | "minimal";
  confidenceDamping: number;
  summary: string;
  notes: string[];
};

export type MutationLedgerEntry = {
  generatedAt: string;
  summary: string;
  confidence: number;
  evidenceWindow: number;
  appliedChanges: string[];
  reasons: string[];
};

export type RecalibrationState = {
  state: "Not needed" | "Watch closely" | "Suggested" | "Probation";
  score: number;
  note: string;
  triggers: string[];
};

const MAIN_NEEDS: NeedKey[] = ["horizontalPress", "verticalPress", "row", "verticalPull", "quadDominant", "hinge"];
const ACCESSORY_NEEDS: NeedKey[] = ["biceps", "triceps", "delts", "calves"];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function classifyNeed(key: string): NeedKey {
  if (["bench_press","incline_bench_press","dumbbell_bench_press","chest_press","dip","push_up","pec_deck"].includes(key)) return "horizontalPress";
  if (["overhead_press","shoulder_press"].includes(key)) return "verticalPress";
  if (["barbell_row","chest_supported_row","seated_cable_row","t_bar_row","one_arm_dumbbell_row"].includes(key)) return "row";
  if (["pull_up","chin_up","lat_pulldown","assisted_pull_up"].includes(key)) return "verticalPull";
  if (["ssb_squat","squat","leg_press","hack_squat","leg_extension","split_squat"].includes(key)) return "quadDominant";
  if (["romanian_deadlift","deadlift","good_morning","hamstring_curl","glute_ham_raise","seated_leg_curl"].includes(key)) return "hinge";
  if (["hammer_curl","curl","incline_dumbbell_curl","preacher_curl"].includes(key)) return "biceps";
  if (["triceps_pressdown","overhead_triceps_extension","skullcrusher"].includes(key)) return "triceps";
  if (["lateral_raise","rear_delt_fly","face_pull","reverse_pec_deck","band_pull_apart"].includes(key)) return "delts";
  return "calves";
}

function emptyWeights(): AdaptationWeights {
  return {
    generatedAt: new Date().toISOString(),
    policy: "bounded_v1",
    active: false,
    confidence: 35,
    evidenceWindow: 0,
    needBiasMultipliers: {},
    exerciseBiasAdjustments: {},
    preferredSubstitutions: {},
    volumeTolerance: "normal",
    anchorCompliance: "normal",
    delaySensitivity: "normal",
    noveltyBudget: "normal",
    confidenceDamping: 0,
    summary: "Adaptation is still calibrating from too little closed-loop evidence.",
    notes: ["No bounded mutation is active yet."],
  };
}

function conservativeVolume(current: PreferenceSignals["volumeTolerance"], next: AdaptationWeights["volumeTolerance"]): PreferenceSignals["volumeTolerance"] {
  if (current === "lower" || next === "lower") return "lower";
  if (current === "higher" || next === "higher") return "higher";
  return "normal";
}

function conservativeAnchor(current: PreferenceSignals["anchorCompliance"], next: AdaptationWeights["anchorCompliance"]): PreferenceSignals["anchorCompliance"] {
  if (current === "weak" || next === "weak") return "weak";
  if (current === "strong" || next === "strong") return "strong";
  return "normal";
}

function softMultiplier(existing: number | undefined, next: number): number {
  const base = typeof existing === "number" && Number.isFinite(existing) ? existing : 1;
  return Number(Math.max(0.85, Math.min(1.15, base * next)).toFixed(2));
}

function summarizeChanges(appliedChanges: string[]): string {
  if (!appliedChanges.length) return "No bounded mutation applied yet.";
  if (appliedChanges.length === 1) return appliedChanges[0];
  return `${appliedChanges[0]} + ${appliedChanges.length - 1} more bounded adjustment${appliedChanges.length - 1 === 1 ? "" : "s"}.`;
}

export function deriveAdaptationLayer(params: {
  history: PreferenceHistoryEntry[];
  fingerprint: BehaviorFingerprint | null;
  predictionAccuracySummary: PredictionAccuracySummary | null;
  predictionReviewHistory?: PredictionReviewEntry[];
}): {
  weights: AdaptationWeights;
  ledgerEntry: MutationLedgerEntry | null;
  recalibrationState: RecalibrationState;
} {
  const history = params.history.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 12);
  const fingerprint = params.fingerprint;
  const accuracy = params.predictionAccuracySummary;
  const reviews = (params.predictionReviewHistory ?? []).slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 12);

  if (!history.length || !fingerprint) {
    return {
      weights: emptyWeights(),
      ledgerEntry: null,
      recalibrationState: {
        state: "Not needed",
        score: 55,
        note: "The loop needs a little more completed-session evidence before bounded adaptation should mean anything.",
        triggers: ["Insufficient closed-loop evidence."],
      },
    };
  }

  const split = fingerprint.traits.splitCompliance?.score ?? 50;
  const lower = fingerprint.traits.lowerDayReliability?.score ?? 50;
  const anchor = fingerprint.traits.anchorLoyalty?.score ?? 50;
  const substitution = fingerprint.traits.substitutionTendency?.score ?? 50;
  const delay = fingerprint.traits.delayTendency?.score ?? 50;
  const completion = fingerprint.traits.completionReliability?.score ?? 50;
  const accuracyScore = accuracy?.score ?? 55;
  const accuracyConfidence = accuracy?.confidence ?? 35;
  const evidenceWindow = Math.max(history.length, accuracy?.evidenceWindow ?? 0, reviews.length);
  const confidence = clamp((fingerprint.confidence * 0.55) + (accuracyConfidence * 0.45), 35, 92);

  const needBiasMultipliers: Partial<Record<NeedKey, number>> = {};
  const exerciseBiasAdjustments: Record<string, number> = {};
  const preferredSubstitutions: Record<string, string> = {};
  const notes: string[] = [];
  const appliedChanges: string[] = [];
  let volumeTolerance: AdaptationWeights["volumeTolerance"] = "normal";
  let anchorCompliance: AdaptationWeights["anchorCompliance"] = "normal";
  let delaySensitivity: AdaptationWeights["delaySensitivity"] = "normal";
  let noveltyBudget: AdaptationWeights["noveltyBudget"] = "normal";
  let confidenceDamping = 0;

  if (completion >= 80 && accuracyScore >= 80) {
    for (const key of MAIN_NEEDS) needBiasMultipliers[key] = 1.04;
    appliedChanges.push("Anchor lane got a small +4% carry bias because completion and prediction accuracy are both behaving.");
    notes.push("Strong completion signal lets the engine lean a little harder on the main work without changing the split truth.");
  }

  if (completion <= 62) {
    for (const key of ACCESSORY_NEEDS) needBiasMultipliers[key] = Math.min(needBiasMultipliers[key] ?? 1, 0.92);
    volumeTolerance = "lower";
    noveltyBudget = "reduced";
    confidenceDamping = Math.max(confidenceDamping, 8);
    appliedChanges.push("Accessory lanes were softened because completion reliability is still rough.");
    notes.push("When completion gets sloppy, the app should trim fluff before it starts lecturing.");
  }

  if (substitution >= 60) {
    for (const key of ACCESSORY_NEEDS) needBiasMultipliers[key] = Math.min(needBiasMultipliers[key] ?? 1, 0.94);
    noveltyBudget = substitution >= 80 ? "minimal" : "reduced";
    appliedChanges.push("Novelty and accessory bias were trimmed because substitution drift is real, not theoretical.");
    notes.push("High substitution tendency means exact exercise identity should be treated with caution.");

    const subCounts = new Map<string, number>();
    for (const entry of history) {
      for (const sub of entry.substitutionKeys || []) {
        const token = `${sub.recommendedKey}->${sub.actualKey}`;
        subCounts.set(token, (subCounts.get(token) ?? 0) + 1);
      }
    }
    [...subCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .forEach(([token, count]) => {
        const [recommendedKey, actualKey] = token.split("->");
        preferredSubstitutions[recommendedKey] = actualKey;
        exerciseBiasAdjustments[actualKey] = clamp(3 + count, 0, 6);
      });
  } else if (substitution <= 20 && split >= 80) {
    const matchCounts = new Map<string, number>();
    for (const entry of history) {
      for (const fidelity of entry.exerciseFidelity || []) {
        if (fidelity.status === "matched" && fidelity.actualKey) {
          matchCounts.set(fidelity.actualKey, (matchCounts.get(fidelity.actualKey) ?? 0) + 1);
        }
      }
    }
    [...matchCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .forEach(([key, count]) => {
        exerciseBiasAdjustments[key] = clamp(2 + count, 0, 6);
      });
    if (Object.keys(exerciseBiasAdjustments).length) {
      appliedChanges.push("Frequently matched exercises got a small carry bias because reality is following the script cleanly.");
      notes.push("Low substitution drift means the engine can trust familiar exercise identity a little more.");
    }
  }

  if (delay >= 65) {
    delaySensitivity = "high";
    noveltyBudget = noveltyBudget === "normal" ? "reduced" : noveltyBudget;
    confidenceDamping = Math.max(confidenceDamping, 6);
    appliedChanges.push("Delay sensitivity was raised because timing drift is now part of the real operating context.");
  }

  if (anchor <= 58) {
    anchorCompliance = "weak";
    confidenceDamping = Math.max(confidenceDamping, 6);
    notes.push("Primary lift follow-through is still soft, so anchor aggression stays on a short leash.");
  } else if (anchor >= 78 && completion >= 75) {
    anchorCompliance = "strong";
    appliedChanges.push("Anchor compliance was upgraded because primary lift follow-through is holding together.");
  }

  const recalibrationScore = clamp(
    accuracyScore * 0.4 +
    split * 0.2 +
    completion * 0.15 +
    lower * 0.1 +
    (100 - substitution) * 0.075 +
    (100 - delay) * 0.075,
    0,
    100,
  );
  const triggers: string[] = [];
  if (accuracyScore < 75) triggers.push("Prediction accuracy is still below the comfort line.");
  if (split < 65) triggers.push("Split compliance is slipping enough to justify closer watching.");
  if (lower < 60) triggers.push("Lower-day reliability is still fragile.");
  if (delay >= 65) triggers.push("Session timing drift is high.");
  if (substitution >= 70) triggers.push("Substitution drift is high enough that novelty should stay on a leash.");

  let recalibrationState: RecalibrationState;
  if (evidenceWindow < 2) {
    recalibrationState = {
      state: "Not needed",
      score: recalibrationScore,
      note: "The loop has signal again, but it still needs more than one closed cycle before formal recalibration means much.",
      triggers: triggers.length ? triggers : ["Evidence is still thin."],
    };
  } else if (recalibrationScore < 60 || (accuracyScore < 65 && split < 60)) {
    recalibrationState = {
      state: "Suggested",
      score: recalibrationScore,
      note: "Recent closed-loop evidence is shaky enough that bounded recalibration should be on the table.",
      triggers: triggers,
    };
  } else if (recalibrationScore < 75 || triggers.length >= 2) {
    recalibrationState = {
      state: "Watch closely",
      score: recalibrationScore,
      note: "The loop still fits, but the model has enough friction showing that it should keep a weather eye on drift.",
      triggers: triggers,
    };
  } else {
    recalibrationState = {
      state: "Not needed",
      score: recalibrationScore,
      note: "The current self-model is fitting recent behavior well enough that recalibration can wait.",
      triggers: triggers.length ? triggers : ["No major bounded-mutation triggers are flashing right now."],
    };
  }

  const weights: AdaptationWeights = {
    generatedAt: new Date().toISOString(),
    policy: "bounded_v1",
    active: appliedChanges.length > 0,
    confidence,
    evidenceWindow,
    needBiasMultipliers,
    exerciseBiasAdjustments,
    preferredSubstitutions,
    volumeTolerance,
    anchorCompliance,
    delaySensitivity,
    noveltyBudget,
    confidenceDamping,
    summary: appliedChanges.length
      ? summarizeChanges(appliedChanges)
      : "No bounded mutation fired; the loop is mostly carrying forward the current read without touching the secondary weights.",
    notes: notes.slice(0, 5),
  };

  const ledgerEntry = appliedChanges.length
    ? {
        generatedAt: weights.generatedAt,
        summary: weights.summary,
        confidence,
        evidenceWindow,
        appliedChanges,
        reasons: [...notes, ...triggers].slice(0, 6),
      }
    : null;

  return {
    weights,
    ledgerEntry,
    recalibrationState,
  };
}

export function applyAdaptationToPreferenceSignals(
  signals: PreferenceSignals | null | undefined,
  weights: AdaptationWeights | null | undefined,
): PreferenceSignals | null {
  if (!signals) return null;
  if (!weights || !weights.active) {
    return {
      ...signals,
      reasons: [...new Set([...(signals.reasons ?? []), ...(weights?.notes ?? [])])].slice(0, 10),
    };
  }

  const nextNeedBiases: PreferenceSignals["needBiases"] = { ...(signals.needBiases ?? {}) };
  for (const [key, value] of Object.entries(weights.needBiasMultipliers)) {
    nextNeedBiases[key as NeedKey] = softMultiplier(nextNeedBiases[key as NeedKey], value as number);
  }

  const nextExerciseBias = { ...(signals.preferredExerciseBias ?? {}) };
  for (const [key, value] of Object.entries(weights.exerciseBiasAdjustments)) {
    nextExerciseBias[key] = clamp((nextExerciseBias[key] ?? 0) + value, 0, 18);
  }

  const nextSubs = { ...(signals.preferredSubstitutions ?? {}), ...(weights.preferredSubstitutions ?? {}) };
  const reasons = [...new Set([
    ...(signals.reasons ?? []),
    `Bounded adaptation active (${weights.policy}) with confidence ${weights.confidence}/100.`,
    ...weights.notes,
    weights.summary,
  ])].slice(0, 10);

  return {
    ...signals,
    preferredExerciseBias: nextExerciseBias,
    preferredSubstitutions: nextSubs,
    needBiases: nextNeedBiases,
    volumeTolerance: conservativeVolume(signals.volumeTolerance, weights.volumeTolerance),
    anchorCompliance: conservativeAnchor(signals.anchorCompliance, weights.anchorCompliance),
    delaySensitivity: signals.delaySensitivity === "high" || weights.delaySensitivity === "high" ? "high" : "normal",
    reasons,
  };
}
