import type { BehaviorFingerprint } from "./behaviorFingerprint";
import type { PredictionAccuracySummary, PredictionReviewEntry } from "./predictionReview";
import type { PreferenceHistoryEntry } from "./preferenceLearning";
import type { AdaptationWeights, MutationLedgerEntry, RecalibrationPhase, RecalibrationScope, RecalibrationState } from "./adaptationWeights";

export type RecalibrationPolicyInput = {
  behaviorFingerprint: BehaviorFingerprint | null;
  predictionAccuracySummary: PredictionAccuracySummary | null;
  predictionReviewHistory: PredictionReviewEntry[];
  preferenceHistory: PreferenceHistoryEntry[];
  adaptationWeights: AdaptationWeights | null;
  mutationLedger: MutationLedgerEntry[];
  previousState?: RecalibrationState | null;
};

type TriggerAssessment = { key: string; score: number; reason: string | null; scope: RecalibrationScope[] };

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function stateLabel(phase: RecalibrationPhase): RecalibrationState["state"] {
  switch (phase) {
    case "stable": return "Not needed";
    case "watch": return "Watch closely";
    case "suggested": return "Suggested";
    case "recalibrating": return "Recalibrating";
    case "probation": return "Probation";
  }
}

function normalizePreviousState(input: RecalibrationState | null | undefined): RecalibrationState | null {
  if (!input || typeof input !== "object") return null;
  const score = typeof input.score === "number" ? input.score : 55;
  const confidence = typeof input.confidence === "number" ? input.confidence : 35;
  const evidenceWindow = typeof input.evidenceWindow === "number" ? input.evidenceWindow : 0;
  const phase = (input.phase ?? (input.state === "Probation" ? "probation" : input.state === "Suggested" ? "suggested" : input.state === "Watch closely" ? "watch" : input.state === "Recalibrating" ? "recalibrating" : "stable")) as RecalibrationPhase;
  return {
    phase,
    state: stateLabel(phase),
    score,
    confidence,
    evidenceWindow,
    note: input.note ?? "Recalibration state was recovered from persistence.",
    triggers: Array.isArray(input.triggers) ? input.triggers.filter((x): x is string => typeof x === "string") : [],
    triggerSummary: typeof input.triggerSummary === "string" ? input.triggerSummary : (input.note ?? "Recovered state"),
    recommendedScope: Array.isArray(input.recommendedScope) ? input.recommendedScope.filter((x): x is RecalibrationScope => typeof x === "string") : [],
    freezeRecommended: typeof input.freezeRecommended === "boolean" ? input.freezeRecommended : phase === "suggested",
    probationCyclesRemaining: typeof input.probationCyclesRemaining === "number" ? input.probationCyclesRemaining : (phase === "probation" ? 2 : 0),
    lastEvaluatedAt: typeof input.lastEvaluatedAt === "string" ? input.lastEvaluatedAt : new Date().toISOString(),
  };
}

function scorePredictionDrift(accuracy: PredictionAccuracySummary | null): TriggerAssessment {
  if (!accuracy) {
    return { key: "prediction", score: 8, reason: "Prediction history is still thin, so recalibration should stay conservative.", scope: ["prediction"] };
  }
  const weakMetrics = [
    accuracy.metrics.completionAccuracy < 70,
    accuracy.metrics.focusCalibration < 65,
    accuracy.metrics.delayAccuracy < 65,
  ].filter(Boolean).length;
  let score = 0;
  if (accuracy.score < 60) score += 26;
  else if (accuracy.score < 70) score += 18;
  else if (accuracy.score < 80) score += 8;
  score += weakMetrics * 5;
  const reason = score > 0
    ? `Prediction fit has softened${weakMetrics ? `, with ${weakMetrics} weak calibration lane${weakMetrics === 1 ? "" : "s"}` : ""}.`
    : null;
  const scope: RecalibrationScope[] = ["prediction"];
  if (accuracy.metrics.delayAccuracy < 65) scope.push("timing");
  return { key: "prediction", score, reason, scope };
}

function scoreStructuralDrift(history: PreferenceHistoryEntry[]): TriggerAssessment {
  const recent = history.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 6);
  if (!recent.length) return { key: "structure", score: 0, reason: null, scope: [] };
  const substitutionAvg = avg(recent.map((row) => row.substitutionKeys?.length ?? 0));
  const missedAvg = avg(recent.map((row) => row.missedKeys?.length ?? 0));
  const offScript = recent.filter((row) => row.sessionOutcome && row.sessionOutcome !== "as_prescribed").length;
  let score = 0;
  if (substitutionAvg >= 1.5) score += 12;
  if (missedAvg >= 1) score += 10;
  if (offScript >= 3) score += 8;
  const reason = score > 0
    ? "Recent session structure is drifting enough through substitutions or misses that exercise identity should be watched."
    : null;
  return { key: "structure", score, reason, scope: ["exercise_identity", "adaptation"] };
}

