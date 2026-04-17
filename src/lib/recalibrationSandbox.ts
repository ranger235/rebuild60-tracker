import { localdb } from "../localdb";
import type { LoopMemoryArtifacts } from "./loopMemory";
import type { AdaptationWeights, MutationLedgerEntry, RecalibrationState } from "./adaptationWeights";
import type { RecalibrationAction } from "./recalibrationActions";
import type { BehaviorFingerprint, PredictionScaffold } from "./behaviorFingerprint";
import type { PredictionAccuracySummary, PredictionReviewEntry } from "./predictionReview";

type MaybeRowValue = string | null;

type SandboxRecalibrationArtifacts = {
  adaptationWeights: AdaptationWeights | null;
  mutationLedger: MutationLedgerEntry[];
  recalibrationState: RecalibrationState | null;
  recalibrationAction: RecalibrationAction | null;
};

const SANDBOX_KEY_MAP: Record<string, string> = {
  behavior_fingerprint_v1: "behavior_fingerprint_test_v1",
  prediction_scaffold_v1: "prediction_scaffold_test_v1",
  prediction_cycle_reviews_v1: "prediction_cycle_reviews_test_v1",
  prediction_review_summary_v1: "prediction_review_summary_test_v1",
  adaptation_weights_v1: "adaptation_weights_test_v1",
  mutation_ledger_v1: "mutation_ledger_test_v1",
  recalibration_state_v1: "recalibration_state_test_v1",
  recalibration_action_v1: "recalibration_action_test_v1",
};

function nowTs(): number {
  return Date.now();
}

async function getSettingValue(userId: string, key: string): Promise<MaybeRowValue> {
  const row = await localdb.localSettings.get([userId, key]);
  return row?.value ?? null;
}

async function putSettingValue(userId: string, key: string, value: string | null): Promise<void> {
  await localdb.localSettings.put({
    user_id: userId,
    key,
    value: value ?? "null",
    updatedAt: nowTs(),
  });
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getSandboxKey(realKey: string): string {
  return SANDBOX_KEY_MAP[realKey] ?? `${realKey.replace(/_v1$/, "")}_test_v1`;
}

export async function seedRecalibrationSandbox(userId: string): Promise<void> {
  const keys = Object.keys(SANDBOX_KEY_MAP);
  const copies = await Promise.all(keys.map(async (realKey) => {
    const sandboxKey = getSandboxKey(realKey);
    const [realValue, sandboxValue] = await Promise.all([
      getSettingValue(userId, realKey),
      getSettingValue(userId, sandboxKey),
    ]);
    if (sandboxValue != null || realValue == null) return null;
    return { sandboxKey, realValue };
  }));

  const writes = copies.filter((row): row is { sandboxKey: string; realValue: string } => !!row);
  if (!writes.length) return;
  await Promise.all(writes.map((row) => putSettingValue(userId, row.sandboxKey, row.realValue)));
}

export async function loadSandboxLoopMemoryArtifacts(userId: string): Promise<LoopMemoryArtifacts> {
  const [behaviorRaw, predictionRaw, reviewHistoryRaw, reviewSummaryRaw] = await Promise.all([
    getSettingValue(userId, getSandboxKey("behavior_fingerprint_v1")),
    getSettingValue(userId, getSandboxKey("prediction_scaffold_v1")),
    getSettingValue(userId, getSandboxKey("prediction_cycle_reviews_v1")),
    getSettingValue(userId, getSandboxKey("prediction_review_summary_v1")),
  ]);

  return {
    behaviorFingerprint: safeParse<BehaviorFingerprint>(behaviorRaw),
    predictionScaffold: safeParse<PredictionScaffold>(predictionRaw),
    predictionReviewHistory: safeParse<PredictionReviewEntry[]>(reviewHistoryRaw) ?? [],
    predictionAccuracySummary: safeParse<PredictionAccuracySummary>(reviewSummaryRaw),
  };
}

export async function persistSandboxLoopMemoryArtifacts(userId: string, updates: Partial<LoopMemoryArtifacts>): Promise<void> {
  const writes: Array<{ key: string; value: string }> = [];
  if (updates.behaviorFingerprint) {
    writes.push({ key: getSandboxKey("behavior_fingerprint_v1"), value: JSON.stringify(updates.behaviorFingerprint) });
  }
  if (updates.predictionScaffold) {
    writes.push({ key: getSandboxKey("prediction_scaffold_v1"), value: JSON.stringify(updates.predictionScaffold) });
  }
  if (updates.predictionReviewHistory) {
    writes.push({ key: getSandboxKey("prediction_cycle_reviews_v1"), value: JSON.stringify(updates.predictionReviewHistory) });
  }
  if (updates.predictionAccuracySummary) {
    writes.push({ key: getSandboxKey("prediction_review_summary_v1"), value: JSON.stringify(updates.predictionAccuracySummary) });
  }
  if (!writes.length) return;
  await Promise.all(writes.map((row) => putSettingValue(userId, row.key, row.value)));
}

export async function loadSandboxRecalibrationArtifacts(userId: string): Promise<SandboxRecalibrationArtifacts> {
  const [adaptRaw, ledgerRaw, recalRaw, actionRaw] = await Promise.all([
    getSettingValue(userId, getSandboxKey("adaptation_weights_v1")),
    getSettingValue(userId, getSandboxKey("mutation_ledger_v1")),
    getSettingValue(userId, getSandboxKey("recalibration_state_v1")),
    getSettingValue(userId, getSandboxKey("recalibration_action_v1")),
  ]);

  return {
    adaptationWeights: safeParse<AdaptationWeights>(adaptRaw),
    mutationLedger: safeParse<MutationLedgerEntry[]>(ledgerRaw) ?? [],
    recalibrationState: safeParse<RecalibrationState>(recalRaw),
    recalibrationAction: safeParse<RecalibrationAction>(actionRaw),
  };
}

export async function persistSandboxRecalibrationArtifacts(userId: string, updates: SandboxRecalibrationArtifacts): Promise<void> {
  await Promise.all([
    putSettingValue(userId, getSandboxKey("adaptation_weights_v1"), JSON.stringify(updates.adaptationWeights)),
    putSettingValue(userId, getSandboxKey("mutation_ledger_v1"), JSON.stringify(updates.mutationLedger ?? [])),
    putSettingValue(userId, getSandboxKey("recalibration_state_v1"), JSON.stringify(updates.recalibrationState)),
    putSettingValue(userId, getSandboxKey("recalibration_action_v1"), JSON.stringify(updates.recalibrationAction)),
  ]);
}
