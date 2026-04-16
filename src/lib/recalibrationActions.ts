import type { PredictionScaffold } from "./behaviorFingerprint";
import type { RecalibrationState } from "./adaptationWeights";

export type RecalibrationActionScope = "prediction";
export type RecalibrationActionType = "prediction_confidence_damp" | "prediction_expectation_reset";
export type RecalibrationActionStatus = "active" | "completed" | "superseded";

export type RecalibrationAction = {
  id: string;
  scope: RecalibrationActionScope;
  type: RecalibrationActionType;
  phaseEnteredFrom: RecalibrationState["phase"];
  reason: string;
  triggerSummary: string;
  recommendedScope: string[];
  createdAt: string;
  probationCycles: number;
  probationCyclesRemaining: number;
  freezeAdaptation: boolean;
  lastProcessedReviewSessionId: string | null;
  before: {
    predictionConfidence: number | null;
    expectedCompletionLabel: string | null;
    expectedFocusProbability: number | null;
  };
  after: {
    predictionConfidence: number | null;
    expectedCompletionLabel: string | null;
    expectedFocusProbability: number | null;
  };
  status: RecalibrationActionStatus;
};

export type ExecutePredictionRecalibrationInput = {
  recalibrationState: RecalibrationState | null;
  predictionScaffold: PredictionScaffold | null;
  activeAction: RecalibrationAction | null;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function nowIso(): string {
  return new Date().toISOString();
}

export function shouldExecutePredictionRecalibration(input: ExecutePredictionRecalibrationInput): boolean {
  const { recalibrationState, predictionScaffold, activeAction } = input;
  if (!recalibrationState || !predictionScaffold) return false;
  if (activeAction && activeAction.status === "active") return false;
  if (recalibrationState.phase !== "suggested") return false;
  if (recalibrationState.evidenceWindow < 4) return false;
  if (!recalibrationState.recommendedScope.includes("prediction")) return false;
  return true;
}

export function executePredictionRecalibration(input: {
  recalibrationState: RecalibrationState;
  predictionScaffold: PredictionScaffold;
}): { action: RecalibrationAction; nextPredictionScaffold: PredictionScaffold } {
  const { recalibrationState, predictionScaffold } = input;
  const currentConfidence = predictionScaffold.confidence ?? 35;
  const currentFocus = predictionScaffold.predictedFocusMatchProbability ?? 60;
  const nextConfidence = clamp(currentConfidence - 12, 20, 85);
  const nextFocus = clamp(currentFocus - 12, 20, 90);
  const currentCompletion = predictionScaffold.predictedCompletion;
  const nextCompletion: PredictionScaffold["predictedCompletion"] =
    currentCompletion === "as_prescribed" ? "modified" : currentCompletion;

  const nextPredictionScaffold: PredictionScaffold = {
    ...predictionScaffold,
    generatedAt: nowIso(),
    confidence: nextConfidence,
    predictedCompletion: nextCompletion,
    predictedFocusMatchProbability: nextFocus,
    reasons: [
      `Prediction recalibration damped confidence from ${currentConfidence} to ${nextConfidence} after conservative drift triggers aligned.`,
      `Expected focus-match probability was trimmed from ${currentFocus}% to ${nextFocus}% so the app stops talking like everything is locked in.`,
      ...predictionScaffold.reasons,
    ].slice(0, 6),
  };

  const createdAt = nowIso();
  const action: RecalibrationAction = {
    id: `prediction-${createdAt}`,
    scope: "prediction",
    type: currentCompletion === nextCompletion ? "prediction_confidence_damp" : "prediction_expectation_reset",
    phaseEnteredFrom: recalibrationState.phase,
    reason: recalibrationState.note,
    triggerSummary: recalibrationState.triggerSummary,
    recommendedScope: [...recalibrationState.recommendedScope],
    createdAt,
    probationCycles: 2,
    probationCyclesRemaining: 2,
    freezeAdaptation: true,
    lastProcessedReviewSessionId: null,
    before: {
      predictionConfidence: currentConfidence,
      expectedCompletionLabel: currentCompletion,
      expectedFocusProbability: currentFocus,
    },
    after: {
      predictionConfidence: nextConfidence,
      expectedCompletionLabel: nextCompletion,
      expectedFocusProbability: nextFocus,
    },
    status: "active",
  };

  return { action, nextPredictionScaffold };
}

export function applyProbationToRecalibrationState(params: {
  state: RecalibrationState;
  action: RecalibrationAction;
}): RecalibrationState {
  return {
    ...params.state,
    phase: "probation",
    state: "Probation",
    freezeRecommended: true,
    probationCyclesRemaining: params.action.probationCyclesRemaining,
    note: `Prediction recalibration executed. Adaptation is frozen for ${params.action.probationCyclesRemaining} closed cycle${params.action.probationCyclesRemaining === 1 ? "" : "s"} while the model rebuilds trust conservatively.`,
    triggerSummary: params.action.triggerSummary,
    lastEvaluatedAt: nowIso(),
  };
}

export function stepProbationState(params: {
  action: RecalibrationAction | null;
  recalibrationState: RecalibrationState | null;
  latestReviewSessionId: string | null;
}): { action: RecalibrationAction | null; recalibrationState: RecalibrationState | null; changed: boolean } {
  const { action, recalibrationState, latestReviewSessionId } = params;
  if (!action || action.status !== "active" || !action.freezeAdaptation) {
    return { action, recalibrationState, changed: false };
  }
  if (!latestReviewSessionId) {
    return { action, recalibrationState, changed: false };
  }
  if (action.lastProcessedReviewSessionId === latestReviewSessionId) {
    return { action, recalibrationState, changed: false };
  }
  const nextRemaining = Math.max(0, action.probationCyclesRemaining - 1);
  const nextAction: RecalibrationAction = {
    ...action,
    probationCyclesRemaining: nextRemaining,
    lastProcessedReviewSessionId: latestReviewSessionId,
    status: nextRemaining === 0 ? "completed" : action.status,
  };
  if (!recalibrationState) {
    return { action: nextAction, recalibrationState, changed: true };
  }
  if (nextRemaining > 0) {
    return {
      action: nextAction,
      recalibrationState: {
        ...recalibrationState,
        phase: "probation",
        state: "Probation",
        freezeRecommended: true,
        probationCyclesRemaining: nextRemaining,
        note: `Prediction recalibration is still in probation. Adaptation remains frozen for ${nextRemaining} more closed cycle${nextRemaining === 1 ? "" : "s"}.`,
        lastEvaluatedAt: nowIso(),
      },
      changed: true,
    };
  }
  return {
    action: nextAction,
    recalibrationState: {
      ...recalibrationState,
      probationCyclesRemaining: 0,
      freezeRecommended: false,
      lastEvaluatedAt: nowIso(),
    },
    changed: true,
  };
}
