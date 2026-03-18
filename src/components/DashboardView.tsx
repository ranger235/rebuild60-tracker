import { useMemo, type CSSProperties, type RefObject } from "react";
import LineChart from "./LineChart";
import type { BrainSnapshot, BrainFocus } from "../lib/brainEngine";
import { buildReadinessContext } from "../lib/readiness";
import { formatPatternValue, formatPrescriptionTrust, formatReadinessLabel } from "../lib/readinessFormat";
import type { ReadinessInput } from "../lib/readinessTypes";
import type { PreferenceHistoryEntry } from "../lib/preferenceLearning";

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
  startSessionFromRecommendation: () => void;
  preferenceHistory: PreferenceHistoryEntry[];

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
    startSessionFromRecommendation,
    preferenceHistory,
    timerOn,
    setTimerOn,
    secs,
    setSecs
  } = props;

  const tonnage28 = Math.round(sumPoints(tonnageSeries));
  const sets28 = Math.round(sumPoints(setsSeries));
  const trainingDays28 = activeDays(setsSeries);
  const avgTonnagePerTrainingDay = trainingDays28 > 0 ? Math.round(tonnage28 / trainingDays28) : 0;
  const avgSetsPerTrainingDay = trainingDays28 > 0 ? Math.round((sets28 / trainingDays28) * 10) / 10 : 0;

  const keyLiftCards = [
    { label: "Bench Press", points: benchSeries },
    { label: "Squat", points: squatSeries },
    { label: "Deadlift / RDL", points: dlSeries }
  ];

  const readinessInput = useMemo(
    () => mapSeriesToReadinessInput(setsSeries, weightSeries, preferenceHistory),
    [setsSeries, weightSeries, preferenceHistory]
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

          <div style={{ ...cardStyle, marginTop: 10, background: focusTone(brainSnapshot.recommendedSession.focus) }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Recommended Next Session</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{brainSnapshot.recommendedSession.title}</div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{brainSnapshot.recommendedSession.bias}</div>
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

          <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.35 }}><b>Coach readout:</b> {weeklyCoach.coachLine}</div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontWeight: 800 }}>AI Coach Readout</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button disabled={aiCoachBusy} onClick={() => refreshAiCoach(false)}>{aiCoachBusy ? "Thinking…" : "Refresh AI Coach"}</button>
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
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>No AI coach readout cached for this week yet.</div>
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


















