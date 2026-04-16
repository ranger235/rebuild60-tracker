import type { BehaviorFingerprint, BehaviorTrait, PredictionScaffold } from "./behaviorFingerprint";
import type { PredictionAccuracySummary, PredictionReviewEntry } from "./predictionReview";
import type { AdaptationWeights, MutationLedgerEntry, RecalibrationState } from "./adaptationWeights";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function normalizeTrait(value: unknown): BehaviorTrait | null {
  const trait = asRecord(value);
  const key = asString(trait.key);
  const label = asString(trait.label);
  const score = asNumber(trait.score);
  const confidence = asNumber(trait.confidence);
  const trend = asString(trait.trend);
  const evidence = asNumber(trait.evidence);
  const summary = asString(trait.summary);
  if (!key || !label || score == null || confidence == null || !trend || evidence == null || !summary) return null;
  if (trend !== "up" && trend !== "down" && trend !== "flat") return null;
  return {
    key: key as BehaviorTrait["key"],
    label,
    score,
    confidence,
    trend,
    evidence,
    summary,
  };
}

export function normalizeBehaviorFingerprint(input: unknown): {
  isAvailable: boolean;
  isPartial: boolean;
  confidence: number | null;
  evidenceWindow: number | null;
  headline: string | null;
  stableSignals: string[];
  watchouts: string[];
  traits: BehaviorTrait[];
} {
  const source = asRecord(input);
  const traitsRecord = asRecord(source.traits);
  const traits = Object.values(traitsRecord).map(normalizeTrait).filter((trait): trait is BehaviorTrait => !!trait);
  const confidence = asNumber(source.confidence);
  const evidenceWindow = asNumber(source.evidenceWindow);
  const headline = asString(source.headline);
  const stableSignals = asStringArray(source.stableSignals);
  const watchouts = asStringArray(source.watchouts);
  const isAvailable = !!source && (headline !== null || traits.length > 0 || confidence !== null);
  const isPartial = isAvailable && (traits.length === 0 || headline === null || confidence === null);
  return { isAvailable, isPartial, confidence, evidenceWindow, headline, stableSignals, watchouts, traits };
}

export function normalizePredictionScaffold(input: unknown): {
  isAvailable: boolean;
  isPartial: boolean;
  confidence: number | null;
  predictedCompletion: PredictionScaffold["predictedCompletion"] | null;
  predictedDelayBucket: PredictionScaffold["predictedDelayBucket"] | null;
  predictedFocusMatchProbability: number | null;
  predictedSubstitutionRisk: number | null;
  predictedAnchorReliability: number | null;
  reasons: string[];
} {
  const source = asRecord(input);
  const predictedCompletion = asString(source.predictedCompletion) as PredictionScaffold["predictedCompletion"] | null;
  const predictedDelayBucket = asString(source.predictedDelayBucket) as PredictionScaffold["predictedDelayBucket"] | null;
  const confidence = asNumber(source.confidence);
  const predictedFocusMatchProbability = asNumber(source.predictedFocusMatchProbability);
  const predictedSubstitutionRisk = asNumber(source.predictedSubstitutionRisk);
  const predictedAnchorReliability = asNumber(source.predictedAnchorReliability);
  const reasons = asStringArray(source.reasons);
  const isAvailable = !!source && (predictedCompletion !== null || confidence !== null || reasons.length > 0);
  const isPartial = isAvailable && (predictedCompletion === null || predictedDelayBucket === null || confidence === null);
  return {
    isAvailable,
    isPartial,
    confidence,
    predictedCompletion,
    predictedDelayBucket,
    predictedFocusMatchProbability,
    predictedSubstitutionRisk,
    predictedAnchorReliability,
    reasons,
  };
}