function scoreIdentityDrift(fingerprint: BehaviorFingerprint | null, history: PreferenceHistoryEntry[]): TriggerAssessment {
  if (!fingerprint || !history.length) return { key: "identity", score: 0, reason: null, scope: [] };
  const recent = history.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 4);
  const actualSplitMatch = recent.filter((row) => row.actualFocus === row.recommendedFocus).length / Math.max(1, recent.length) * 100;
  const substitutionAvg = avg(recent.map((row) => row.substitutionKeys?.length ?? 0)) * 30;
  let score = 0;
  if (fingerprint.traits.splitCompliance.score - actualSplitMatch >= 20) score += 10;
  if ((substitutionAvg - fingerprint.traits.substitutionTendency.score) >= 20) score += 10;
  const reason = score > 0
    ? "The current self-model is starting to disagree with recent behavior strongly enough to justify caution."
    : null;
  const scope: RecalibrationScope[] = [];
  if (fingerprint.traits.splitCompliance.score - actualSplitMatch >= 20) scope.push("split_confidence", "fingerprint");
  if ((substitutionAvg - fingerprint.traits.substitutionTendency.score) >= 20) scope.push("exercise_identity", "fingerprint");
  return { key: "identity", score, reason, scope };
}

function scoreAdaptationIneffectiveness(mutationLedger: MutationLedgerEntry[], accuracy: PredictionAccuracySummary | null): TriggerAssessment {
  const recent = mutationLedger.slice(0, 3);
  if (recent.length < 2) return { key: "adaptation", score: 0, reason: null, scope: [] };
  const score = accuracy && accuracy.score < 75 ? 12 : 0;
  const reason = score > 0
    ? "Bounded adaptation is active, but fit is not yet improving enough to trust more drift-sensitive changes."
    : null;
  return { key: "adaptation", score, reason, scope: ["adaptation"] };
}

function scoreThinEvidenceFragility(evidenceWindow: number, accuracy: PredictionAccuracySummary | null, fingerprint: BehaviorFingerprint | null): TriggerAssessment {
  let score = 0;
  if (evidenceWindow < 3) score += 12;
  const confidence = Math.max(accuracy?.confidence ?? 35, fingerprint?.confidence ?? 35);
  if (evidenceWindow < 3 && confidence >= 55) score += 6;
  const reason = score > 0
    ? "Evidence is still thin, so recalibration should stay conservative and avoid overreacting to noise."
    : null;
  return { key: "evidence", score, reason, scope: [] };
}

export function evaluateRecalibrationState(input: RecalibrationPolicyInput): RecalibrationState {
  const previous = normalizePreviousState(input.previousState);
  const history = Array.isArray(input.preferenceHistory) ? input.preferenceHistory : [];
  const reviews = Array.isArray(input.predictionReviewHistory) ? input.predictionReviewHistory : [];
  const evidenceWindow = Math.max(
    history.length ? Math.min(history.length, 12) : 0,
    reviews.length ? Math.min(reviews.length, 12) : 0,
    input.predictionAccuracySummary?.evidenceWindow ?? 0,
    input.behaviorFingerprint?.evidenceWindow ?? 0,
  );
  const assessments = [
    scorePredictionDrift(input.predictionAccuracySummary),
    scoreStructuralDrift(history),
    scoreIdentityDrift(input.behaviorFingerprint, history),
    scoreAdaptationIneffectiveness(input.mutationLedger, input.predictionAccuracySummary),
    scoreThinEvidenceFragility(evidenceWindow, input.predictionAccuracySummary, input.behaviorFingerprint),
  ];
  const score = clamp(assessments.reduce((sum, item) => sum + item.score, 0), 0, 100);
  const triggers = assessments.map((item) => item.reason).filter((item): item is string => !!item);
  const activeFamilies = assessments.filter((item) => item.score > 0).length;
  const scopes = [...new Set(assessments.flatMap((item) => item.scope))];
  const confidence = clamp(30 + evidenceWindow * 8 + activeFamilies * 6, 35, 88);

  let phase: RecalibrationPhase = "stable";
  if (evidenceWindow < 3) {
    phase = score >= 45 ? "watch" : "stable";
  } else if (score >= 72 && activeFamilies >= 2) {
    phase = "suggested";
  } else if (score >= 45 || activeFamilies >= 2) {
    phase = "watch";
  }

  if (previous?.phase === "probation" && previous.probationCyclesRemaining > 0) {
    phase = "probation";
  }
  if (previous?.phase === "recalibrating") {
    phase = "recalibrating";
  }

  const triggerSummary = triggers.length
    ? triggers[0]
    : phase === "stable"
      ? "No major recalibration triggers are flashing right now."
      : "The model is being cautious while evidence builds.";

  const note = phase === "stable"
    ? "The current self-model still fits recent behavior well enough that recalibration can stay holstered."
    : phase === "watch"
      ? "A few signals are wobbling, but this conservative policy wants more proof before it recommends intervention."
      : phase === "suggested"
        ? "Enough drift is showing across recent closed cycles that formal recalibration should be on the table."
        : phase === "probation"
          ? "The model is in probation after a prior recalibration and is deliberately rebuilding trust slowly."
          : "Recalibration is active and should stay scoped until the model fit settles down.";

  return {
    phase,
    state: stateLabel(phase),
    score,
    confidence,
    evidenceWindow,
    note,
    triggers,
    triggerSummary,
    recommendedScope: scopes,
    freezeRecommended: phase === "suggested" || (phase === "watch" && score >= 58),
    probationCyclesRemaining: phase === "probation" ? Math.max(previous?.probationCyclesRemaining ?? 2, 1) : 0,
    lastEvaluatedAt: new Date().toISOString(),
  };
}
