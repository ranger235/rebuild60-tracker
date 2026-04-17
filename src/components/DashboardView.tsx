import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from "react";
import LineChart from "./LineChart";
import type { BrainSnapshot, BrainFocus, TrainingSplitConfig, SplitDayDefinition } from "../lib/brainEngine";
import { buildReadinessContext } from "../lib/readiness";
import { formatPatternValue, formatPrescriptionTrust, formatReadinessLabel } from "../lib/readinessFormat";
import type { ReadinessInput } from "../lib/readinessTypes";
import type { PreferenceHistoryEntry } from "../lib/preferenceLearning";
import type { FrictionProfile } from "../lib/frictionEngine";
import type { BehaviorFingerprint, BehaviorTrait, PredictionScaffold } from "../lib/behaviorFingerprint";
import type { PredictionAccuracySummary, PredictionReviewEntry } from "../lib/predictionReview";
import type { AdaptationWeights, MutationLedgerEntry, RecalibrationState } from "../lib/adaptationWeights";
import type { RecalibrationAction } from "../lib/recalibrationActions";
import type { SandboxScenarioName } from "../lib/recalibrationScenarioPresets";
import {
  normalizeAdaptationState,
  normalizeBehaviorFingerprint,
  normalizeMutationLedger,
  normalizePredictionAccuracy,
  normalizePredictionReviewHistory,
  normalizePredictionScaffold,
  normalizeRecalibrationState,
} from "../lib/uiStateGuards";

export type Point = { xLabel: string; y: number };

export type WeeklyCoach = {
  thisWeekStart: string;
  thisWeekEnd: string;
  sessionsThis: number;
  sessionsPrev: number;
  tonnageThis: number;
  tonnagePrev: number;
  setsThis: number;
  setsPrev: number;
  benchBest?: number;
  squatBest?: number;
  dlBest?: number;
  coachLine: string;
};

export type AiCoachResult = {
  text: string;
  ts: number;
  model?: string;
};

export type TimelineWeek = {
  start: string;
  end: string;
  label: string;
  sessions: number;
  sets: number;
  tonnage: number;
  topLift: string;
  dominantFocus: BrainFocus;
};

type Props = {
  dashBusy: boolean;
  refreshDashboard: () => void;
  exportBackup: () => void;
  backupBusy: boolean;
  importFileRef: RefObject<HTMLInputElement | null>;

  loadBandEquiv: () => void;
  bandEquivMap: Record<string, number>;
  setBandEquivMap: (next: Record<string, number>) => void;
  bandComboFactor: number;
  setBandComboFactor: (next: number) => void;
  saveBandEquiv: (next: Record<string, number>, comboFactorOverride?: number) => void;

  weight: string;
  setWeight: (v: string) => void;
  waist: string;
  setWaist: (v: string) => void;
  sleepHours: string;
  setSleepHours: (v: string) => void;
  calories: string;
  setCalories: (v: string) => void;
  protein: string;
  setProtein: (v: string) => void;
  z2Minutes: string;
  setZ2Minutes: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  saveQuickLog: () => void;

  weeklyCoach: WeeklyCoach | null;
  tonnageSeries: Point[];
  setsSeries: Point[];
  benchSeries: Point[];
  squatSeries: Point[];
  dlSeries: Point[];

  weightSeries: Point[];
  waistSeries: Point[];
  sleepSeries: Point[];
  calSeries: Point[];
  proteinSeries: Point[];
  z2Series: Point[];

  refreshAiCoach: (force?: boolean) => void;
  aiCoachBusy: boolean;
  aiCoachErr: string | null;
  aiCoach: AiCoachResult | null;
  milestones: Array<{
    id: string;
    milestone_type: string;
    label: string;
    achieved_on: string;
  }>;
  timelineWeeks: TimelineWeek[];
  brainSnapshot: BrainSnapshot | null;
  frictionProfile: FrictionProfile | null;
  splitConfig: TrainingSplitConfig | null;
  userEmail: string;
  syncStatus: string;
  lastSyncedAt: string;
  splitPreset: TrainingSplitConfig["preset"] | null;
  splitDayNames: string[];
  lastCompletedSplitDayName: string | null;
  saveTrainingSplitConfig: (next: TrainingSplitConfig) => Promise<void> | void;
  startSessionFromRecommendation: () => void;
  preferenceHistory: PreferenceHistoryEntry[];
  behaviorFingerprint: BehaviorFingerprint | null;
  predictionScaffold: PredictionScaffold | null;
  predictionReviewHistory: PredictionReviewEntry[];
  predictionAccuracySummary: PredictionAccuracySummary | null;
  adaptationWeights: AdaptationWeights | null;
  mutationLedger: MutationLedgerEntry[];
  recalibrationState: RecalibrationState | null;
  recalibrationAction: RecalibrationAction | null;
  recalibrationSandboxEnabled: boolean;
  recalibrationSandboxScenario: string | null;
  onToggleRecalibrationSandbox: (next: boolean) => void | Promise<void>;
  onApplyRecalibrationSandboxScenario: (name: SandboxScenarioName) => void | Promise<void>;
  onResetRecalibrationSandbox: () => void | Promise<void>;

  timerOn: boolean;
  setTimerOn: (value: boolean | ((prev: boolean) => boolean)) => void;
  secs: number;
  setSecs: (v: number) => void;
};

const cardStyle: CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 12,
  background: "#fafafa"
};

function sumPoints(points: Point[]) {
  return points.reduce((acc, p) => acc + (Number(p.y) || 0), 0);
}

function activeDays(points: Point[]) {
  return points.filter((p) => Number(p.y) > 0).length;
}

function latestPoint(points: Point[]) {
  return points.length > 0 ? Number(points[points.length - 1].y) : null;
}

function bestPoint(points: Point[]) {
  if (points.length === 0) return null;
  return Math.max(...points.map((p) => Number(p.y) || 0));
}

function trendText(points: Point[]) {
  if (points.length < 2) return "Not enough data";
  const last = Number(points[points.length - 1]?.y ?? 0);
  const prev = Number(points[points.length - 2]?.y ?? 0);
  if (last > prev) return "Up";
  if (last < prev) return "Down";
  return "Flat";
}

function fmtClock(totalSecs: number) {
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function focusTone(focus: BrainFocus) {
  if (focus === "Push") return "#eef7ff";
  if (focus === "Pull") return "#f1faf1";
  if (focus === "Lower") return "#fff8ea";
  return "#f6f6f6";
}

function alertChipTone(text: string) {
  const t = text.toLowerCase();
  if (t.includes("override") || t.includes("recovery protection")) return { bg: "#fff3e8", border: "#efc9a8" };
  if (t.includes("variation swap")) return { bg: "#f3efff", border: "#cdbef5" };
  if (t.includes("progression")) return { bg: "#ebf8ee", border: "#b8dfc0" };
  return { bg: "#f4f4f4", border: "#d9d9d9" };
}

function eventTagTone(text?: string) {
  const t = (text || "").toLowerCase();
  if (t.includes("swap")) return { bg: "#f3efff", border: "#cdbef5" };
  if (t.includes("progress")) return { bg: "#ebf8ee", border: "#b8dfc0" };
  if (t.includes("hold")) return { bg: "#fff8ea", border: "#ebd39e" };
  if (t.includes("reduced")) return { bg: "#fff3e8", border: "#efc9a8" };
  return { bg: "#f4f4f4", border: "#d9d9d9" };
}


function recommendationTrustLabel(brainSnapshot: BrainSnapshot | null) {
  if (!brainSnapshot) return "Unavailable";
  const alerts = brainSnapshot.recommendedSession.alerts?.length ?? 0;
  const constraints = brainSnapshot.nextSessionPriority.constraintsApplied?.length ?? 0;
  if (alerts === 0 && constraints <= 1) return "High confidence";
  if (alerts <= 1 && constraints <= 3) return "Moderate confidence";
  return "Use judgment";
}


function preferenceConfidenceLabel(history: PreferenceHistoryEntry[]) {
  const recent = history.slice(0, 6);
  if (!recent.length) return "Calibrating";
  const scores = recent
    .map((entry) => (typeof entry.fidelityScore === "number" ? entry.fidelityScore : null))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!scores.length) return "Calibrating";
  const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  if (avg >= 80) return "High confidence";
  if (avg >= 60) return "Moderate confidence";
  return "Use judgment";
}

function preferenceConfidenceNote(history: PreferenceHistoryEntry[]) {
  const recent = history.slice(0, 6);
  if (!recent.length) return "Not enough completed recommendation history yet.";
  const scores = recent
    .map((entry) => (typeof entry.fidelityScore === "number" ? entry.fidelityScore : null))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!scores.length) return "The engine is still building evidence from completed sessions.";
  const avg = Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
  return `Based on the last ${scores.length} logged recommendation outcomes, average fidelity is ${avg}%.`;
}

function latestRecommendationOutcome(history: PreferenceHistoryEntry[]) {
  return history.length ? history[0] : null;
}

