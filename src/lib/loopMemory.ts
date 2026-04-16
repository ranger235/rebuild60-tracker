import { localdb } from "../localdb";
import type { BehaviorFingerprint, PredictionScaffold } from "./behaviorFingerprint";
import { summarizePredictionReviews, type PredictionAccuracySummary, type PredictionReviewEntry } from "./predictionReview";
import type { PreferenceHistoryEntry } from "./preferenceLearning";

type MaybeRecord = Record<string, unknown>;

export type LoopMemoryArtifacts = {
  behaviorFingerprint: BehaviorFingerprint | null;
  predictionScaffold: PredictionScaffold | null;
  predictionReviewHistory: PredictionReviewEntry[];
  predictionAccuracySummary: PredictionAccuracySummary | null;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function mapDelayBucket(days: number | null | undefined): PredictionScaffold["predictedDelayBucket"] {
  if (typeof days !== "number" || !Number.isFinite(days) || days <= 0) return "same_day";
  if (days == 1) return "1_day";
  return "2_plus_days";
}

function mapAnchorQuality(outcome: PreferenceHistoryEntry["primaryOutcome"]): number {
  if (outcome === "progressed") return 90;
  if (outcome === "matched") return 75;
  if (outcome === "regressed") return 45;
  return 60;
}

function mapCompletion(entry: PreferenceHistoryEntry): PredictionReviewEntry["actualCompletion"] {
  if (entry.sessionOutcome) return entry.sessionOutcome;
  if (entry.adherenceScore >= 85) return "as_prescribed";
  if (entry.adherenceScore >= 60) return "modified";
  if (entry.adherenceScore > 0) return "partial";
  return "abandoned";
}

export function rebuildLoopMemoryFromPreferenceHistory(history: PreferenceHistoryEntry[]): Pick<LoopMemoryArtifacts, "predictionReviewHistory" | "predictionAccuracySummary"> {
  const ordered = history
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 30);

  const predictionReviewHistory: PredictionReviewEntry[] = ordered.map((entry) => {
    const focusMatched = !!entry.recommendedFocus && entry.recommendedFocus === entry.actualFocus;
    const totalActions = Math.max(1, entry.exerciseFidelity?.length ?? 1);
    const substitutionRate = clamp((((entry.substitutionKeys?.length ?? 0) + (entry.missedKeys?.length ?? 0) + (entry.extrasKeys?.length ?? 0)) / totalActions) * 100, 0, 100);
    const anchorQuality = mapAnchorQuality(entry.primaryOutcome);
    const completion = mapCompletion(entry);
    const score = focusMatched ? 90 : 72;
    const label = score >= 80 ? "Strong" : score >= 60 ? "Usable" : "Shaky";
    return {
      sessionId: entry.sessionId,
      timestamp: entry.timestamp,
      predictedGeneratedAt: null,
      recommendationGeneratedAt: null,
      recommendedFocus: entry.recommendedFocus,
      actualFocus: entry.actualFocus,
      predictedCompletion: completion,
      actualCompletion: completion,
      predictedDelayBucket: mapDelayBucket(entry.daysSinceRecommendation ?? 0),
      actualDelayBucket: mapDelayBucket(entry.daysSinceRecommendation ?? 0),
      predictedFocusMatchProbability: focusMatched ? 85 : 35,
      actualFocusMatch: focusMatched,
      predictedSubstitutionRisk: substitutionRate,
      actualSubstitutionRate: substitutionRate,
      predictedAnchorReliability: anchorQuality,
      actualAnchorQuality: anchorQuality,
      predictionConfidence: 55,
      score,
      label,
      summary: `${label} rebuilt review • completion ${score}/100 • focus ${focusMatched ? 100 : 35}/100 • delay 100/100`,
      reasons: [
        "Rebuilt from stored completed-session history after loop memory lost continuity.",
        focusMatched
          ? "Focus lane held steady in the rebuilt evidence."
          : "Focus lane drift is still visible in rebuilt evidence.",
      ],
    };
  });

  return {
    predictionReviewHistory,
    predictionAccuracySummary: summarizePredictionReviews(predictionReviewHistory),
  };
}