export function normalizePredictionAccuracy(input: unknown): {
  isAvailable: boolean;
  isPartial: boolean;
  generatedAt: string | null;
  evidenceWindow: number | null;
  confidence: number | null;
  score: number | null;
  label: PredictionAccuracySummary["label"] | null;
  headline: string | null;
  notes: string[];
  metrics: {
    completionAccuracy: number | null;
    delayAccuracy: number | null;
    focusCalibration: number | null;
    substitutionCalibration: number | null;
    anchorCalibration: number | null;
  };
} {
  const source = asRecord(input);
  const metrics = asRecord(source.metrics);
  const normalized = {
    generatedAt: asString(source.generatedAt),
    evidenceWindow: asNumber(source.evidenceWindow),
    confidence: asNumber(source.confidence),
    score: asNumber(source.score),
    label: asString(source.label) as PredictionAccuracySummary["label"] | null,
    headline: asString(source.headline),
    notes: asStringArray(source.notes),
    metrics: {
      completionAccuracy: asNumber(metrics.completionAccuracy),
      delayAccuracy: asNumber(metrics.delayAccuracy),
      focusCalibration: asNumber(metrics.focusCalibration),
      substitutionCalibration: asNumber(metrics.substitutionCalibration),
      anchorCalibration: asNumber(metrics.anchorCalibration),
    },
  };
  const isAvailable = !!source && (normalized.score !== null || normalized.label !== null || normalized.headline !== null);
  const isPartial = isAvailable && (normalized.score === null || normalized.confidence === null || normalized.evidenceWindow === null);
  return { isAvailable, isPartial, ...normalized };
}

function normalizePredictionReviewEntry(input: unknown): PredictionReviewEntry | null {
  const source = asRecord(input);
  const label = asString(source.label);
  const score = asNumber(source.score);
  const summary = asString(source.summary);
  if (!label || score == null || !summary) return null;
  return {
    sessionId: asString(source.sessionId) ?? "unknown",
    timestamp: asNumber(source.timestamp) ?? 0,
    predictedGeneratedAt: asString(source.predictedGeneratedAt),
    recommendationGeneratedAt: asString(source.recommendationGeneratedAt),
    recommendedFocus: asString(source.recommendedFocus) ?? "Unknown",
    actualFocus: asString(source.actualFocus) ?? "Unknown",
    predictedCompletion: (asString(source.predictedCompletion) as PredictionReviewEntry["predictedCompletion"]) ?? "partial",
    actualCompletion: (asString(source.actualCompletion) as PredictionReviewEntry["actualCompletion"]) ?? "partial",
    predictedDelayBucket: (asString(source.predictedDelayBucket) as PredictionReviewEntry["predictedDelayBucket"]) ?? "same_day",
    actualDelayBucket: (asString(source.actualDelayBucket) as PredictionReviewEntry["actualDelayBucket"]) ?? "same_day",
    predictedFocusMatchProbability: asNumber(source.predictedFocusMatchProbability) ?? 0,
    actualFocusMatch: !!asBoolean(source.actualFocusMatch),
    predictedSubstitutionRisk: asNumber(source.predictedSubstitutionRisk) ?? 0,
    actualSubstitutionRate: asNumber(source.actualSubstitutionRate) ?? 0,
    predictedAnchorReliability: asNumber(source.predictedAnchorReliability) ?? 0,
    actualAnchorQuality: asNumber(source.actualAnchorQuality) ?? 0,
    predictionConfidence: asNumber(source.predictionConfidence) ?? 0,
    score,
    label: label as PredictionReviewEntry["label"],
    summary,
    reasons: asStringArray(source.reasons),
  };
}

export function normalizePredictionReviewHistory(input: unknown): {
  isAvailable: boolean;
  isPartial: boolean;
  entries: PredictionReviewEntry[];
  latest: PredictionReviewEntry | null;
} {
  const rawEntries = Array.isArray(input) ? input : [];
  const entries = rawEntries.map(normalizePredictionReviewEntry).filter((entry): entry is PredictionReviewEntry => !!entry);
  const isAvailable = entries.length > 0;
  const isPartial = Array.isArray(input) && rawEntries.length !== entries.length && entries.length > 0;
  return { isAvailable, isPartial, entries, latest: entries.length ? entries[0] : null };
}

