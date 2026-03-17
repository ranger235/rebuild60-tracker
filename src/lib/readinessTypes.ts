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

export type ReadinessMetrics = {
  adherence7d: number | null;
  adherence28d: number | null;
  sessionDensity7d: number | null;
  bodyweightTrend14d: TrendDirection;
  scorecardTrend: TrendDirection;
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

export type ReadinessInput = {
  workouts: WorkoutHistoryItem[];
  bodyweight: BodyweightItem[];
  scorecards: ScorecardItem[];
};
