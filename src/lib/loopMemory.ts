import { localdb } from "../localdb";
import type { BehaviorFingerprint, PredictionScaffold } from "./behaviorFingerprint";
import type { PredictionAccuracySummary, PredictionReviewEntry } from "./predictionReview";

type MaybeRecord = Record<string, unknown>;

export type LoopMemoryArtifacts = {
  behaviorFingerprint: BehaviorFingerprint | null;
  predictionScaffold: PredictionScaffold | null;
  predictionReviewHistory: PredictionReviewEntry[];
  predictionAccuracySummary: PredictionAccuracySummary | null;
};

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