function buildOutcomeHeadline(entry: PreferenceHistoryEntry | null) {
  if (!entry) return "No completed recommendation review yet.";
  const recommended = entry.recommendedFocus || "Planned session";
  const actual = entry.actualFocus || "Unknown actual";
  return `${recommended} → ${actual}`;
}

function buildOutcomeDetail(entry: PreferenceHistoryEntry | null) {
  if (!entry) return "Once you complete a recommended session, this panel will show what the engine expected and what actually happened.";
  const subs = entry.substitutionKeys?.length ?? 0;
  const extras = entry.extrasKeys?.length ?? 0;
  const missed = entry.missedKeys?.length ?? 0;
  const days = typeof entry.daysSinceRecommendation === "number" ? `${entry.daysSinceRecommendation} day delay` : "Same-day or unknown delay";
  return `${entry.sessionOutcome || "Unknown outcome"} • ${subs} substitutions • ${extras} extras • ${missed} missed • ${days}`;
}

function buildLearningNote(entry: PreferenceHistoryEntry | null, brainSnapshot: BrainSnapshot | null) {
  if (!entry || !brainSnapshot) return "The model will start narrating its adjustments once enough completed outcomes exist.";
  const currentFocus = brainSnapshot.recommendedSession?.focus || "today's";
  if (entry.actualFocus && entry.actualFocus === currentFocus) {
    return `Last time, the actual work still supported a ${currentFocus} emphasis, so today stays in the same broad lane with updated constraints and priorities.`;
  }
  if ((entry.substitutionKeys?.length ?? 0) > 0) {
    return `Last time, the session drifted off the original script, so today leans on the configured split while tightening what matters most.`;
  }
  if (entry.sessionOutcome === "partial" || entry.sessionOutcome === "abandoned") {
    return "Last time did not fully land, so today should be read as a best-fit recommendation rather than a hard commandment.";
  }
  return "The engine is carrying forward the last completed outcome while keeping today's configured split day as the source of truth.";
}


function buildModelFit(history: PreferenceHistoryEntry[]) {
  const recent = history.slice(0, 8);
  if (!recent.length) {
    return {
      label: "Calibrating",
      score: 55,
      driftFlags: ["Not enough completed recommendation history yet."],
      patternNotes: ["The model needs a few completed recommendation cycles before drift can be judged."],
      confidenceReason: "Model fit is provisional because the evidence set is still thin.",
    };
  }

  const fidelityScores = recent
    .map((entry) => (typeof entry.fidelityScore === "number" ? entry.fidelityScore : null))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const avgFidelity = fidelityScores.length
    ? fidelityScores.reduce((sum, value) => sum + value, 0) / fidelityScores.length
    : 60;

  const partialOrAbandoned = recent.filter((entry) => entry.sessionOutcome === "partial" || entry.sessionOutcome === "abandoned").length;
  const substitutionHeavy = recent.filter((entry) => (entry.substitutionKeys?.length ?? 0) >= 2).length;
  const lowerMisses = recent.filter((entry) => entry.recommendedFocus === "Lower" && entry.actualFocus !== "Lower").length;
  const delayed = recent.filter((entry) => (entry.daysSinceRecommendation ?? 0) >= 2).length;
  const focusMismatch = recent.filter((entry) => entry.recommendedFocus && entry.actualFocus && entry.recommendedFocus !== entry.actualFocus).length;

  let score = Math.round(avgFidelity);
  score -= partialOrAbandoned * 8;
  score -= substitutionHeavy * 6;
  score -= lowerMisses * 8;
  score -= delayed * 4;
  score -= focusMismatch * 5;
  score = Math.max(20, Math.min(95, score));

  const driftFlags: string[] = [];
  const patternNotes: string[] = [];

  if (lowerMisses >= 2) {
    driftFlags.push("Lower-day recommendations have recently been redirected or only partly followed.");
  }
  if (focusMismatch >= 3) {
    driftFlags.push("Actual session focus has drifted away from the recommended focus multiple times.");
  }
  if (delayed >= 2) {
    driftFlags.push("Recommendations are often being completed after a delay, which softens model confidence.");
  }
  if (substitutionHeavy >= 2) {
    patternNotes.push("Recent sessions show repeated substitutions, suggesting the model should treat exercise preference with more caution.");
  }
  if (partialOrAbandoned >= 2) {
    patternNotes.push("Recent completion quality has been uneven, so today's recommendation should be read as a best fit rather than a commandment.");
  }
  if (!driftFlags.length) {
    driftFlags.push("Recent outcomes are lining up closely enough that the model still fits your behavior.");
  }
  if (!patternNotes.length) {
    patternNotes.push("Recent recommendation outcomes look coherent, so the model is not seeing major drift right now.");
  }

  const label =
    score >= 78 ? "Stable"
    : score >= 60 ? "Watching drift"
    : "Recalibration suggested";

  const confidenceReason =
    score >= 78
      ? "Confidence stays firm because recent completed sessions are still broadly matching the recommendation pattern."
      : score >= 60
      ? "Confidence is moderated because the recommendation pattern is starting to drift from actual behavior."
      : "Confidence is reduced because recent actual behavior no longer matches the model reliably enough.";

  return {
    label,
    score,
    driftFlags,
    patternNotes,
    confidenceReason,
    stats: {
      partialOrAbandoned,
      substitutionHeavy,
      lowerMisses,
      delayed,
      focusMismatch,
      recentCount: recent.length,
    },
  };
}

function buildAuditTrail(brainSnapshot: BrainSnapshot | null, history: PreferenceHistoryEntry[]) {
  if (!brainSnapshot) {
    return ["No active recommendation available yet."];
  }
  const latest = latestRecommendationOutcome(history);
  const trail: string[] = [];

  if (brainSnapshot.recommendedSession.plannedDayName) {
    trail.push(`Configured split day selected: ${brainSnapshot.recommendedSession.plannedDayName}.`);
  } else {
    trail.push(`Recommended focus lane: ${brainSnapshot.recommendedSession.focus}.`);
  }

  const topRationale = brainSnapshot.nextSessionPriority.rationaleSummary?.[0];
  if (topRationale) {
    trail.push(`Top driver: ${topRationale}`);
  }

  const topConstraint = brainSnapshot.nextSessionPriority.constraintsApplied?.[0];
  if (topConstraint) {
    trail.push(`Constraint applied: ${topConstraint}`);
  }

  if (latest && typeof latest.fidelityScore === "number") {
    trail.push(`Last completed recommendation fidelity: ${Math.round(latest.fidelityScore)}%.`);
  }

  return trail;
}

function buildSelfCorrectionNarrative(
  brainSnapshot: BrainSnapshot | null,
  history: PreferenceHistoryEntry[],
  modelFit: ReturnType<typeof buildModelFit>
) {
  const latest = latestRecommendationOutcome(history);
  if (!brainSnapshot) {
    return "No current recommendation means there is nothing to audit yet.";
  }
  if (!latest) {
    return "The engine is still collecting completed recommendation outcomes before it starts correcting its own coaching.";
  }
  if (modelFit.stats.lowerMisses >= 2) {
    return "Lower-day follow-through has been shakier lately, so the engine is treating lower recommendations with more caution and less swagger.";
  }
  if (modelFit.stats.substitutionHeavy >= 2) {
    return "Recent sessions keep drifting through substitutions, so the engine is tightening the core intent while easing up on pretending every accessory choice is sacred.";
  }
  if (modelFit.stats.focusMismatch >= 3) {
    return "Recent actual sessions have pulled away from the original recommendation lane, so the app is reducing confidence and watching for sustained drift before it suggests recalibration.";
  }
  if (latest.actualFocus && latest.actualFocus === brainSnapshot.recommendedSession.focus) {
    return "Recent outcomes still support the same broad lane, so the engine is reinforcing what has been working instead of chasing novelty.";
  }
  return "The coach layer is carrying forward the last completed outcome and adjusting its confidence, but it is still leaving the deterministic split logic in charge.";
}

