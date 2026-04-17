import { localdb } from "../localdb";
import type { BehaviorFingerprint, PredictionScaffold } from "./behaviorFingerprint";
import type { PredictionAccuracySummary, PredictionReviewEntry } from "./predictionReview";
import type { PreferenceHistoryEntry } from "./preferenceLearning";
import type { AdaptationWeights, MutationLedgerEntry, RecalibrationState } from "./adaptationWeights";
import type { RecalibrationAction } from "./recalibrationActions";

export type RecalibrationSandboxSnapshot = {
  behaviorFingerprint: BehaviorFingerprint | null;
  predictionScaffold: PredictionScaffold | null;
  predictionReviewHistory: PredictionReviewEntry[];
  predictionAccuracySummary: PredictionAccuracySummary | null;
  preferenceHistory: PreferenceHistoryEntry[];
  adaptationWeights: AdaptationWeights | null;
  mutationLedger: MutationLedgerEntry[];
  recalibrationState: RecalibrationState | null;
  recalibrationAction: RecalibrationAction | null;
  scenarioName: string | null;
};

export const SANDBOX_KEYS = {
  behaviorFingerprint: "behavior_fingerprint_test_v1",
  predictionScaffold: "prediction_scaffold_test_v1",
  predictionReviewHistory: "prediction_cycle_reviews_test_v1",
  predictionAccuracySummary: "prediction_review_summary_test_v1",
  preferenceHistory: "recommendation_feedback_test_v1",
  adaptationWeights: "adaptation_weights_test_v1",
  mutationLedger: "mutation_ledger_test_v1",
  recalibrationState: "recalibration_state_test_v1",
  recalibrationAction: "recalibration_action_test_v1",
  meta: "recalibration_sandbox_meta_v1",
} as const;

type SandboxMeta = {
  seededAt: string;
  scenarioName: string | null;
};

function safeParse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function getValue(userId: string, key: string): Promise<string | null> {
  const row = await localdb.localSettings.get([userId, key]);
  return row?.value ?? null;
}

async function putValue(userId: string, key: string, value: unknown): Promise<void> {
  await localdb.localSettings.put({
    user_id: userId,
    key,
    value: JSON.stringify(value),
    updatedAt: Date.now(),
  });
}

export async function loadRecalibrationSandboxSnapshot(userId: string): Promise<RecalibrationSandboxSnapshot | null> {
  const [behaviorRaw, predictionRaw, reviewRaw, summaryRaw, prefRaw, adaptationRaw, ledgerRaw, recalRaw, actionRaw, metaRaw] = await Promise.all([
    getValue(userId, SANDBOX_KEYS.behaviorFingerprint),
    getValue(userId, SANDBOX_KEYS.predictionScaffold),
    getValue(userId, SANDBOX_KEYS.predictionReviewHistory),
    getValue(userId, SANDBOX_KEYS.predictionAccuracySummary),
    getValue(userId, SANDBOX_KEYS.preferenceHistory),
    getValue(userId, SANDBOX_KEYS.adaptationWeights),
    getValue(userId, SANDBOX_KEYS.mutationLedger),
    getValue(userId, SANDBOX_KEYS.recalibrationState),
    getValue(userId, SANDBOX_KEYS.recalibrationAction),
    getValue(userId, SANDBOX_KEYS.meta),
  ]);

  const hasAny = [behaviorRaw, predictionRaw, reviewRaw, summaryRaw, prefRaw, adaptationRaw, ledgerRaw, recalRaw, actionRaw, metaRaw].some(Boolean);
  if (!hasAny) return null;

  const meta = safeParse<SandboxMeta>(metaRaw);
  const reviewHistory = safeParse<unknown>(reviewRaw);
  const preferenceHistory = safeParse<unknown>(prefRaw);
  const mutationLedger = safeParse<unknown>(ledgerRaw);

  return {
    behaviorFingerprint: safeParse<BehaviorFingerprint>(behaviorRaw),
    predictionScaffold: safeParse<PredictionScaffold>(predictionRaw),
    predictionReviewHistory: Array.isArray(reviewHistory) ? (reviewHistory as PredictionReviewEntry[]) : [],
    predictionAccuracySummary: safeParse<PredictionAccuracySummary>(summaryRaw),
    preferenceHistory: Array.isArray(preferenceHistory) ? (preferenceHistory as PreferenceHistoryEntry[]) : [],
    adaptationWeights: safeParse<AdaptationWeights>(adaptationRaw),
    mutationLedger: Array.isArray(mutationLedger) ? (mutationLedger as MutationLedgerEntry[]) : [],
    recalibrationState: safeParse<RecalibrationState>(recalRaw),
    recalibrationAction: safeParse<RecalibrationAction>(actionRaw),
    scenarioName: meta?.scenarioName ?? null,
  };
}