function normalizeMutationEntry(input: unknown): MutationLedgerEntry | null {
  const source = asRecord(input);
  const generatedAt = asString(source.generatedAt);
  const summary = asString(source.summary);
  const confidence = asNumber(source.confidence);
  const evidenceWindow = asNumber(source.evidenceWindow);
  if (!generatedAt || !summary || confidence == null || evidenceWindow == null) return null;
  return {
    generatedAt,
    summary,
    confidence,
    evidenceWindow,
    appliedChanges: asStringArray(source.appliedChanges),
    reasons: asStringArray(source.reasons),
  };
}

export function normalizeMutationLedger(input: unknown): {
  isAvailable: boolean;
  isPartial: boolean;
  entries: MutationLedgerEntry[];
  latest: MutationLedgerEntry | null;
} {
  const rawEntries = Array.isArray(input) ? input : [];
  const entries = rawEntries.map(normalizeMutationEntry).filter((entry): entry is MutationLedgerEntry => !!entry);
  const isAvailable = entries.length > 0;
  const isPartial = Array.isArray(input) && rawEntries.length !== entries.length && entries.length > 0;
  return { isAvailable, isPartial, entries, latest: entries.length ? entries[0] : null };
}

export function normalizeAdaptationState(input: unknown): {
  isAvailable: boolean;
  isPartial: boolean;
  active: boolean | null;
  confidence: number | null;
  evidenceWindow: number | null;
  noveltyBudget: AdaptationWeights["noveltyBudget"] | null;
  summary: string | null;
  notes: string[];
} {
  const source = asRecord(input);
  const active = asBoolean(source.active);
  const confidence = asNumber(source.confidence);
  const evidenceWindow = asNumber(source.evidenceWindow);
  const noveltyBudget = asString(source.noveltyBudget) as AdaptationWeights["noveltyBudget"] | null;
  const summary = asString(source.summary);
  const notes = asStringArray(source.notes);
  const isAvailable = !!source && (active !== null || confidence !== null || summary !== null);
  const isPartial = isAvailable && (confidence === null || evidenceWindow === null || summary === null);
  return { isAvailable, isPartial, active, confidence, evidenceWindow, noveltyBudget, summary, notes };
}

export function normalizeRecalibrationState(input: unknown): {
  isAvailable: boolean;
  isPartial: boolean;
  phase: RecalibrationState["phase"] | null;
  state: RecalibrationState["state"] | null;
  score: number | null;
  confidence: number | null;
  evidenceWindow: number | null;
  note: string | null;
  triggers: string[];
  triggerSummary: string | null;
  recommendedScope: RecalibrationState["recommendedScope"];
  freezeRecommended: boolean | null;
  probationCyclesRemaining: number | null;
  lastEvaluatedAt: string | null;
} {
  const source = asRecord(input);
  const phase = asString(source.phase) as RecalibrationState["phase"] | null;
  const state = asString(source.state) as RecalibrationState["state"] | null;
  const score = asNumber(source.score);
  const confidence = asNumber(source.confidence);
  const evidenceWindow = asNumber(source.evidenceWindow);
  const note = asString(source.note);
  const triggers = asStringArray(source.triggers);
  const triggerSummary = asString(source.triggerSummary);
  const recommendedScope = asStringArray(source.recommendedScope) as RecalibrationState["recommendedScope"];
  const freezeRecommended = asBoolean(source.freezeRecommended);
  const probationCyclesRemaining = asNumber(source.probationCyclesRemaining);
  const lastEvaluatedAt = asString(source.lastEvaluatedAt);
  const isAvailable = !!source && (phase !== null || state !== null || score !== null || note !== null || triggers.length > 0);
  const isPartial = isAvailable && (phase === null || state === null || score === null || note === null);
  return { isAvailable, isPartial, phase, state, score, confidence, evidenceWindow, note, triggers, triggerSummary, recommendedScope, freezeRecommended, probationCyclesRemaining, lastEvaluatedAt };
}