function buildRecalibrationSignal(
  history: PreferenceHistoryEntry[],
  modelFit: ReturnType<typeof buildModelFit>
) {
  if (!history.length) {
    return {
      phase: "stable",
      state: "Not needed",
      score: 42,
      confidence: 35,
      evidenceWindow: 0,
      note: "The model still needs a few more completed recommendation cycles before recalibration would mean anything.",
      triggers: ["Evidence is still thin."],
      triggerSummary: "Evidence is still thin.",
      recommendedScope: [] as string[],
      freezeRecommended: false,
      probationCyclesRemaining: 0,
    };
  }
  if (modelFit.score < 60) {
    return {
      phase: "suggested",
      state: "Suggested",
      score: 68,
      confidence: 58,
      evidenceWindow: history.length,
      note: "Recent outcomes are drifting enough that the saved model may no longer fit your real training behavior cleanly.",
      triggers: ["Model-fit drift is now strong enough to justify a conservative recalibration suggestion."],
      triggerSummary: "Model-fit drift is now strong enough to justify a conservative recalibration suggestion.",
      recommendedScope: ["prediction", "fingerprint"],
      freezeRecommended: true,
      probationCyclesRemaining: 0,
    };
  }
  if (modelFit.stats.lowerMisses >= 2 || modelFit.stats.focusMismatch >= 3) {
    return {
      phase: "watch",
      state: "Watch closely",
      score: 52,
      confidence: 46,
      evidenceWindow: history.length,
      note: "There are early signs that the current split execution and the saved recommendation model are starting to diverge.",
      triggers: ["Recent focus or lower-day drift is worth watching before the app recommends intervention."],
      triggerSummary: "Recent focus or lower-day drift is worth watching before the app recommends intervention.",
      recommendedScope: ["split_confidence"],
      freezeRecommended: false,
      probationCyclesRemaining: 0,
    };
  }
  return {
    phase: "stable",
    state: "Not needed",
    score: 82,
    confidence: 54,
    evidenceWindow: history.length,
    note: "The current model still fits recent behavior well enough that recalibration can wait.",
    triggers: ["No major recalibration triggers are flashing right now."],
    triggerSummary: "No major recalibration triggers are flashing right now.",
    recommendedScope: [] as string[],
    freezeRecommended: false,
    probationCyclesRemaining: 0,
  };
}


function readinessTone(status: string) {
  if (status === "ready_to_push") return { bg: "#ebf8ee", border: "#b8dfc0" };
  if (status === "watch_fatigue") return { bg: "#fff8ea", border: "#ebd39e" };
  if (status === "recovery_constrained") return { bg: "#fff3e8", border: "#efc9a8" };
  if (status === "low_signal_confidence") return { bg: "#f4f4f4", border: "#d9d9d9" };
  return { bg: "#eef7ff", border: "#c9dcf5" };
}

