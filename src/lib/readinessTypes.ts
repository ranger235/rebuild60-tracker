export type ReadinessStatus =
  | "ready_to_push"
  | "stable_normal"
  | "watch_fatigue"
  | "recovery_constrained"
  | "low_signal_confidence";

export type TrendDirection =
  | "up"
  | "down"
  | "flat"
  | "unknown";

export type ConfidenceLevel =
  | "high"
  | "medium"
  | "low";

export type DriverSignal = {
  key: string;
  label: string;
  direction: "positive" | "neutral" | "negative";
  strength: "low" | "medium" | "high";
  detail?: string;
};

export type WatchFlag = {
  key: string;
  label: string;
  severity: "info" | "watch" | "high";
};

export type PrescriptionTrustLevel = "high" | "moderate" | "low" | "unknown";

export type SessionPatternProfile = {
  executionDiscipline: "high" | "moderate" | "low";
  loadAggression: "conservative" | "neutral" | "aggressive";
  volumeDrift: "low" | "moderate" | "high";
  substitutionPattern: "stable" | "selective" | "frequent";
  anchorReliability: "strong" | "mixed" | "weak";
};

export type SessionPatternEvidence = {
  fidelityAvg: number | null;
  avgLoadDelta: number | null;
  avgVolumeDelta: number | null;
  substitutionRate: number | null;
  anchorMatchRate: number | null;
};

export type ReadinessMetrics = {
  adherence7d: number | null;
  adherence28d: number | null;
  sessionDensity7d: number | null;
  bodyweightTrend14d: TrendDirection;
  scorecardTrend: TrendDirection;
  recentFidelityAvg: number | null;
  fidelityTrend: TrendDirection;
  prescriptionTrust: PrescriptionTrustLevel;
  signalCoverage: number;
};

export type ReadinessSummary = {
  label: string;
  reasonShort: string;
};

export type ReadinessContext = {
  status: ReadinessStatus;
  confidence: ConfidenceLevel;
  summary: ReadinessSummary;
  metrics: ReadinessMetrics;
  drivers: DriverSignal[];
  watchFlags: WatchFlag[];
  patterns: SessionPatternProfile;
  patternEvidence: SessionPatternEvidence;
};

export type WorkoutHistoryItem = {
  date: string;
  completed: boolean;
};

export type BodyweightItem = {
  date: string;
  weight: number;
};

export type ScorecardItem = {
  date: string;
  score: number;
};

export type ReadinessPreferenceHistoryItem = {
  timestamp: number;
  fidelityScore?: number | null;
  sessionOutcome?: "as_prescribed" | "modified" | "partial" | "abandoned";
  loadDeltaAvg?: number | null;
  volumeDelta?: number | null;
  substitutionCount?: number | null;
  primaryOutcome?: "progressed" | "matched" | "regressed" | "unknown";
};

export type ReadinessInput = {
  workouts: WorkoutHistoryItem[];
  bodyweight: BodyweightItem[];
  scorecards: ScorecardItem[];
  preferenceHistory?: ReadinessPreferenceHistoryItem[];
};

