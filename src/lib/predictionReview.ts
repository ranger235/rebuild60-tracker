import type { PredictionScaffold } from "./behaviorFingerprint";
import type { PrimaryOutcome, SessionOutcome } from "./recommendationFeedback";

export type PredictionReviewEntry = {
  sessionId: string;
  timestamp: number;
  predictedGeneratedAt: string | null;
  recommendationGeneratedAt: string | null;
  recommendedFocus: string;
  actualFocus: string;
  predictedCompletion: PredictionScaffold["predictedCompletion"];
  actualCompletion: SessionOutcome;
  predictedDelayBucket: PredictionScaffold["predictedDelayBucket"];
  actualDelayBucket: PredictionScaffold["predictedDelayBucket"];
  predictedFocusMatchProbability: number;
  actualFocusMatch: boolean;
  predictedSubstitutionRisk: number;
  actualSubstitutionRate: number;
  predictedAnchorReliability: number;
  actualAnchorQuality: number;
  predictionConfidence: number;
  score: number;
  label: "Strong" | "Usable" | "Shaky";
  summary: string;
  reasons: string[];
};

export type PredictionAccuracySummary = {
  generatedAt: string;
  evidenceWindow: number;
  confidence: number;
  score: number;
  label: "Strong" | "Usable" | "Shaky" | "Calibrating";
  headline: string;
  notes: string[];
  metrics: {
    completionAccuracy: number;
    delayAccuracy: number;
    focusCalibration: number;
    substitutionCalibration: number;
    anchorCalibration: number;
  };
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function actualDelayBucket(daysSinceRecommendation: number | null | undefined): PredictionScaffold["predictedDelayBucket"] {
  if (typeof daysSinceRecommendation !== "number" || !Number.isFinite(daysSinceRecommendation) || daysSinceRecommendation <= 0) return "same_day";
  if (daysSinceRecommendation === 1) return "1_day";
  return "2_plus_days";
}

function actualAnchorQuality(primaryOutcome: PrimaryOutcome): number {
  if (primaryOutcome === "progressed") return 90;
  if (primaryOutcome === "matched") return 75;
  if (primaryOutcome === "regressed") return 45;
  return 60;
}

function completionAccuracy(predicted: PredictionScaffold["predictedCompletion"], actual: SessionOutcome): number {
  const rank = {
    as_prescribed: 0,
    modified: 1,
    partial: 2,
    abandoned: 3,
  } as const;
  const diff = Math.abs(rank[predicted] - rank[actual]);
  if (diff === 0) return 100;
  if (diff === 1) return 65;
  if (diff === 2) return 25;
  return 0;
}

function delayAccuracy(predicted: PredictionScaffold["predictedDelayBucket"], actual: PredictionScaffold["predictedDelayBucket"]): number {
  const rank = { same_day: 0, "1_day": 1, "2_plus_days": 2 } as const;
  const diff = Math.abs(rank[predicted] - rank[actual]);
  if (diff === 0) return 100;
  if (diff === 1) return 60;
  return 15;
}

function probabilityCalibration(predictedPercent: number, actualPercent: number): number {
  const predicted = Math.max(0, Math.min(100, predictedPercent));
  const actual = Math.max(0, Math.min(100, actualPercent));
  return clamp(100 - Math.abs(predicted - actual), 0, 100);
}

export function buildPredictionReview(params: {
  sessionId: string;
  prediction: PredictionScaffold | null;
  recommendationGeneratedAt?: string | null;
  recommendedFocus: string;
  actualFocus: string;
  actualCompletion: SessionOutcome;
  daysSinceRecommendation: number | null;
  substitutionCount: number;
  totalRecommended: number;
  primaryOutcome: PrimaryOutcome;
}): PredictionReviewEntry | null {
  const { prediction } = params;
  if (!prediction) return null;

  const actualDelay = actualDelayBucket(params.daysSinceRecommendation);
  const focusMatched = !!params.recommendedFocus && !!params.actualFocus && params.recommendedFocus === params.actualFocus;
  const substitutionRate = params.totalRecommended > 0
    ? (params.substitutionCount / params.totalRecommended) * 100
    : 0;
  const anchorQuality = actualAnchorQuality(params.primaryOutcome);

  const metrics = {
    completionAccuracy: completionAccuracy(prediction.predictedCompletion, params.actualCompletion),
    delayAccuracy: delayAccuracy(prediction.predictedDelayBucket, actualDelay),
    focusCalibration: probabilityCalibration(prediction.predictedFocusMatchProbability, focusMatched ? 100 : 0),
    substitutionCalibration: probabilityCalibration(prediction.predictedSubstitutionRisk, substitutionRate),
    anchorCalibration: probabilityCalibration(prediction.predictedAnchorReliability, anchorQuality),
  };

  const score = clamp(
    metrics.completionAccuracy * 0.30 +
    metrics.delayAccuracy * 0.15 +
    metrics.focusCalibration * 0.25 +
    metrics.substitutionCalibration * 0.15 +
    metrics.anchorCalibration * 0.15,
    0,
    100,
  );

  const label = score >= 80 ? "Strong" : score >= 60 ? "Usable" : "Shaky";
  const reasons = [
    metrics.completionAccuracy >= 80
      ? "Completion prediction landed close to reality."
      : "Completion prediction missed enough that the model should keep its chest hair tucked in.",
    metrics.focusCalibration >= 80
      ? "Focus expectation matched reality cleanly enough to trust the lane call."
      : "Focus expectation drifted from reality, so the lane model still needs humbling.",
    metrics.delayAccuracy >= 80
      ? "Timing prediction was on the money."
      : "Timing prediction missed the actual session delay bucket.",
  ];

  const summary = `${label} prediction review • completion ${metrics.completionAccuracy}/100 • focus ${metrics.focusCalibration}/100 • delay ${metrics.delayAccuracy}/100`;

  return {
    sessionId: params.sessionId,
    timestamp: Date.now(),
    predictedGeneratedAt: prediction.generatedAt ?? null,
    recommendationGeneratedAt: params.recommendationGeneratedAt ?? null,
    recommendedFocus: params.recommendedFocus,
    actualFocus: params.actualFocus,
    predictedCompletion: prediction.predictedCompletion,
    actualCompletion: params.actualCompletion,
    predictedDelayBucket: prediction.predictedDelayBucket,
    actualDelayBucket: actualDelay,
    predictedFocusMatchProbability: clamp(prediction.predictedFocusMatchProbability, 0, 100),
    actualFocusMatch: focusMatched,
    predictedSubstitutionRisk: clamp(prediction.predictedSubstitutionRisk, 0, 100),
    actualSubstitutionRate: clamp(substitutionRate, 0, 100),
    predictedAnchorReliability: clamp(prediction.predictedAnchorReliability, 0, 100),
    actualAnchorQuality: anchorQuality,
    predictionConfidence: clamp(prediction.confidence, 0, 100),
    score,
    label,
    summary,
    reasons,
  };
}

export function summarizePredictionReviews(history: PredictionReviewEntry[]): PredictionAccuracySummary {
  const recent = history.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 12);
  if (!recent.length) {
    return {
      generatedAt: new Date().toISOString(),
      evidenceWindow: 0,
      confidence: 35,
      score: 55,
      label: "Calibrating",
      headline: "Prediction accuracy is still calibrating from completed recommendation cycles.",
      notes: ["The app has not yet closed enough prediction loops to judge itself honestly."],
      metrics: {
        completionAccuracy: 55,
        delayAccuracy: 55,
        focusCalibration: 55,
        substitutionCalibration: 55,
        anchorCalibration: 55,
      },
    };
  }

  const metrics = {
    completionAccuracy: clamp(avg(recent.map((row) => completionAccuracy(row.predictedCompletion, row.actualCompletion))), 0, 100),
    delayAccuracy: clamp(avg(recent.map((row) => delayAccuracy(row.predictedDelayBucket, row.actualDelayBucket))), 0, 100),
    focusCalibration: clamp(avg(recent.map((row) => probabilityCalibration(row.predictedFocusMatchProbability, row.actualFocusMatch ? 100 : 0))), 0, 100),
    substitutionCalibration: clamp(avg(recent.map((row) => probabilityCalibration(row.predictedSubstitutionRisk, row.actualSubstitutionRate))), 0, 100),
    anchorCalibration: clamp(avg(recent.map((row) => probabilityCalibration(row.predictedAnchorReliability, row.actualAnchorQuality))), 0, 100),
  };

  const score = clamp(
    metrics.completionAccuracy * 0.30 +
    metrics.delayAccuracy * 0.15 +
    metrics.focusCalibration * 0.25 +
    metrics.substitutionCalibration * 0.15 +
    metrics.anchorCalibration * 0.15,
    0,
    100,
  );
  const confidence = clamp(35 + recent.length * 5, 35, 92);
  const label = score >= 80 ? "Strong" : score >= 60 ? "Usable" : "Shaky";
  const headline = score >= 80
    ? "The app's predictions are lining up with reality closely enough to start trusting its self-read."
    : score >= 60
      ? "The app is reading you decently, but it still misses often enough that adaptation should stay on a short leash."
      : "Prediction accuracy is still wobbly, so any future adaptation needs to wear a helmet and a leash.";

  const notes = [
    `Completion accuracy is averaging ${metrics.completionAccuracy}/100 across the last ${recent.length} closed loops.`,
    `Focus calibration is sitting at ${metrics.focusCalibration}/100, which tells us how often the app predicts the right lane before reality shows up.`,
    metrics.delayAccuracy < 65
      ? "Timing prediction is the weakest link right now and should not be trusted to act smug."
      : "Timing prediction is behaving well enough to use as signal, not gospel.",
  ];

  return {
    generatedAt: new Date().toISOString(),
    evidenceWindow: recent.length,
    confidence,
    score,
    label,
    headline,
    notes,
    metrics,
  };
}