function fmtPct(value: number | null) {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

function fmtTrend(value: string) {
  if (value === "up") return "Up";
  if (value === "down") return "Down";
  if (value === "flat") return "Flat";
  return "Unknown";
}


function fmtPredictionBucket(bucket: PredictionScaffold["predictedDelayBucket"] | null | undefined) {
  if (bucket === "same_day") return "Same day";
  if (bucket === "1_day") return "About 1 day";
  if (bucket === "2_plus_days") return "2+ days";
  return "Unknown";
}

function fmtPredictionOutcome(outcome: PredictionScaffold["predictedCompletion"] | null | undefined) {
  if (outcome === "as_prescribed") return "As prescribed";
  if (outcome === "modified") return "Modified";
  if (outcome === "partial") return "Partial";
  return "Unknown";
}

function fmtActualOutcome(outcome: PredictionReviewEntry["actualCompletion"] | null | undefined) {
  if (outcome === "as_prescribed") return "As prescribed";
  if (outcome === "modified") return "Modified";
  if (outcome === "partial") return "Partial";
  if (outcome === "abandoned") return "Abandoned";
  return "Unknown";
}

function fmtRecalibrationActionType(value: RecalibrationAction["type"]) {
  if (value === "prediction_confidence_damp") return "Prediction confidence damp";
  if (value === "prediction_expectation_reset") return "Prediction expectation reset";
  return value;
}

function describeRecalibrationAction(action: RecalibrationAction | null) {
  if (!action) return "No recalibration action has executed yet.";
  const beforeConfidence = action.before.predictionConfidence != null ? `${action.before.predictionConfidence}/100` : "—";
  const afterConfidence = action.after.predictionConfidence != null ? `${action.after.predictionConfidence}/100` : "—";
  const beforeFocus = action.before.expectedFocusProbability != null ? `${action.before.expectedFocusProbability}%` : "—";
  const afterFocus = action.after.expectedFocusProbability != null ? `${action.after.expectedFocusProbability}%` : "—";
  const completionShift = [action.before.expectedCompletionLabel, action.after.expectedCompletionLabel].filter(Boolean).join(" → ");
  const probation = action.status === "active"
    ? `Probation ${action.probationCyclesRemaining} cycle${action.probationCyclesRemaining === 1 ? "" : "s"} remaining.`
    : "Probation complete.";
  return `${fmtRecalibrationActionType(action.type)} • confidence ${beforeConfidence} → ${afterConfidence} • focus ${beforeFocus} → ${afterFocus}${completionShift ? ` • ${completionShift}` : ""}. ${probation}`;
}

function behaviorTraitTone(trait: BehaviorTrait) {
  if (trait.key === "substitutionTendency" || trait.key === "delayTendency") {
    if (trait.score >= 55) return { bg: "#fff3e8", border: "#efc9a8" };
    if (trait.score >= 35) return { bg: "#fff8ea", border: "#ebd39e" };
    return { bg: "#ebf8ee", border: "#b8dfc0" };
  }
  if (trait.score >= 75) return { bg: "#ebf8ee", border: "#b8dfc0" };
  if (trait.score >= 55) return { bg: "#eef7ff", border: "#c9dcf5" };
  return { bg: "#fff3e8", border: "#efc9a8" };
}

function frictionTone(level: FrictionProfile["level"]): { bg: string; border: string } {
  if (level === "high") return { bg: "#ffe7e7", border: "#e7b0b0" };
  if (level === "moderate") return { bg: "#fff7e5", border: "#ead39a" };
  return { bg: "#ecf8ee", border: "#b9dfc0" };
}

function priorityLabel(category: string) {
  return category.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function mapSeriesToReadinessInput(setsSeries: Point[], weightSeries: Point[], preferenceHistory: PreferenceHistoryEntry[]): ReadinessInput {
  return {
    workouts: setsSeries.map((p) => ({
      date: p.xLabel,
      completed: Number(p.y) > 0
    })),
    bodyweight: weightSeries
      .filter((p) => Number.isFinite(Number(p.y)) && Number(p.y) > 0)
      .map((p) => ({
        date: p.xLabel,
        weight: Number(p.y)
      })),
    scorecards: [],
    preferenceHistory: preferenceHistory.map((entry) => ({
      timestamp: entry.timestamp,
      fidelityScore: typeof entry.fidelityScore === "number" ? entry.fidelityScore : null,
      sessionOutcome: entry.sessionOutcome,
      loadDeltaAvg: typeof entry.loadDeltaAvg === "number" ? entry.loadDeltaAvg : null,
      volumeDelta: typeof entry.volumeDelta === "number" ? entry.volumeDelta : null,
      substitutionCount: Array.isArray(entry.substitutionKeys) ? entry.substitutionKeys.length : 0,
      primaryOutcome: entry.primaryOutcome
    }))
  };
}

const SLOT_OPTIONS: Array<SplitDayDefinition["slots"][number]> = [
  "PrimaryPress",
  "SecondaryPress",
  "Shoulders",
  "Triceps",
  "Pump",
  "PrimaryRow",
  "VerticalPull",
  "SecondaryRow",
  "RearDelts",
  "Biceps",
  "PrimarySquat",
  "Hinge",
  "SecondaryQuad",
  "Hamstrings",
  "Calves",
];

function makeDay(name: string, slots: SplitDayDefinition["slots"]): SplitDayDefinition {
  return {
    id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    slots,
  };
}

function pplPreset(): TrainingSplitConfig {
  return {
    preset: "ppl",
    days: [
      makeDay("Push", ["PrimaryPress", "SecondaryPress", "Shoulders", "Triceps", "Pump"]),
      makeDay("Pull", ["PrimaryRow", "VerticalPull", "SecondaryRow", "RearDelts", "Biceps"]),
      makeDay("Lower", ["PrimarySquat", "Hinge", "SecondaryQuad", "Hamstrings", "Calves"]),
    ],
  };
}

function broPreset(): TrainingSplitConfig {
  return {
    preset: "bro",
    days: [
      makeDay("Chest", ["PrimaryPress", "SecondaryPress", "Shoulders", "Triceps", "Pump"]),
      makeDay("Back", ["PrimaryRow", "VerticalPull", "SecondaryRow", "RearDelts", "Biceps"]),
      makeDay("Shoulders", ["Shoulders", "Shoulders", "SecondaryPress", "RearDelts", "Triceps"]),
      makeDay("Arms", ["Biceps", "Triceps", "Biceps", "Triceps", "Pump"]),
      makeDay("Legs", ["PrimarySquat", "Hinge", "SecondaryQuad", "Hamstrings", "Calves"]),
    ],
  };
}

function initialCustomPreset(): TrainingSplitConfig {
  return {
    preset: "custom",
    days: [
      makeDay("Upper", ["PrimaryPress", "PrimaryRow", "VerticalPull", "Shoulders", "Biceps"]),
      makeDay("Lower", ["PrimarySquat", "Hinge", "SecondaryQuad", "Hamstrings", "Calves"]),
    ],
  };
}

export default function DashboardView(props: Props) {
  const {
    dashBusy,
    refreshDashboard,
    exportBackup,
    backupBusy,
    importFileRef,
    loadBandEquiv,
    bandEquivMap,
    setBandEquivMap,
    bandComboFactor,
    setBandComboFactor,
    saveBandEquiv,
    weeklyCoach,
    tonnageSeries,
    setsSeries,
    benchSeries,
    squatSeries,
    dlSeries,
    weightSeries,
    waistSeries,
    sleepSeries,
    calSeries,
    proteinSeries,
    z2Series,
    refreshAiCoach,
    aiCoachBusy,
    aiCoachErr,
    aiCoach,
    milestones,
    timelineWeeks,
    brainSnapshot,
    frictionProfile,
    splitConfig,
    userEmail,
    syncStatus,
    lastSyncedAt,
    splitPreset,
    splitDayNames,
    lastCompletedSplitDayName,
    saveTrainingSplitConfig,
    startSessionFromRecommendation,
    preferenceHistory,
    behaviorFingerprint,
    predictionScaffold,
    predictionReviewHistory,
    predictionAccuracySummary,
    adaptationWeights,
    mutationLedger,
    recalibrationState,
    timerOn,
    setTimerOn,
    secs,
    setSecs
  } = props;

  const [splitDraft, setSplitDraft] = useState<TrainingSplitConfig>(splitConfig ?? pplPreset());
  const [splitSaving, setSplitSaving] = useState(false);
  const [showRecommendationWhy, setShowRecommendationWhy] = useState(false);
  const [showDevHatch, setShowDevHatch] = useState(false);

  useEffect(() => {
    setSplitDraft(splitConfig ?? pplPreset());
  }, [splitConfig]);

  const safePreferenceHistory = Array.isArray(preferenceHistory) ? preferenceHistory : [];
  const safePredictionReviewHistory = normalizePredictionReviewHistory(predictionReviewHistory);
  const safeBehaviorFingerprint = normalizeBehaviorFingerprint(behaviorFingerprint);
  const safePredictionScaffold = normalizePredictionScaffold(predictionScaffold);
  const safePredictionAccuracy = normalizePredictionAccuracy(predictionAccuracySummary);
  const safeAdaptation = normalizeAdaptationState(adaptationWeights);
  const safeMutationLedger = normalizeMutationLedger(mutationLedger);
  const safeRecalibration = normalizeRecalibrationState(recalibrationState);

  const tonnage28 = Math.round(sumPoints(tonnageSeries));
  const sets28 = Math.round(sumPoints(setsSeries));
  const trainingDays28 = activeDays(setsSeries);
  const avgTonnagePerTrainingDay = trainingDays28 > 0 ? Math.round(tonnage28 / trainingDays28) : 0;
  const avgSetsPerTrainingDay = trainingDays28 > 0 ? Math.round((sets28 / trainingDays28) * 10) / 10 : 0;
  const modelFit = buildModelFit(safePreferenceHistory);
  const behaviorTraits = safeBehaviorFingerprint.traits;
  const latestPredictionReview = safePredictionReviewHistory.latest;
  const latestMutation = safeMutationLedger.latest;
  const latestRecalibrationAction = props.recalibrationAction || null;
  const activeRecalibrationAction = latestRecalibrationAction?.status === "active" ? latestRecalibrationAction : null;
  const sandboxScenarioLabel = props.recalibrationSandboxScenario
    ? props.recalibrationSandboxScenario.replace(/_/g, " ")
    : null;
  const auditTrail = buildAuditTrail(brainSnapshot, safePreferenceHistory);
  const selfCorrectionNarrative = buildSelfCorrectionNarrative(brainSnapshot, safePreferenceHistory, modelFit);
  const fallbackRecalibration = buildRecalibrationSignal(safePreferenceHistory, modelFit);
  const recalibrationSignal = safeRecalibration.isAvailable
    ? {
        phase: safeRecalibration.phase ?? "watch",
        state: safeRecalibration.state ?? "Watch closely",
        score: safeRecalibration.score ?? null,
        confidence: safeRecalibration.confidence ?? null,
        evidenceWindow: safeRecalibration.evidenceWindow ?? null,
        note: safeRecalibration.note ?? "Recalibration state is only partially available right now.",
        triggers: safeRecalibration.triggers,
        triggerSummary: safeRecalibration.triggerSummary ?? (safeRecalibration.triggers[0] ?? "Recalibration state is partially available."),
        recommendedScope: safeRecalibration.recommendedScope,
        freezeRecommended: safeRecalibration.freezeRecommended ?? false,
        probationCyclesRemaining: safeRecalibration.probationCyclesRemaining ?? 0,
      }
    : fallbackRecalibration;

  const keyLiftCards = [
    { label: "Bench Press", points: benchSeries },
    { label: "Squat", points: squatSeries },
    { label: "Deadlift / RDL", points: dlSeries }
  ];

  const updateDay = (dayId: string, patch: Partial<SplitDayDefinition>) => {
    setSplitDraft((prev) => ({
      ...prev,
      days: prev.days.map((day) => day.id === dayId ? { ...day, ...patch } : day),
    }));
  };

  const updateDaySlot = (dayId: string, slotIndex: number, value: string) => {
    setSplitDraft((prev) => ({
      ...prev,
      days: prev.days.map((day) => {
        if (day.id !== dayId) return day;
        const slots = [...day.slots];
        if (value) slots[slotIndex] = value as SplitDayDefinition["slots"][number];
        return { ...day, slots: slots.filter(Boolean).slice(0, 6) };
      }),
    }));
  };

  const addCustomDay = () => {
    setSplitDraft((prev) => ({
      preset: "custom",
      days: [...prev.days, makeDay(`Day ${prev.days.length + 1}`, ["PrimaryPress", "SecondaryPress", "Triceps", "Pump", "Shoulders"])],
    }));
  };

  const moveDay = (dayId: string, dir: -1 | 1) => {
    setSplitDraft((prev) => {
      const idx = prev.days.findIndex((day) => day.id === dayId);
      if (idx < 0) return prev;
      const nextIdx = idx + dir;
      if (nextIdx < 0 || nextIdx >= prev.days.length) return prev;
      const days = [...prev.days];
      const [item] = days.splice(idx, 1);
      days.splice(nextIdx, 0, item);
      return { ...prev, days };
    });
  };

  const removeDay = (dayId: string) => {
    setSplitDraft((prev) => ({
      ...prev,
      days: prev.days.length <= 1 ? prev.days : prev.days.filter((day) => day.id !== dayId),
    }));
  };

  const saveSplit = async () => {
    setSplitSaving(true);
    try {
      const cleaned: TrainingSplitConfig = {
        preset: splitDraft.preset,
        days: splitDraft.days.map((day, idx) => ({
          id: day.id || `day-${idx + 1}`,
          name: day.name.trim() || `Day ${idx + 1}`,
          slots: day.slots.filter(Boolean).slice(0, 6),
        })).filter((day) => day.slots.length > 0),
      };
      await saveTrainingSplitConfig(cleaned.days.length ? cleaned : pplPreset());
    } finally {
      setSplitSaving(false);
    }
  };

  const applyPreset = (preset: "ppl" | "bro" | "custom") => {
    if (preset === "ppl") setSplitDraft(pplPreset());
    else if (preset === "bro") setSplitDraft(broPreset());
    else setSplitDraft(initialCustomPreset());
  };

  const readinessInput = useMemo(
    () => mapSeriesToReadinessInput(setsSeries, weightSeries, safePreferenceHistory),
    [setsSeries, weightSeries, safePreferenceHistory]
  );

  const readiness = useMemo(
    () => buildReadinessContext(readinessInput),
    [readinessInput]
  );

  const readinessChip = readinessTone(readiness.status);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>Dashboard</h3>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
            Built from local workout + quick log data, so the whole rig still thinks offline.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={refreshDashboard} disabled={dashBusy}>{dashBusy ? "Refreshing…" : "Refresh"}</button>
          <button onClick={exportBackup} disabled={backupBusy}>{backupBusy ? "Exporting…" : "Export Backup"}</button>
          <button onClick={() => importFileRef.current?.click()}>Import Backup</button>
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 14, background: readinessChip.bg, border: `1px solid ${readinessChip.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Readiness Snapshot — Phase 4E</div>
            <div style={{ fontSize: 28, fontWeight: 800, marginTop: 2 }}>{formatReadinessLabel(readiness.status)}</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{readiness.summary.reasonShort}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Signal Confidence</div>
            <div style={{ fontSize: 22, fontWeight: 800, textTransform: "capitalize" }}>{readiness.confidence}</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Coverage: {Math.round(readiness.metrics.signalCoverage * 100)}%</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Adherence (7d)</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtPct(readiness.metrics.adherence7d)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Adherence (28d)</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtPct(readiness.metrics.adherence28d)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Session Density (7d)</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{readiness.metrics.sessionDensity7d ?? "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Bodyweight Trend (14d)</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtTrend(readiness.metrics.bodyweightTrend14d)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Scorecard Trend</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtTrend(readiness.metrics.scorecardTrend)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Recent Fidelity</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>
              {readiness.metrics.recentFidelityAvg != null ? `${Math.round(readiness.metrics.recentFidelityAvg)}%` : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Prescription Trust</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{formatPrescriptionTrust(readiness.metrics.prescriptionTrust)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Fidelity Trend</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtTrend(readiness.metrics.fidelityTrend)}</div>
          </div>
        </div>

        {(readiness.drivers.length > 0 || readiness.watchFlags.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, marginTop: 12 }}>
            <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.45)" }}>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Context Drivers</div>
              {readiness.drivers.length > 0 ? readiness.drivers.map((driver) => (
                <div key={driver.key} style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700 }}>{driver.label}</div>
                  {driver.detail && <div style={{ fontSize: 12, opacity: 0.78, marginTop: 2 }}>{driver.detail}</div>}
                </div>
              )) : <div style={{ fontSize: 12, opacity: 0.7 }}>No strong drivers yet.</div>}
            </div>

            <div style={{ border: "1px solid rgba(0,0,0,0.08)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.45)" }}>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Watch Items</div>
              {readiness.watchFlags.length > 0 ? readiness.watchFlags.map((flag) => (
                <div key={flag.key} style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 700 }}>{flag.label}</div>
                  <div style={{ fontSize: 12, opacity: 0.72, marginTop: 2, textTransform: "capitalize" }}>{flag.severity}</div>
                </div>
              )) : <div style={{ fontSize: 12, opacity: 0.7 }}>Nothing flashing red right now.</div>}
            </div>
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.78 }}>
          Readiness now includes how faithfully recent sessions matched prescription, so Dashboard and Workout stop telling different stories like a couple of drunks at last call.
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Athlete Behavior Pattern</div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>
              {formatPatternValue(readiness.patterns.executionDiscipline)} Execution
            </div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
              This is the system’s current read on how you actually carry out written sessions.
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 12, opacity: 0.75 }}>
            <div>Load Δ avg: {readiness.patternEvidence.avgLoadDelta != null ? `${readiness.patternEvidence.avgLoadDelta > 0 ? "+" : ""}${readiness.patternEvidence.avgLoadDelta.toFixed(1)}%` : "—"}</div>
            <div style={{ marginTop: 4 }}>Volume Δ avg: {readiness.patternEvidence.avgVolumeDelta != null ? `${readiness.patternEvidence.avgVolumeDelta > 0 ? "+" : ""}${readiness.patternEvidence.avgVolumeDelta.toFixed(1)}%` : "—"}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Execution Discipline</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{formatPatternValue(readiness.patterns.executionDiscipline)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Load Aggression</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{formatPatternValue(readiness.patterns.loadAggression)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Volume Drift</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{formatPatternValue(readiness.patterns.volumeDrift)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Exercise Substitution</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{formatPatternValue(readiness.patterns.substitutionPattern)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Anchor Reliability</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{formatPatternValue(readiness.patterns.anchorReliability)}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginTop: 14 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>28-Day Tonnage</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{tonnage28.toLocaleString()}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Avg / training day: {avgTonnagePerTrainingDay.toLocaleString()}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>28-Day Work Sets</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{sets28.toLocaleString()}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Avg / training day: {avgSetsPerTrainingDay}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Training Days (28d)</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{trainingDays28}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Days with logged work sets</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>This Week Snapshot</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{weeklyCoach ? weeklyCoach.sessionsThis : "—"} sessions</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {weeklyCoach ? `${weeklyCoach.tonnageThis.toLocaleString()} tonnage / ${weeklyCoach.setsThis} sets` : "Refresh dashboard"}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {keyLiftCards.map((card) => {
          const latest = latestPoint(card.points);
          const best = bestPoint(card.points);
          const trend = trendText(card.points);
          return (
            <div key={card.label} style={cardStyle}>
              <div style={{ fontWeight: 800 }}>{card.label}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Latest e1RM</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{latest != null ? Math.round(latest) : "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Best e1RM</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{best != null ? Math.round(best) : "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Trend</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{trend}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>Canonical exercise mapping is feeding this cleanly.</div>
            </div>
          );
        })}
      </div>

      <div style={{ ...cardStyle, marginTop: 14, background: "#f8fbff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Split setup</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>Define the split you actually run</div>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>Pick a preset or build your own days. The engine uses this to decide what day is next, then prescribes the work.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => applyPreset("ppl")}>Load PPL</button>
            <button onClick={() => applyPreset("bro")}>Load Bro Split</button>
            <button onClick={() => applyPreset("custom")}>Start Custom</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          {(["ppl", "bro", "custom"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setSplitDraft((prev) => ({ ...prev, preset: option }))}
              style={{
                border: splitDraft.preset === option ? "2px solid #111" : "1px solid #ccc",
                background: splitDraft.preset === option ? "#111" : "#fff",
                color: splitDraft.preset === option ? "#fff" : "#111",
                borderRadius: 10,
                padding: "10px 14px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {option === "ppl" ? "PPL" : option === "bro" ? "Bro" : "Custom"}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          {splitDraft.days.map((day, idx) => (
            <div key={day.id} style={{ ...cardStyle, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ display: "grid", gap: 6, minWidth: 220, flex: 1 }}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Day {idx + 1}</div>
                  <input
                    value={day.name}
                    onChange={(e) => updateDay(day.id, { name: e.target.value })}
                    placeholder="Day name"
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={() => moveDay(day.id, -1)}>↑</button>
                  <button onClick={() => moveDay(day.id, 1)}>↓</button>
                  <button onClick={() => removeDay(day.id)}>Remove</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 10 }}>
                {[0, 1, 2, 3, 4, 5].map((slotIndex) => (
                  <label key={slotIndex} style={{ fontSize: 12 }}>
                    Slot {slotIndex + 1}
                    <select
                      value={day.slots[slotIndex] ?? ""}
                      onChange={(e) => updateDaySlot(day.id, slotIndex, e.target.value)}
                      style={{ width: "100%" }}
                    >
                      <option value="">—</option>
                      {SLOT_OPTIONS.map((slot) => (
                        <option key={slot} value={slot}>{slot}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button onClick={addCustomDay}>Add day</button>
          <button onClick={saveSplit} disabled={splitSaving} style={{ fontWeight: 800 }}>
            {splitSaving ? "Saving…" : "Save split and rebuild recommendation"}
          </button>
        </div>
      </div>

      {frictionProfile && (
        <>
          <h4 style={{ marginTop: 18, marginBottom: 8 }}>Recovery & Friction Constraints — Phase 5C</h4>
          <div style={{ ...cardStyle, background: frictionTone(frictionProfile.level).bg, borderColor: frictionTone(frictionProfile.level).border }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Current Friction</div>
                <div style={{ fontSize: 26, fontWeight: 800, textTransform: "capitalize" }}>{frictionProfile.level}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Score</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{frictionProfile.score}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginTop: 12 }}>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Progression</div>
                <div style={{ fontSize: 20, fontWeight: 800, textTransform: "capitalize" }}>{frictionProfile.recommendations.progressionCap}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Volume</div>
                <div style={{ fontSize: 20, fontWeight: 800, textTransform: "capitalize" }}>{frictionProfile.recommendations.volumeCap}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Novelty</div>
                <div style={{ fontSize: 20, fontWeight: 800, textTransform: "capitalize" }}>{frictionProfile.recommendations.noveltyCap}</div>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Anchors</div>
                <div style={{ fontSize: 20, fontWeight: 800, textTransform: "capitalize" }}>{frictionProfile.recommendations.anchorDemand}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 12 }}>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Drivers</div>
                <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                  {(frictionProfile.drivers.length ? frictionProfile.drivers : ["No major friction drivers detected."]).map((item) => (
                    <li key={item} style={{ marginTop: 4 }}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Current constraints</div>
                <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                  {frictionProfile.constraints.map((item) => (
                    <li key={item} style={{ marginTop: 4 }}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Why the engine is responding this way</div>
                <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                  {frictionProfile.reasons.map((item) => (
                    <li key={item} style={{ marginTop: 4 }}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </>
      )}

      {brainSnapshot && (
        <>
          <h4 style={{ marginTop: 18, marginBottom: 8 }}>Brain Snapshot — Phase 2B</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
            {[
              ["Readiness", brainSnapshot.readiness],
              ["Momentum", brainSnapshot.momentum],
              ["Recovery", brainSnapshot.recovery],
              ["Compliance", brainSnapshot.compliance]
            ].map(([label, metric]) => (
              <div key={label} style={{ ...cardStyle, background: label === "Recovery" ? "#fffdf3" : "#fbfbfb" }}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{label}</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{metric.score}</div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{metric.label}</div>
              </div>
            ))}
          </div>

          <div style={{ ...cardStyle, marginTop: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.75 }}>System Take</div>
            <div style={{ marginTop: 4 }}>{brainSnapshot.systemTake}</div>
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>Next Focus</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{brainSnapshot.nextFocus}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginTop: 10 }}>
            {brainSnapshot.signalCards.map((card) => (
              <div key={card.label} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <div style={{ fontWeight: 800 }}>{card.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800 }}>{card.value}</div>
                </div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{card.note}</div>
              </div>
            ))}
          </div>

          <div style={{ ...cardStyle, marginTop: 10, background: "#f8fbff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Next-Session Priority Biasing — Phase 5D</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>Top priorities for the next bite of work</div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Deterministic queue, not AI vibes</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 12 }}>
              {brainSnapshot.nextSessionPriority.topPriorities.map((item) => (
                <div key={`${item.category}-${item.target}`} style={cardStyle}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{priorityLabel(item.category)}</div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{item.priorityScore}</div>
                  <div style={{ marginTop: 4, fontWeight: 700 }}>{item.target}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 12 }}>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Why these are leading</div>
                <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                  {brainSnapshot.nextSessionPriority.rationaleSummary.map((item) => (
                    <li key={item} style={{ marginTop: 4 }}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Constraints applied</div>
                <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                  {brainSnapshot.nextSessionPriority.constraintsApplied.map((item) => (
                    <li key={item} style={{ marginTop: 4 }}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={cardStyle}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>What can wait</div>
                <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                  {brainSnapshot.nextSessionPriority.deprioritized.map((item) => (
                    <li key={item} style={{ marginTop: 4 }}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div style={{ ...cardStyle, marginTop: 10, background: focusTone(brainSnapshot.recommendedSession.focus) }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Recommended Next Session</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{brainSnapshot.recommendedSession.title}</div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{brainSnapshot.recommendedSession.bias}</div>
                <button
                  type="button"
                  onClick={() => setShowRecommendationWhy((prev) => !prev)}
                  // Dev hatch toggle below
                  
                  style={{
                    border: "1px solid #111",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontWeight: 800,
                    background: "transparent",
                    color: "#111",
                    cursor: "pointer"
                  }}
                >
                  {showRecommendationWhy ? "Hide Why" : "Why This Session?"} | Dev Hatch
                </button>
                <button
                  type="button"
                  onClick={() => setShowDevHatch((prev) => !prev)}
                  style={{
                    border: "1px dashed #999",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontWeight: 600,
                    background: "#f7f7f7",
                    color: "#333",
                    cursor: "pointer"
                  }}
                >
                  {showDevHatch ? "Hide Hatch" : "Dev Hatch"}
                </button>
                <button
                  onClick={startSessionFromRecommendation}
                  style={{
                    border: "1px solid #111",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontWeight: 800,
                    background: "#111",
                    color: "#fff",
                    cursor: "pointer"
                  }}
                >
                  Start This Session
                </button>
              </div>
            </div>

            {brainSnapshot.recommendedSession.alerts?.length ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {brainSnapshot.recommendedSession.alerts.map((alert) => {
                  const tone = alertChipTone(alert);
                  return (
                    <div
                      key={alert}
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "6px 10px",
                        borderRadius: 999,
                        background: tone.bg,
                        border: `1px solid ${tone.border}`
                      }}
                    >
                      {alert}
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div style={{ marginTop: 8, lineHeight: 1.4 }}>{brainSnapshot.recommendedSession.rationale}</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{brainSnapshot.recommendedSession.volumeNote}</div>

            {showRecommendationWhy ? (
              <div style={{ ...cardStyle, marginTop: 12, background: "rgba(255,255,255,0.72)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Why this session landed here</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{preferenceConfidenceLabel(preferenceHistory)}</div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>
                    {brainSnapshot.recommendedSession.plannedDayName
                      ? `Configured split day: ${brainSnapshot.recommendedSession.plannedDayName}`
                      : `Recommended focus: ${brainSnapshot.recommendedSession.focus}`}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 12 }}>
                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Current call</div>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>{brainSnapshot.recommendedSession.title}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>{brainSnapshot.recommendedSession.bias}</div>
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                      {brainSnapshot.recommendedSession.plannedDayName
                        ? `Planned split day: ${brainSnapshot.recommendedSession.plannedDayName}`
                        : "No named split day available"}
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Why it rose to the top</div>
                    <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                      {brainSnapshot.nextSessionPriority.rationaleSummary.slice(0, 4).map((item) => (
                        <li key={item} style={{ marginTop: 4 }}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Constraints respected</div>
                    <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                      {brainSnapshot.nextSessionPriority.constraintsApplied.slice(0, 4).map((item) => (
                        <li key={item} style={{ marginTop: 4 }}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}>
                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>What can wait</div>
                    <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                      {brainSnapshot.nextSessionPriority.deprioritized.slice(0, 4).map((item) => (
                        <li key={item} style={{ marginTop: 4 }}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Confidence evidence</div>
                    <div style={{ marginTop: 8, lineHeight: 1.45, fontSize: 13 }}>
                      {preferenceConfidenceNote(safePreferenceHistory)}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}>
                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Last recommendation vs actual</div>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>
                      {buildOutcomeHeadline(latestRecommendationOutcome(safePreferenceHistory))}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45, opacity: 0.85 }}>
                      {buildOutcomeDetail(latestRecommendationOutcome(safePreferenceHistory))}
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>What changed from last time</div>
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
                      {buildLearningNote(latestRecommendationOutcome(safePreferenceHistory), brainSnapshot)}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}>
                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Behavior fingerprint</div>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>Confidence: {safeBehaviorFingerprint.isAvailable && safeBehaviorFingerprint.confidence != null ? `${safeBehaviorFingerprint.confidence}/100` : "Awaiting usable data"}</div>
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
                      {safeBehaviorFingerprint.headline || (safeBehaviorFingerprint.isPartial ? "The self-model is only partially available right now." : "The self-model is still waiting for enough completed recommendation cycles to say anything useful.")}
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Prediction scaffold</div>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>
                      {safePredictionScaffold.predictedCompletion ? fmtPredictionOutcome(safePredictionScaffold.predictedCompletion) : "Unavailable"}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                      Focus match {safePredictionScaffold.predictedFocusMatchProbability != null ? `${safePredictionScaffold.predictedFocusMatchProbability}%` : "—"} • Delay {fmtPredictionBucket(safePredictionScaffold.predictedDelayBucket)}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
                      {safePredictionScaffold.reasons[0] || (safePredictionScaffold.isPartial ? "Prediction scaffolding is only partially available right now." : "Prediction scaffolding will start talking once the self-model has enough evidence.")}
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Prediction confidence</div>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>{safePredictionScaffold.confidence != null ? `${safePredictionScaffold.confidence}/100` : "Awaiting usable data"}</div>
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
                      {safePredictionScaffold.reasons[1] || (safePredictionScaffold.isPartial ? "Prediction confidence is only partially available right now." : "No prediction confidence note yet.")}
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Prediction accuracy</div>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>{safePredictionAccuracy.isAvailable && safePredictionAccuracy.label && safePredictionAccuracy.score != null ? `${safePredictionAccuracy.label} • ${safePredictionAccuracy.score}/100` : "Awaiting usable data"}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                      Confidence {safePredictionAccuracy.confidence != null ? `${safePredictionAccuracy.confidence}/100` : "—"} • Evidence {safePredictionAccuracy.evidenceWindow ?? "—"}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
                      {safePredictionAccuracy.headline || (safePredictionAccuracy.isPartial ? "Prediction accuracy is only partially available right now." : "Prediction accuracy will show up once the app closes the loop on at least one predicted session.")}
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Last prediction review</div>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>{latestPredictionReview ? `${latestPredictionReview.label} • ${latestPredictionReview.score}/100` : "Waiting for first review"}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                      {latestPredictionReview
                        ? `${fmtPredictionOutcome(latestPredictionReview.predictedCompletion)} → ${fmtActualOutcome(latestPredictionReview.actualCompletion)}`
                        : "No closed prediction cycle yet."}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
                      {latestPredictionReview?.summary || "Once you complete a recommended session, the app will grade how right its prediction was."}
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Adaptation layer</div>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>{safeAdaptation.isAvailable ? `${safeAdaptation.active ? "Active" : "Idle"} • ${safeAdaptation.confidence ?? "—"}/100` : "Adaptation state unavailable"}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                      Evidence {safeAdaptation.evidenceWindow ?? "—"} • Novelty {safeAdaptation.noveltyBudget ?? "unknown"}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
                      {safeAdaptation.summary || (safeAdaptation.isPartial ? "Adaptation state is only partially available right now." : "No bounded mutation is active yet.")}
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Last mutation</div>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>{latestMutation ? "Bounded change recorded" : "No mutation logged yet"}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                      {latestMutation ? `Confidence ${latestMutation.confidence}/100 • Evidence ${latestMutation.evidenceWindow}` : "Waiting for enough signal to justify changing secondary weights."}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
                      {latestMutation?.summary || "The loop has not yet recorded a bounded mutation event."}
                    </div>
                  </div>
                </div>

                {behaviorTraits.length ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Self-model traits</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                      {behaviorTraits.map((trait) => {
                        const tone = behaviorTraitTone(trait);
                        return (
                          <div key={trait.key} style={{ ...cardStyle, background: tone.bg, border: `1px solid ${tone.border}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                              <div style={{ fontSize: 12, opacity: 0.8 }}>{trait.label}</div>
                              <div style={{ fontSize: 12, fontWeight: 800 }}>{fmtTrend(trait.trend)}</div>
                            </div>
                            <div style={{ marginTop: 6, fontWeight: 800 }}>{trait.score}/100</div>
                            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>Confidence {trait.confidence}/100 • Evidence {trait.evidence}</div>
                            <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>{trait.summary}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}>
                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Model fit</div>
                    <div style={{ marginTop: 6, fontWeight: 800 }}>{modelFit.label}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>Score: {modelFit.score}/100</div>
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
                      {modelFit.confidenceReason}
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Prediction metrics</div>
                    <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                      <li style={{ marginTop: 4 }}>Completion {safePredictionAccuracy.metrics.completionAccuracy != null ? `${safePredictionAccuracy.metrics.completionAccuracy}/100` : "—"}</li>
                      <li style={{ marginTop: 4 }}>Focus {safePredictionAccuracy.metrics.focusCalibration != null ? `${safePredictionAccuracy.metrics.focusCalibration}/100` : "—"}</li>
                      <li style={{ marginTop: 4 }}>Delay {safePredictionAccuracy.metrics.delayAccuracy != null ? `${safePredictionAccuracy.metrics.delayAccuracy}/100` : "—"}</li>
                    </ul>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Patterns noticed</div>
                    <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                      {modelFit.patternNotes.slice(0, 3).map((item) => (
                        <li key={item} style={{ marginTop: 4 }}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Drift watch</div>
                    <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                      {modelFit.driftFlags.slice(0, 3).map((item) => (
                        <li key={item} style={{ marginTop: 4 }}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 10 }}>
                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Audit trail</div>
                    <ul style={{ margin: "8px 0 0 18px", padding: 0 }}>
                      {auditTrail.slice(0, 4).map((item) => (
                        <li key={item} style={{ marginTop: 4 }}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Self-correcting note</div>
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
                      {selfCorrectionNarrative}
                    </div>
                  </div>

                  <div style={cardStyle}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Recalibration signal</div>
            {showDevHatch ? (
              <div style={{ ...cardStyle, marginTop: 12, background: "#f2f2f2" }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Developer Hatch (read-only)</div>

                <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.65 }}>
                  <div><strong>User:</strong> {userEmail || "unknown"}</div>
                  <div><strong>Split:</strong> {splitPreset || "unknown"}</div>
                  <div><strong>Days:</strong> {splitDayNames.length ? splitDayNames.join(", ") : "none configured"}</div>
                  <div><strong>Last completed day:</strong> {lastCompletedSplitDayName || "unknown"}</div>
                  <div><strong>Next:</strong> {brainSnapshot?.recommendedSession?.plannedDayName || brainSnapshot?.recommendedSession?.focus || "unknown"}</div>
                  <div><strong>Recommendation:</strong> {brainSnapshot?.recommendedSession?.title || "unknown"}</div>
                  <div><strong>Model Fit:</strong> {typeof modelFit !== "undefined" ? modelFit.label : "n/a"}</div>
                  <div><strong>Behavior fingerprint:</strong> {safeBehaviorFingerprint.confidence != null ? `${safeBehaviorFingerprint.confidence}/100` : "n/a"}</div>
                  <div><strong>Prediction:</strong> {safePredictionScaffold.predictedCompletion ? `${fmtPredictionOutcome(safePredictionScaffold.predictedCompletion)} • focus ${safePredictionScaffold.predictedFocusMatchProbability ?? "—"}%` : "n/a"}</div>
                  <div><strong>Prediction accuracy:</strong> {safePredictionAccuracy.score != null ? `${safePredictionAccuracy.score}/100` : "n/a"}</div>
                  <div><strong>Last prediction review:</strong> {latestPredictionReview ? `${latestPredictionReview.label} • ${latestPredictionReview.score}/100` : "n/a"}</div>
                  <div><strong>Adaptation:</strong> {safeAdaptation.isAvailable ? `${safeAdaptation.active ? "active" : "idle"} • ${safeAdaptation.confidence ?? "—"}/100` : "n/a"}</div>
                  <div><strong>Recalibration:</strong> {recalibrationSignal.state} • {recalibrationSignal.score ?? "—"}/100</div>
                  <div><strong>Recalibration confidence:</strong> {recalibrationSignal.confidence ?? "—"}/100</div>
                  <div><strong>Recalibration scope:</strong> {recalibrationSignal.recommendedScope.length ? recalibrationSignal.recommendedScope.join(", ") : "none"}</div>
                  <div><strong>Freeze recommended:</strong> {recalibrationSignal.freezeRecommended ? "yes" : "no"}</div>
                  <div><strong>Probation:</strong> {recalibrationSignal.probationCyclesRemaining ? `${recalibrationSignal.probationCyclesRemaining} cycle(s)` : "none"}</div>
                  <div><strong>Action:</strong> {latestRecalibrationAction ? `${latestRecalibrationAction.status} • ${fmtRecalibrationActionType(latestRecalibrationAction.type)}` : "none"}</div>
                  <div><strong>Action freeze:</strong> {latestRecalibrationAction?.freezeAdaptation ? "on" : "off"}</div>
                  <div><strong>Action probation:</strong> {latestRecalibrationAction?.probationCyclesRemaining ? `${latestRecalibrationAction.probationCyclesRemaining} cycle(s)` : "none"}</div>
                  <div><strong>Sandbox:</strong> {props.recalibrationSandboxEnabled ? "on" : "off"}</div>
                  <div><strong>Sandbox writes:</strong> {props.recalibrationSandboxEnabled ? "isolated" : "production"}</div>
                  <div><strong>Sandbox scenario:</strong> {sandboxScenarioLabel ?? "none"}</div>
                  <div><strong>Sync:</strong> {syncStatus}{lastSyncedAt ? ` • last ${lastSyncedAt}` : ""}</div>
                  <div><strong>Constraints:</strong> {(brainSnapshot?.nextSessionPriority?.constraintsApplied || []).length}</div>
                  <div><strong>Alerts:</strong> {(brainSnapshot?.recommendedSession?.alerts || []).length}</div>
                </div>
              </div>
            ) : null}

                    <div style={{ marginTop: 6, fontWeight: 800 }}>{recalibrationSignal.state}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                      Score {recalibrationSignal.score ?? "—"} • Confidence {recalibrationSignal.confidence ?? "—"}/100
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
                      {recalibrationSignal.note}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                      {recalibrationSignal.triggerSummary}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                      Scope: {recalibrationSignal.recommendedScope.length ? recalibrationSignal.recommendedScope.join(", ") : "none"} • Freeze: {recalibrationSignal.freezeRecommended ? "recommended" : "not recommended"}
                      {recalibrationSignal.probationCyclesRemaining ? ` • Probation ${recalibrationSignal.probationCyclesRemaining}` : ""}
                    </div>
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>Current recalibration action</div>
                      <div style={{ marginTop: 6, fontWeight: 800 }}>
                        {activeRecalibrationAction
                          ? fmtRecalibrationActionType(activeRecalibrationAction.type)
                          : latestRecalibrationAction
                            ? `Last action • ${fmtRecalibrationActionType(latestRecalibrationAction.type)}`
                            : "No active recalibration action"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                        {activeRecalibrationAction
                          ? `Status active • Freeze ${activeRecalibrationAction.freezeAdaptation ? "on" : "off"} • Probation ${activeRecalibrationAction.probationCyclesRemaining}`
                          : latestRecalibrationAction
                            ? `Status ${latestRecalibrationAction.status} • Freeze ${latestRecalibrationAction.freezeAdaptation ? "on" : "off"} • Probation ${latestRecalibrationAction.probationCyclesRemaining || 0}`
                            : "The conservative executor is idle until recalibration is actually warranted."}
                      </div>
                      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
                        {describeRecalibrationAction(latestRecalibrationAction)}
                      </div>
                    </div>
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>Sandbox validation lane</div>
                      <div style={{ marginTop: 6, fontWeight: 800 }}>
                        {props.recalibrationSandboxEnabled ? "Recalibration sandbox active" : "Recalibration sandbox off"}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.45 }}>
                        {props.recalibrationSandboxEnabled
                          ? "Recalibration reads and writes are isolated from production state while sandbox mode is on."
                          : "Production recalibration state is live. Turn sandbox on before running validation scenarios."}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                        Scenario: {sandboxScenarioLabel ?? "baseline"}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                        <button onClick={() => props.onToggleRecalibrationSandbox(!props.recalibrationSandboxEnabled)}>
                          {props.recalibrationSandboxEnabled ? "Turn sandbox off" : "Turn sandbox on"}
                        </button>
                        {props.recalibrationSandboxEnabled ? (
                          <>
                            <button onClick={() => props.onApplyRecalibrationSandboxScenario("prediction_drift")}>Prediction drift</button>
                            <button onClick={() => props.onApplyRecalibrationSandboxScenario("exercise_identity_drift")}>Exercise identity drift</button>
                            <button onClick={() => props.onApplyRecalibrationSandboxScenario("adaptation_failure")}>Adaptation failure</button>
                            <button onClick={() => props.onApplyRecalibrationSandboxScenario("false_alarm")}>False alarm</button>
                            <button onClick={() => props.onResetRecalibrationSandbox()}>Reset sandbox</button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {brainSnapshot.recommendedSession.exercises.map((ex) => (
                <div key={`${ex.slot}-${ex.name}`} style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.65)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{ex.slot}</div>
                      <div style={{ fontWeight: 800 }}>{ex.name}</div>
                      {ex.eventTag ? (
                        <div
                          style={{
                            display: "inline-block",
                            marginTop: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: eventTagTone(ex.eventTag).bg,
                            border: `1px solid ${eventTagTone(ex.eventTag).border}`
                          }}
                        >
                          {ex.eventTag}
                        </div>
                      ) : null}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800 }}>{ex.sets} × {ex.reps}</div>
                      <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>Suggested load</div>
                      <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.9 }}>{ex.load}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{ex.note}</div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{ex.loadBasis}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <h4 style={{ marginTop: 18, marginBottom: 8 }}>Training Timeline — Phase 2</h4>
      <div style={{ ...cardStyle, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr style={{ background: "#f3f3f3" }}>
              {[
                "Week",
                "Sessions",
                "Sets",
                "Tonnage",
                "Top Lift",
                "Dominant Focus"
              ].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: 10, fontSize: 12, opacity: 0.8, borderBottom: "1px solid #ddd" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timelineWeeks.map((week) => (
              <tr key={week.start}>
                <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>
                  <div style={{ fontWeight: 700 }}>{week.label}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{week.start} → {week.end}</div>
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 700 }}>{week.sessions}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 700 }}>{week.sets}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 700 }}>{week.tonnage.toLocaleString()}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{week.topLift}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{week.dominantFocus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        <LineChart title="Training Volume (Tonnage) — last 28 days" points={tonnageSeries} />
        <LineChart title="Total Sets — last 28 days" points={setsSeries} />
      </div>

      <h4 style={{ marginTop: 18, marginBottom: 8 }}>Strength Trend (Best e1RM per day)</h4>
      <div style={{ display: "grid", gap: 12 }}>
        <LineChart title="Bench" points={benchSeries} />
        <LineChart title="Squat" points={squatSeries} />
        <LineChart title="Deadlift / RDL" points={dlSeries} />
      </div>

      <h4 style={{ marginTop: 18, marginBottom: 8 }}>Quick Log Trends (last 28 days)</h4>
      <div style={{ display: "grid", gap: 12 }}>
        <LineChart title="Bodyweight (lbs)" points={weightSeries} />
        <LineChart title="Waist (in)" points={waistSeries} />
        <LineChart title="Sleep (hours)" points={sleepSeries} />
        <LineChart title="Calories" points={calSeries} />
        <LineChart title="Protein (g)" points={proteinSeries} />
        <LineChart title="Zone 2 (minutes)" points={z2Series} />
      </div>

      {weeklyCoach && (
        <div style={{ ...cardStyle, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800 }}>Weekly Coach Summary</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>{weeklyCoach.thisWeekStart} → {weeklyCoach.thisWeekEnd}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Sessions</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{weeklyCoach.sessionsThis}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Prev 7d: {weeklyCoach.sessionsPrev}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Tonnage</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{weeklyCoach.tonnageThis.toLocaleString()}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Prev 7d: {weeklyCoach.tonnagePrev.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Work Sets</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{weeklyCoach.setsThis.toLocaleString()}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Prev 7d: {weeklyCoach.setsPrev.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Best e1RM (7d)</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>Bench: {weeklyCoach.benchBest ? Math.round(weeklyCoach.benchBest) : "—"}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Squat: {weeklyCoach.squatBest ? Math.round(weeklyCoach.squatBest) : "—"}</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>DL: {weeklyCoach.dlBest ? Math.round(weeklyCoach.dlBest) : "—"}</div>
            </div>
          </div>

          <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.35 }}><b>Coach says:</b> {weeklyCoach.coachLine}</div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontWeight: 800 }}>AI Coach Add-on</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button disabled={aiCoachBusy} onClick={() => refreshAiCoach(false)}>{aiCoachBusy ? "Thinking…" : "Refresh AI Coach"}</button>
                <button
                  type="button"
                  onClick={() => setShowDevHatch((prev) => !prev)}
                  style={{
                    border: "1px dashed #999",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontWeight: 600,
                    background: "#f7f7f7",
                    color: "#333",
                    cursor: "pointer"
                  }}
                >
                  {showDevHatch ? "Hide Hatch" : "Dev Hatch"}
                </button>
                <button disabled={aiCoachBusy} onClick={() => refreshAiCoach(true)} style={{ opacity: 0.85 }}>Force Refresh</button>
              </div>
            </div>
            {aiCoachErr && <div style={{ marginTop: 8, fontSize: 12, color: "#b00020" }}>{aiCoachErr}</div>}
            {aiCoach ? (
              <div style={{ marginTop: 8, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Last run: {new Date(aiCoach.ts).toLocaleString()} • Model: {aiCoach.model}</div>
                {aiCoach.text}
              </div>
            ) : (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>No AI coach cached for this week yet.</div>
            )}
          </div>
        </div>
      )}

      <h4 style={{ marginTop: 18, marginBottom: 8 }}>Milestones</h4>
      <div style={{ ...cardStyle, padding: milestones.length ? 0 : 12, overflowX: milestones.length ? "auto" : undefined }}>
        {milestones.length ? (
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr style={{ background: "#f3f3f3" }}>
                {["Date", "Type", "Label"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: 10, fontSize: 12, opacity: 0.8, borderBottom: "1px solid #ddd" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 700 }}>{m.achieved_on}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{m.milestone_type}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{m.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.75 }}>No milestones logged yet.</div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 18 }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 800 }}>Quick Log Pad</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Fast capture still lives here so the rest of the app stays fed.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
            <label style={{ fontSize: 12 }}>Weight<input value={props.weight} onChange={(e) => props.setWeight(e.target.value)} style={{ width: "100%" }} /></label>
            <label style={{ fontSize: 12 }}>Waist<input value={props.waist} onChange={(e) => props.setWaist(e.target.value)} style={{ width: "100%" }} /></label>
            <label style={{ fontSize: 12 }}>Sleep<input value={props.sleepHours} onChange={(e) => props.setSleepHours(e.target.value)} style={{ width: "100%" }} /></label>
            <label style={{ fontSize: 12 }}>Calories<input value={props.calories} onChange={(e) => props.setCalories(e.target.value)} style={{ width: "100%" }} /></label>
            <label style={{ fontSize: 12 }}>Protein<input value={props.protein} onChange={(e) => props.setProtein(e.target.value)} style={{ width: "100%" }} /></label>
            <label style={{ fontSize: 12 }}>Zone 2<input value={props.z2Minutes} onChange={(e) => props.setZ2Minutes(e.target.value)} style={{ width: "100%" }} /></label>
          </div>
          <label style={{ display: "block", fontSize: 12, marginTop: 8 }}>Notes<textarea value={props.notes} onChange={(e) => props.setNotes(e.target.value)} rows={3} style={{ width: "100%", resize: "vertical" }} /></label>
          <button onClick={props.saveQuickLog} style={{ marginTop: 10 }}>Save Quick Log</button>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 800 }}>Rest Timer</div>
          <div style={{ fontSize: 34, fontWeight: 800, marginTop: 8 }}>{fmtClock(secs)}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button onClick={() => setTimerOn((prev) => !prev)}>{timerOn ? "Pause" : "Start"}</button>
            <button onClick={() => { setTimerOn(false); setSecs(0); }}>Reset</button>
            <button onClick={() => setSecs((prev) => prev + 60)}>+1 min</button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>Handy little workhorse, not glamorous, but neither is a torque wrench and you still want one.</div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 800 }}>Band Equivalency</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Keep the resistance map honest so analytics and progression aren’t drunk.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
            {["1", "2", "3", "4", "5"].map((band) => (
              <label key={band} style={{ fontSize: 12 }}>
                Band {band}
                <input
                  value={String(bandEquivMap[band] ?? "")}
                  onChange={(e) => {
                    const next = { ...bandEquivMap, [band]: Number(e.target.value || 0) };
                    setBandEquivMap(next);
                  }}
                  style={{ width: "100%" }}
                />
              </label>
            ))}
            <label style={{ fontSize: 12 }}>
              Combo factor
              <input
                value={String(bandComboFactor)}
                onChange={(e) => setBandComboFactor(Number(e.target.value || 0))}
                style={{ width: "100%" }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button onClick={loadBandEquiv}>Load</button>
            <button onClick={() => saveBandEquiv(bandEquivMap, bandComboFactor)}>Save</button>
          </div>
        </div>
      </div>
    </>
  );
}









