export async function persistRecalibrationSandboxSnapshot(userId: string, updates: Partial<RecalibrationSandboxSnapshot>): Promise<void> {
  const tasks: Promise<void>[] = [];
  const mapping: Array<[keyof RecalibrationSandboxSnapshot, string]> = [
    ["behaviorFingerprint", SANDBOX_KEYS.behaviorFingerprint],
    ["predictionScaffold", SANDBOX_KEYS.predictionScaffold],
    ["predictionReviewHistory", SANDBOX_KEYS.predictionReviewHistory],
    ["predictionAccuracySummary", SANDBOX_KEYS.predictionAccuracySummary],
    ["preferenceHistory", SANDBOX_KEYS.preferenceHistory],
    ["adaptationWeights", SANDBOX_KEYS.adaptationWeights],
    ["mutationLedger", SANDBOX_KEYS.mutationLedger],
    ["recalibrationState", SANDBOX_KEYS.recalibrationState],
    ["recalibrationAction", SANDBOX_KEYS.recalibrationAction],
  ];
  for (const [field, key] of mapping) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      tasks.push(putValue(userId, key, updates[field]));
    }
  }
  if (Object.prototype.hasOwnProperty.call(updates, "scenarioName")) {
    const currentMeta = safeParse<SandboxMeta>(await getValue(userId, SANDBOX_KEYS.meta)) ?? { seededAt: new Date().toISOString(), scenarioName: null };
    tasks.push(putValue(userId, SANDBOX_KEYS.meta, { ...currentMeta, scenarioName: updates.scenarioName ?? null } satisfies SandboxMeta));
  }
  if (tasks.length) await Promise.all(tasks);
}

export async function seedRecalibrationSandboxSnapshot(userId: string, snapshot: RecalibrationSandboxSnapshot): Promise<void> {
  await Promise.all([
    putValue(userId, SANDBOX_KEYS.behaviorFingerprint, snapshot.behaviorFingerprint),
    putValue(userId, SANDBOX_KEYS.predictionScaffold, snapshot.predictionScaffold),
    putValue(userId, SANDBOX_KEYS.predictionReviewHistory, snapshot.predictionReviewHistory),
    putValue(userId, SANDBOX_KEYS.predictionAccuracySummary, snapshot.predictionAccuracySummary),
    putValue(userId, SANDBOX_KEYS.preferenceHistory, snapshot.preferenceHistory),
    putValue(userId, SANDBOX_KEYS.adaptationWeights, snapshot.adaptationWeights),
    putValue(userId, SANDBOX_KEYS.mutationLedger, snapshot.mutationLedger),
    putValue(userId, SANDBOX_KEYS.recalibrationState, snapshot.recalibrationState),
    putValue(userId, SANDBOX_KEYS.recalibrationAction, snapshot.recalibrationAction),
    putValue(userId, SANDBOX_KEYS.meta, { seededAt: new Date().toISOString(), scenarioName: snapshot.scenarioName ?? null } satisfies SandboxMeta),
  ]);
}