function isObject(value: unknown): value is MaybeRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeParse<T>(raw: string | undefined | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function getSettingValue(userId: string, key: string): Promise<string | null> {
  const row = await localdb.localSettings.get([userId, key]);
  return row?.value ?? null;
}

async function getFirstSettingValue(userId: string, keys: string[]): Promise<string | null> {
  for (const key of keys) {
    const value = await getSettingValue(userId, key);
    if (value) return value;
  }
  return null;
}

export async function loadLoopMemoryArtifacts(userId: string): Promise<LoopMemoryArtifacts> {
  const behaviorRaw = await getFirstSettingValue(userId, ["behavior_fingerprint_v1"]);
  const predictionRaw = await getFirstSettingValue(userId, ["prediction_scaffold_v1"]);
  const reviewHistoryRaw = await getFirstSettingValue(userId, ["prediction_cycle_reviews_v1", "prediction_reviews_v1", "prediction_review_history_v1"]);
  const reviewSummaryRaw = await getFirstSettingValue(userId, ["prediction_review_summary_v1", "prediction_accuracy_v1"]);

  const behaviorFingerprint = safeParse<BehaviorFingerprint>(behaviorRaw);
  const predictionScaffold = safeParse<PredictionScaffold>(predictionRaw);
  const parsedHistory = safeParse<unknown>(reviewHistoryRaw);
  const parsedSummary = safeParse<unknown>(reviewSummaryRaw);

  const predictionReviewHistory = Array.isArray(parsedHistory) ? parsedHistory as PredictionReviewEntry[] : [];
  const predictionAccuracySummary = isObject(parsedSummary) ? parsedSummary as PredictionAccuracySummary : null;

  const canonicalWrites: Array<{ key: string; value: string }> = [];
  if (behaviorFingerprint && behaviorRaw && !await getSettingValue(userId, "behavior_fingerprint_v1")) {
    canonicalWrites.push({ key: "behavior_fingerprint_v1", value: behaviorRaw });
  }
  if (predictionScaffold && predictionRaw && !await getSettingValue(userId, "prediction_scaffold_v1")) {
    canonicalWrites.push({ key: "prediction_scaffold_v1", value: predictionRaw });
  }
  if (predictionReviewHistory.length && reviewHistoryRaw && !await getSettingValue(userId, "prediction_cycle_reviews_v1")) {
    canonicalWrites.push({ key: "prediction_cycle_reviews_v1", value: reviewHistoryRaw });
  }
  if (predictionAccuracySummary && reviewSummaryRaw && !await getSettingValue(userId, "prediction_review_summary_v1")) {
    canonicalWrites.push({ key: "prediction_review_summary_v1", value: reviewSummaryRaw });
  }
  if (canonicalWrites.length) {
    const now = Date.now();
    await Promise.all(canonicalWrites.map((row) => localdb.localSettings.put({
      user_id: userId,
      key: row.key,
      value: row.value,
      updatedAt: now,
    })));
  }

  return {
    behaviorFingerprint,
    predictionScaffold,
    predictionReviewHistory,
    predictionAccuracySummary,
  };
}

export async function persistLoopMemoryArtifacts(
  userId: string,
  updates: Partial<LoopMemoryArtifacts>,
): Promise<void> {
  const rows: Array<{ key: string; value: string }> = [];
  if (updates.behaviorFingerprint) {
    rows.push({ key: "behavior_fingerprint_v1", value: JSON.stringify(updates.behaviorFingerprint) });
  }
  if (updates.predictionScaffold) {
    rows.push({ key: "prediction_scaffold_v1", value: JSON.stringify(updates.predictionScaffold) });
  }
  if (updates.predictionReviewHistory) {
    rows.push({ key: "prediction_cycle_reviews_v1", value: JSON.stringify(updates.predictionReviewHistory) });
  }
  if (updates.predictionAccuracySummary) {
    rows.push({ key: "prediction_review_summary_v1", value: JSON.stringify(updates.predictionAccuracySummary) });
  }
  if (!rows.length) return;
  const now = Date.now();
  await Promise.all(rows.map((row) => localdb.localSettings.put({
    user_id: userId,
    key: row.key,
    value: row.value,
    updatedAt: now,
  })));
}


