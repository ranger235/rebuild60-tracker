import type { PredictionScaffold } from "./behaviorFingerprint";
import type { RecalibrationState } from "./adaptationWeights";

export type RecalibrationActionScope = "prediction";
export type RecalibrationActionType = "prediction_confidence_damp" | "prediction_expectation_reset";

export type RecalibrationAction = {
  id: string;
  scope: RecalibrationActionScope;
  type: RecalibrationActionType;
  status: "active" | "completed";
  createdAt: string;
  reason: string;
  probationCyclesRemaining: number;
  freezeAdaptation: boolean;
  lastObservedReviewSessionId: string | null;
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
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function makeId(): string {
  return `recal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function phaseLabel(phase: RecalibrationState["phase"]): RecalibrationState["state"] {
  switch (phase) {
    case "watch": return "Watch closely";
    case "suggested": return "Suggested";
    case "recalibrating": return "Recalibrating";
    case "probation": return "Probation";
    default: return "Not needed";
  }
}

export function shouldExecutePredictionRecalibration(params: {
  recalibrationState: RecalibrationState | null;
  predictionScaffold: PredictionScaffold | null;
}): boolean {
  const state = params.recalibrationState;
  if (!state || !params.predictionScaffold) return false;
  if (state.phase !== "suggested") return false;
  if (state.evidenceWindow < 4) return false;
  if (!state.recommendedScope.includes("prediction")) return false;
  return true;
}

export function applyPredictionRecalibrationToScaffold(
  predictionScaffold: PredictionScaffold,
  action: RecalibrationAction | null,
): PredictionScaffold {
  if (!action || action.status !== "active") return predictionScaffold;
  if (action.scope !== "prediction") return predictionScaffold;
  return {
    ...predictionScaffold,
    confidence: action.after.predictionConfidence ?? predictionScaffold.confidence,
    predictedCompletion: (action.after.expectedCompletionLabel as PredictionScaffold["predictedCompletion"] | null) ?? predictionScaffold.predictedCompletion,
    predictedFocusMatchProbability: action.after.expectedFocusProbability ?? predictionScaffold.predictedFocusMatchProbability,
    reasons: [
      `Prediction recalibration is active while the model rebuilds trust during probation.`,
      ...predictionScaffold.reasons.filter((reason) => !/Prediction recalibration is active/i.test(reason)),
    ].slice(0, 4),
  };
}

export function executePredictionRecalibration(params: {
  recalibrationState: RecalibrationState;
  predictionScaffold: PredictionScaffold;
  latestClosedReviewSessionId: string | null;
}): { action: RecalibrationAction; predictionScaffold: PredictionScaffold; recalibrationState: RecalibrationState } | null {
  if (!shouldExecutePredictionRecalibration(params)) return null;

  const before = {
    predictionConfidence: params.predictionScaffold.confidence,
    expectedCompletionLabel: params.predictionScaffold.predictedCompletion,
    expectedFocusProbability: params.predictionScaffold.predictedFocusMatchProbability,
  };

  const afterConfidence = clamp((params.predictionScaffold.confidence ?? 35) - 12, 20, 92);
  const afterFocus = clamp((params.predictionScaffold.predictedFocusMatchProbability ?? 65) - 12, 25, 95);
  const afterCompletion = params.predictionScaffold.predictedCompletion === "as_prescribed"
    ? "modified"
    : params.predictionScaffold.predictedCompletion;

  const action: RecalibrationAction = {
    id: makeId(),
    scope: "prediction",
    type: params.predictionScaffold.predictedCompletion === afterCompletion
      ? "prediction_confidence_damp"
      : "prediction_expectation_reset",
    status: "active",
    createdAt: new Date().toISOString(),
    reason: params.recalibrationState.triggerSummary || params.recalibrationState.note,
    probationCyclesRemaining: 2,
    freezeAdaptation: true,
    lastObservedReviewSessionId: params.latestClosedReviewSessionId,
    before,
    after: {
      predictionConfidence: afterConfidence,
      expectedCompletionLabel: afterCompletion,
      expectedFocusProbability: afterFocus,
    },
  };

  const predictionScaffold = applyPredictionRecalibrationToScaffold(params.predictionScaffold, action);

  const recalibrationState: RecalibrationState = {
    ...params.recalibrationState,
    phase: "probation",
    state: phaseLabel("probation"),
    note: "Prediction recalibration executed conservatively; the loop is now in probation while it checks whether the calmer prediction stance fits reality better.",
    triggerSummary: `Prediction recalibration executed: confidence damped${before.expectedCompletionLabel !== afterCompletion ? " and expectation reset" : ""}.`,
    freezeRecommended: true,
    probationCyclesRemaining: action.probationCyclesRemaining,
    lastEvaluatedAt: new Date().toISOString(),
  };

  return { action, predictionScaffold, recalibrationState };
}

export function stepRecalibrationActionProbation(params: {
  action: RecalibrationAction | null;
  latestClosedReviewSessionId: string | null;
}): RecalibrationAction | null {
  const action = params.action;
  if (!action) return null;
  if (action.status !== "active") return action;
  if (action.probationCyclesRemaining <= 0) {
    return { ...action, status: "completed", freezeAdaptation: false, probationCyclesRemaining: 0 };
  }
  if (!params.latestClosedReviewSessionId) return action;
  if (params.latestClosedReviewSessionId === action.lastObservedReviewSessionId) return action;

  const remaining = Math.max(0, action.probationCyclesRemaining - 1);
  return {
    ...action,
    probationCyclesRemaining: remaining,
    lastObservedReviewSessionId: params.latestClosedReviewSessionId,
    status: remaining === 0 ? "completed" : "active",
    freezeAdaptation: remaining > 0,
  };
}

