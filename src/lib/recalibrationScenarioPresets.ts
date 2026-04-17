import type { BehaviorFingerprint, PredictionScaffold } from "./behaviorFingerprint";
import { summarizePredictionReviews, type PredictionAccuracySummary, type PredictionReviewEntry } from "./predictionReview";
import type { PreferenceHistoryEntry } from "./preferenceLearning";
import type { AdaptationWeights, MutationLedgerEntry, RecalibrationState } from "./adaptationWeights";
import type { RecalibrationAction } from "./recalibrationActions";
import type { RecalibrationSandboxSnapshot } from "./recalibrationSandbox";

export type SandboxScenarioName = "baseline" | "prediction_drift" | "exercise_identity_drift" | "adaptation_failure" | "false_alarm";

function nowTs(offset = 0): number {
  return Date.now() - offset * 86_400_000;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeReview(base: Partial<PredictionReviewEntry>): PredictionReviewEntry {
  return {
    sessionId: base.sessionId ?? `scenario-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: base.timestamp ?? nowTs(),
    predictedGeneratedAt: base.predictedGeneratedAt ?? null,
    recommendationGeneratedAt: base.recommendationGeneratedAt ?? null,
    recommendedFocus: base.recommendedFocus ?? "Pull",
    actualFocus: base.actualFocus ?? "Pull",
    predictedCompletion: base.predictedCompletion ?? "as_prescribed",
    actualCompletion: base.actualCompletion ?? "as_prescribed",
    predictedDelayBucket: base.predictedDelayBucket ?? "same_day",
    actualDelayBucket: base.actualDelayBucket ?? "same_day",
    predictedFocusMatchProbability: base.predictedFocusMatchProbability ?? 80,
    actualFocusMatch: base.actualFocusMatch ?? true,
    predictedSubstitutionRisk: base.predictedSubstitutionRisk ?? 10,
    actualSubstitutionRate: base.actualSubstitutionRate ?? 10,
    predictedAnchorReliability: base.predictedAnchorReliability ?? 70,
    actualAnchorQuality: base.actualAnchorQuality ?? 70,
    predictionConfidence: base.predictionConfidence ?? 45,
    score: base.score ?? 80,
    label: base.label ?? "Usable",
    summary: base.summary ?? "Scenario review",
    reasons: base.reasons ?? ["Scenario injected for recalibration validation."],
  };
}

function makeHistory(base: Partial<PreferenceHistoryEntry>): PreferenceHistoryEntry {
  return {
    sessionId: base.sessionId ?? `scenario-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: base.timestamp ?? nowTs(),
    recommendedFocus: base.recommendedFocus ?? "Pull",
    actualFocus: base.actualFocus ?? "Pull",
    adherenceScore: base.adherenceScore ?? 85,
    substitutionKeys: base.substitutionKeys ?? [],
    extrasKeys: base.extrasKeys ?? [],
    missedKeys: base.missedKeys ?? [],
    volumeDelta: base.volumeDelta ?? 0,
    loadDeltaAvg: base.loadDeltaAvg ?? 0,
    sessionOutcome: base.sessionOutcome ?? "as_prescribed",
    daysSinceRecommendation: base.daysSinceRecommendation ?? 0,
    daysSinceLastTrainingSession: base.daysSinceLastTrainingSession ?? 1,
    exerciseFidelity: base.exerciseFidelity ?? [],
    primaryOutcome: base.primaryOutcome ?? "matched",
    fidelityScore: base.fidelityScore ?? 88,
  };
}

function modestPrediction(base: PredictionScaffold | null): PredictionScaffold | null {
  if (!base) return base;
  return { ...clone(base), confidence: 44, predictedCompletion: "as_prescribed", predictedFocusMatchProbability: 86 };
}

function buildPredictionDrift(base: RecalibrationSandboxSnapshot): RecalibrationSandboxSnapshot {
  const reviews = [
    makeReview({ timestamp: nowTs(0), predictedCompletion: "as_prescribed", actualCompletion: "modified", recommendedFocus: "Pull", actualFocus: "Push", predictedFocusMatchProbability: 88, actualFocusMatch: false, score: 42, label: "Shaky", summary: "Prediction drift scenario • completion 65/100 • focus 12/100 • delay 60/100" }),
    makeReview({ timestamp: nowTs(1), predictedCompletion: "as_prescribed", actualCompletion: "partial", recommendedFocus: "Pull", actualFocus: "Push", predictedFocusMatchProbability: 84, actualFocusMatch: false, score: 35, label: "Shaky", summary: "Prediction drift scenario • completion 25/100 • focus 16/100 • delay 60/100" }),
    makeReview({ timestamp: nowTs(2), predictedCompletion: "modified", actualCompletion: "partial", recommendedFocus: "Push", actualFocus: "Pull", predictedFocusMatchProbability: 72, actualFocusMatch: false, score: 48, label: "Shaky", summary: "Prediction drift scenario • completion 65/100 • focus 28/100 • delay 60/100" }),
    makeReview({ timestamp: nowTs(3), predictedCompletion: "as_prescribed", actualCompletion: "modified", recommendedFocus: "Lower", actualFocus: "Lower", predictedFocusMatchProbability: 80, actualFocusMatch: true, score: 58, label: "Shaky", summary: "Prediction drift scenario • completion 65/100 • focus 80/100 • delay 60/100" }),
  ].sort((a,b)=>b.timestamp-a.timestamp);
  const accuracy = summarizePredictionReviews(reviews);
  const history = [
    makeHistory({ timestamp: nowTs(0), recommendedFocus: "Pull", actualFocus: "Push", adherenceScore: 58, substitutionKeys: [{recommendedKey:"barbell_row",actualKey:"bench_press"}], missedKeys:["pull_up"], sessionOutcome: "modified", fidelityScore: 55, primaryOutcome: "regressed" }),
    makeHistory({ timestamp: nowTs(1), recommendedFocus: "Pull", actualFocus: "Push", adherenceScore: 42, substitutionKeys: [{recommendedKey:"barbell_row",actualKey:"bench_press"}], missedKeys:["face_pull"], sessionOutcome: "partial", fidelityScore: 42, primaryOutcome: "regressed" }),
    makeHistory({ timestamp: nowTs(2), recommendedFocus: "Push", actualFocus: "Pull", adherenceScore: 61, substitutionKeys: [{recommendedKey:"bench_press",actualKey:"barbell_row"}], sessionOutcome: "modified", fidelityScore: 60, primaryOutcome: "regressed" }),
    makeHistory({ timestamp: nowTs(3), recommendedFocus: "Lower", actualFocus: "Lower", adherenceScore: 72, substitutionKeys: [], sessionOutcome: "modified", fidelityScore: 70, primaryOutcome: "matched" }),
  ].sort((a,b)=>b.timestamp-a.timestamp);
  return {
    ...base,
    predictionScaffold: base.predictionScaffold ? { ...clone(base.predictionScaffold), confidence: 48, predictedCompletion: "as_prescribed", predictedFocusMatchProbability: 82 } : base.predictionScaffold,
    predictionReviewHistory: reviews,
    predictionAccuracySummary: accuracy,
    preferenceHistory: history,
    recalibrationState: null,
    recalibrationAction: null,
    scenarioName: "prediction_drift",
  };
}

function buildExerciseIdentityDrift(base: RecalibrationSandboxSnapshot): RecalibrationSandboxSnapshot {
  const reviews = [
    makeReview({ timestamp: nowTs(0), recommendedFocus: "Pull", actualFocus: "Pull", predictedCompletion: "as_prescribed", actualCompletion: "modified", predictedFocusMatchProbability: 85, actualFocusMatch: true, predictedSubstitutionRisk: 12, actualSubstitutionRate: 65, score: 63, label: "Usable", summary: "Exercise identity drift • completion 65/100 • focus 100/100 • substitutions off the page" }),
    makeReview({ timestamp: nowTs(1), recommendedFocus: "Push", actualFocus: "Push", predictedCompletion: "as_prescribed", actualCompletion: "modified", predictedFocusMatchProbability: 82, actualFocusMatch: true, predictedSubstitutionRisk: 10, actualSubstitutionRate: 72, score: 61, label: "Usable", summary: "Exercise identity drift • substitutions rising" }),
    makeReview({ timestamp: nowTs(2), recommendedFocus: "Lower", actualFocus: "Lower", predictedCompletion: "as_prescribed", actualCompletion: "modified", predictedFocusMatchProbability: 78, actualFocusMatch: true, predictedSubstitutionRisk: 8, actualSubstitutionRate: 68, score: 60, label: "Usable", summary: "Exercise identity drift • movement swaps everywhere" }),
    makeReview({ timestamp: nowTs(3), recommendedFocus: "Pull", actualFocus: "Pull", predictedCompletion: "modified", actualCompletion: "modified", predictedFocusMatchProbability: 76, actualFocusMatch: true, predictedSubstitutionRisk: 18, actualSubstitutionRate: 58, score: 66, label: "Usable", summary: "Exercise identity drift • partial cleanup but still drift" }),
  ].sort((a,b)=>b.timestamp-a.timestamp);
  const accuracy = summarizePredictionReviews(reviews);
  const history = [
    makeHistory({ timestamp: nowTs(0), recommendedFocus:"Pull", actualFocus:"Pull", adherenceScore:68, substitutionKeys:[{recommendedKey:"barbell_row",actualKey:"chest_supported_row"},{recommendedKey:"pull_up",actualKey:"lat_pulldown"}], extrasKeys:["seated_cable_row"], sessionOutcome:"modified", fidelityScore:62, primaryOutcome:"matched" }),
    makeHistory({ timestamp: nowTs(1), recommendedFocus:"Push", actualFocus:"Push", adherenceScore:66, substitutionKeys:[{recommendedKey:"bench_press",actualKey:"dumbbell_bench_press"},{recommendedKey:"overhead_press",actualKey:"shoulder_press"}], extrasKeys:["pec_deck"], sessionOutcome:"modified", fidelityScore:60, primaryOutcome:"matched" }),
    makeHistory({ timestamp: nowTs(2), recommendedFocus:"Lower", actualFocus:"Lower", adherenceScore:64, substitutionKeys:[{recommendedKey:"squat",actualKey:"leg_press"}], extrasKeys:["leg_extension"], sessionOutcome:"modified", fidelityScore:58, primaryOutcome:"matched" }),
    makeHistory({ timestamp: nowTs(3), recommendedFocus:"Pull", actualFocus:"Pull", adherenceScore:70, substitutionKeys:[{recommendedKey:"barbell_row",actualKey:"t_bar_row"}], sessionOutcome:"modified", fidelityScore:65, primaryOutcome:"matched" }),
  ].sort((a,b)=>b.timestamp-a.timestamp);
  const fingerprint = base.behaviorFingerprint ? clone(base.behaviorFingerprint) : null;
  if (fingerprint) {
    fingerprint.traits.substitutionTendency.score = 8;
    fingerprint.confidence = 52;
  }
  return {
    ...base,
    behaviorFingerprint: fingerprint,
    predictionReviewHistory: reviews,
    predictionAccuracySummary: accuracy,
    preferenceHistory: history,
    recalibrationState: null,
    recalibrationAction: null,
    scenarioName: "exercise_identity_drift",
  };
}

function buildAdaptationFailure(base: RecalibrationSandboxSnapshot): RecalibrationSandboxSnapshot {
  const reviews = [
    makeReview({ timestamp: nowTs(0), score: 58, label: "Shaky", summary: "Adaptation failure scenario • fit not improving" }),
    makeReview({ timestamp: nowTs(1), score: 55, label: "Shaky", summary: "Adaptation failure scenario • another weak cycle" }),
    makeReview({ timestamp: nowTs(2), score: 57, label: "Shaky", summary: "Adaptation failure scenario • still weak" }),
    makeReview({ timestamp: nowTs(3), score: 59, label: "Shaky", summary: "Adaptation failure scenario • bounded changes not helping" }),
  ].sort((a,b)=>b.timestamp-a.timestamp);
  const accuracy = summarizePredictionReviews(reviews);
  const ledger: MutationLedgerEntry[] = [
    { generatedAt: new Date(nowTs(3)).toISOString(), summary: "Anchor lane got a small +4% carry bias", confidence: 46, evidenceWindow: 4, appliedChanges: ["row +4%"], reasons: ["good fit expected"] },
    { generatedAt: new Date(nowTs(2)).toISOString(), summary: "Prediction confidence trimmed slightly", confidence: 44, evidenceWindow: 4, appliedChanges: ["confidence -4"], reasons: ["fit wobble"] },
    { generatedAt: new Date(nowTs(1)).toISOString(), summary: "Novelty budget reduced", confidence: 43, evidenceWindow: 4, appliedChanges: ["novelty reduced"], reasons: ["continuity pressure"] },
  ];
  const adaptation = base.adaptationWeights ? clone(base.adaptationWeights) : null;
  if (adaptation) {
    adaptation.active = true;
    adaptation.confidence = 48;
    adaptation.summary = "Bounded changes are active, but fit is not improving enough yet.";
  }
  return {
    ...base,
    predictionReviewHistory: reviews,
    predictionAccuracySummary: accuracy,
    mutationLedger: ledger,
    adaptationWeights: adaptation,
    recalibrationState: null,
    recalibrationAction: null,
    scenarioName: "adaptation_failure",
  };
}

function buildFalseAlarm(base: RecalibrationSandboxSnapshot): RecalibrationSandboxSnapshot {
  const reviews = [
    makeReview({ timestamp: nowTs(0), score: 42, label: "Shaky", summary: "False alarm scenario • one ugly cycle", predictedCompletion: "as_prescribed", actualCompletion: "partial", predictedFocusMatchProbability: 82, actualFocusMatch: false }),
  ];
  const accuracy = summarizePredictionReviews(reviews);
  const history = [
    makeHistory({ timestamp: nowTs(0), adherenceScore: 44, substitutionKeys:[{recommendedKey:"bench_press",actualKey:"push_up"}], missedKeys:["overhead_press"], sessionOutcome:"partial", fidelityScore:45, primaryOutcome:"regressed" }),
  ];
  return {
    ...base,
    predictionReviewHistory: reviews,
    predictionAccuracySummary: accuracy,
    preferenceHistory: history,
    recalibrationState: null,
    recalibrationAction: null,
    scenarioName: "false_alarm",
  };
}

export function buildSandboxScenarioPreset(name: SandboxScenarioName, base: RecalibrationSandboxSnapshot): RecalibrationSandboxSnapshot {
  const baseline: RecalibrationSandboxSnapshot = {
    ...clone(base),
    predictionScaffold: modestPrediction(base.predictionScaffold),
    recalibrationState: null,
    recalibrationAction: null,
    scenarioName: name,
  };
  switch (name) {
    case "prediction_drift": return buildPredictionDrift(baseline);
    case "exercise_identity_drift": return buildExerciseIdentityDrift(baseline);
    case "adaptation_failure": return buildAdaptationFailure(baseline);
    case "false_alarm": return buildFalseAlarm(baseline);
    default: return { ...baseline, scenarioName: "baseline" };
  }
}
