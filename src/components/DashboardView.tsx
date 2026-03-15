import { RefObject } from "react";
import LineChart from "./LineChart";

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

export type TrainingTimelineWeek = {
  label: string;
  start: string;
  end: string;
  sessions: number;
  tonnage: number;
  sets: number;
  topLiftLabel: string;
  topLiftValue: number;
  focus: string;
};

export type BrainSignal = {
  key: string;
  label: string;
  value: string;
  status: "good" | "ok" | "watch";
  detail: string;
};

export type BrainArchitecture = {
  readiness: number;
  momentum: number;
  recovery: number;
  compliance: number;
  summary: string;
  nextFocus: string;
  signals: BrainSignal[];
};

export type AiCoachResult = {
  text: string;
  ts: number;
  model?: string;
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
  trainingTimeline: TrainingTimelineWeek[];
  brainArchitecture: BrainArchitecture | null;

  refreshAiCoach: (force?: boolean) => void | Promise<void>;
  aiCoachBusy: boolean;
  aiCoachErr: string;
  aiCoach: AiCoachResult | null;
  milestones: Array<{
    id: string;
    milestone_type: string;
    label: string;
    achieved_on: string;
  }>;

  timerOn: boolean;
  setTimerOn: (updater: (prev: boolean) => boolean) => void;
  secs: number;
  setSecs: (v: number) => void;
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 12,
  padding: 12,
  background: "#fafafa",
};

const softCardStyle: React.CSSProperties = {
  ...cardStyle,
  background: "#fbfbfb",
};

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
    trainingTimeline,
    brainArchitecture,
    refreshAiCoach,
    aiCoachBusy,
    aiCoachErr,
    aiCoach,
    milestones,
  } = props;

  const sumPoints = (points: Point[]) => points.reduce((acc, p) => acc + (Number(p.y) || 0), 0);
  const activeDays = (points: Point[]) => points.filter((p) => Number(p.y) > 0).length;

  const tonnage28 = Math.round(sumPoints(tonnageSeries));
  const sets28 = Math.round(sumPoints(setsSeries));
  const trainingDays28 = activeDays(setsSeries);
  const avgTonnagePerTrainingDay = trainingDays28 > 0 ? Math.round(tonnage28 / trainingDays28) : 0;
  const avgSetsPerTrainingDay = trainingDays28 > 0 ? Math.round((sets28 / trainingDays28) * 10) / 10 : 0;

  function trendText(points: Point[]) {
    if (!points || points.length < 2) return "Not enough data";
    const last = Number(points[points.length - 1]?.y ?? 0);
    const prev = Number(points[points.length - 2]?.y ?? 0);
    if (!Number.isFinite(last) || !Number.isFinite(prev)) return "Not enough data";
    if (last > prev) return "Up";
    if (last < prev) return "Down";
    return "Flat";
  }

  function latestPoint(points: Point[]) {
    return points && points.length > 0 ? Number(points[points.length - 1].y) : null;
  }

  function bestPoint(points: Point[]) {
    if (!points || points.length === 0) return null;
    return Math.max(...points.map((p) => Number(p.y) || 0));
  }

  const keyLiftCards = [
    { label: "Bench Press", points: benchSeries },
    { label: "Squat", points: squatSeries },
    { label: "Deadlift / RDL", points: dlSeries },
  ];

  const strengthMapBuckets = [
    { name: "Horizontal Push", score: Math.round((benchSeries.slice(-5).reduce((a, b) => a + (b?.y || 0), 0) || 0) / 5) },
    { name: "Knee Dominant", score: Math.round((squatSeries.slice(-5).reduce((a, b) => a + (b?.y || 0), 0) || 0) / 5) },
    { name: "Hinge", score: Math.round((dlSeries.slice(-5).reduce((a, b) => a + (b?.y || 0), 0) || 0) / 5) },
    { name: "Vertical Push", score: Math.round(((benchSeries.slice(-3).reduce((a, b) => a + (b?.y || 0), 0) || 0) / 3) * 0.6) },
    { name: "Vertical Pull", score: Math.round(((benchSeries.slice(-3).reduce((a, b) => a + (b?.y || 0), 0) || 0) / 3) * 0.5) },
    { name: "Horizontal Pull", score: Math.round(((dlSeries.slice(-3).reduce((a, b) => a + (b?.y || 0), 0) || 0) / 3) * 0.4) },
    { name: "Arms", score: Math.round(((benchSeries.slice(-3).reduce((a, b) => a + (b?.y || 0), 0) || 0) / 3) * 0.3) },
    { name: "Core", score: Math.round(((dlSeries.slice(-3).reduce((a, b) => a + (b?.y || 0), 0) || 0) / 3) * 0.2) },
  ];

  const signalTone = (status: "good" | "ok" | "watch") => {
    if (status === "good") return "#eef8ee";
    if (status === "ok") return "#fff8e8";
    return "#fff0f0";
  };

  const metricTone = (score: number) => (score >= 75 ? "#eef8ee" : score >= 60 ? "#fff8e8" : "#fff0f0");

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Dashboard</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={refreshDashboard} disabled={dashBusy}>
            {dashBusy ? "Refreshing…" : "Refresh"}
          </button>
          <button onClick={exportBackup} disabled={backupBusy}>
            {backupBusy ? "Exporting…" : "Export Backup"}
          </button>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <span>Import Backup</span>
            <input ref={importFileRef} type="file" accept=".json,application/json" style={{ display: "none" }} />
          </label>
        </div>
      </div>

      <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
        Everything here is built from your <b>local</b> workout data and quick logs, so the dashboard still tells the truth when you are offline.
      </div>

      <div style={{ ...softCardStyle, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <div style={{ fontWeight: 800 }}>Band Equivalent Weights</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Saved locally in Dexie and synced with settings</div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
          These are your default equivalent lbs for band levels <b>1–5</b>. Combined bands use the combo factor below.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(60px, 1fr))", gap: 8, marginTop: 10 }}>
          {(["1", "2", "3", "4", "5"] as const).map((k) => (
            <div key={k} style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>L{k}</div>
              <input
                value={String(bandEquivMap[k] ?? "")}
                onChange={(e) => {
                  const raw = e.target.value;
                  const num = raw.trim() === "" ? 0 : Number(raw);
                  const next = { ...bandEquivMap, [k]: Number.isFinite(num) ? num : bandEquivMap[k] };
                  setBandEquivMap(next);
                }}
              />
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 180px)", gap: 8, marginTop: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>Combined factor</div>
            <input
              value={String(bandComboFactor ?? "")}
              onChange={(e) => {
                const raw = e.target.value.trim();
                const num = raw === "" ? NaN : Number(raw);
                if (Number.isFinite(num)) setBandComboFactor(num);
              }}
            />
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
          Example: a 1 + 2 combo uses <code>(Band 1 + Band 2) × combo factor</code>.
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={() => saveBandEquiv(bandEquivMap, bandComboFactor)}>Save</button>
          <button
            onClick={() => {
              const defaults = { "1": 10, "2": 20, "3": 30, "4": 40, "5": 50 };
              const factor = 1.1;
              setBandEquivMap(defaults);
              setBandComboFactor(factor);
              saveBandEquiv(defaults, factor);
            }}
            title="Reset to defaults"
          >
            Reset
          </button>
          <button onClick={loadBandEquiv} title="Reload saved values">
            Reload
          </button>
        </div>
      </div>

      <h4 style={{ marginTop: 18, marginBottom: 8 }}>Analytics Layer — Phase 1</h4>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>28-Day Tonnage</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{tonnage28.toLocaleString()}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Avg / training day: {avgTonnagePerTrainingDay.toLocaleString()}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>28-Day Work Sets</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{sets28.toLocaleString()}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Avg / training day: {avgSetsPerTrainingDay}</div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Training Days (28d)</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{trainingDays28}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Days with logged sets</div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>This Week Snapshot</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{weeklyCoach ? weeklyCoach.sessionsThis : "—"} sessions</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
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
            <div key={card.label} style={softCardStyle}>
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
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                Built from canonical exercise grouping and band-aware load logic already in the tracker.
              </div>
            </div>
          );
        })}
      </div>

      <h4 style={{ marginTop: 18, marginBottom: 8 }}>Brain Snapshot — Phase 2</h4>
      {brainArchitecture ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            {[
              { label: "Readiness", value: brainArchitecture.readiness },
              { label: "Momentum", value: brainArchitecture.momentum },
              { label: "Recovery", value: brainArchitecture.recovery },
              { label: "Compliance", value: brainArchitecture.compliance },
            ].map((metric) => (
              <div key={metric.label} style={{ ...cardStyle, background: metricTone(metric.value) }}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{metric.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{metric.value}</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                  {metric.value >= 75 ? "Green light" : metric.value >= 60 ? "Usable" : "Needs attention"}
                </div>
              </div>
            ))}
          </div>

          <div style={{ ...softCardStyle, display: "grid", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>System Take</div>
              <div style={{ marginTop: 4, lineHeight: 1.4 }}>{brainArchitecture.summary}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Next Focus</div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{brainArchitecture.nextFocus}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {brainArchitecture.signals.map((signal) => (
              <div key={signal.key} style={{ ...cardStyle, background: signalTone(signal.status) }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <div style={{ fontWeight: 800 }}>{signal.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{signal.value}</div>
                </div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>{signal.detail}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.75 }}>No brain signals yet. Refresh the dashboard after you have some recent logs.</div>
      )}

      <h4 style={{ marginTop: 18, marginBottom: 8 }}>Training Timeline — Phase 2</h4>
      {trainingTimeline.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {trainingTimeline.map((week) => (
            <div
              key={`${week.start}-${week.end}`}
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 12,
                background: week.sessions > 0 ? "#fafafa" : "#f6f6f6",
                display: "grid",
                gridTemplateColumns: "minmax(120px, 160px) repeat(auto-fit, minmax(110px, 1fr))",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 800 }}>{week.label}</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{week.start} → {week.end}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Sessions</div>
                <div style={{ fontWeight: 800 }}>{week.sessions}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Sets</div>
                <div style={{ fontWeight: 800 }}>{week.sets.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Tonnage</div>
                <div style={{ fontWeight: 800 }}>{week.tonnage.toLocaleString()}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Top Lift</div>
                <div style={{ fontWeight: 800 }}>
                  {week.topLiftValue > 0 ? `${week.topLiftLabel} ${Math.round(week.topLiftValue)}` : "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Dominant Focus</div>
                <div style={{ fontWeight: 800 }}>{week.focus}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, opacity: 0.75 }}>No weekly timeline yet. Refresh after a few logged sessions.</div>
      )}

      <h4 style={{ marginTop: 18, marginBottom: 8 }}>Recent Milestones</h4>
      {milestones.length === 0 ? (
        <div style={{ fontSize: 13, opacity: 0.75 }}>No milestone records yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {milestones.map((m) => (
            <div key={m.id} style={{ ...cardStyle, borderRadius: 10 }}>
              <div style={{ fontWeight: 700 }}>{m.label}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                {m.achieved_on} · {m.milestone_type}
              </div>
            </div>
          ))}
        </div>
      )}

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
        <div style={{ ...cardStyle, marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800 }}>Weekly Coach Summary</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              {weeklyCoach.thisWeekStart} → {weeklyCoach.thisWeekEnd}
            </div>
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

          <div style={{ marginTop: 10, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
            <b>Coach says:</b> {weeklyCoach.coachLine}
          </div>

          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.15)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontWeight: 800 }}>AI Coach Add-on (GPT-5.2)</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button disabled={aiCoachBusy} onClick={() => void refreshAiCoach(false)}>
                  {aiCoachBusy ? "Thinking…" : "Refresh AI Coach"}
                </button>
                <button disabled={aiCoachBusy} onClick={() => void refreshAiCoach(true)} style={{ opacity: 0.85 }}>
                  Force Refresh
                </button>
              </div>
            </div>

            {aiCoachErr && <div style={{ marginTop: 8, fontSize: 12, color: "#b00020" }}>{aiCoachErr}</div>}

            {aiCoach ? (
              <div style={{ marginTop: 8, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                  Last run: {new Date(aiCoach.ts).toLocaleString()} • Model: {aiCoach.model}
                </div>
                {aiCoach.text}
              </div>
            ) : (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                No AI coach yet for this week. Hit “Refresh AI Coach” to generate one.
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <LineChart title="Training Volume (Tonnage) — last 28 days" points={tonnageSeries} />
        <LineChart title="Total Sets — last 28 days" points={setsSeries} />
      </div>

      <h4 style={{ marginTop: 18, marginBottom: 8 }}>Strength Map (28-day)</h4>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {strengthMapBuckets.map((bucket) => (
          <div key={bucket.name} style={{ ...cardStyle, borderRadius: 10 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{bucket.name}</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{bucket.score || "—"}</div>
          </div>
        ))}
      </div>

      <h4 style={{ marginTop: 18, marginBottom: 8 }}>Strength Trend (Best e1RM per day)</h4>
      <div style={{ display: "grid", gap: 12 }}>
        <LineChart title="Bench (name includes 'bench')" points={benchSeries} />
        <LineChart title="Squat (name includes 'squat')" points={squatSeries} />
        <LineChart title="Deadlift (name includes 'deadlift' or 'dl')" points={dlSeries} />
      </div>

      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.8, lineHeight: 1.4 }}>
        <b>Note:</b> These strength charts match by exercise name keywords. If you use names like “Flat BB Press”, it will not show in “bench” until aliases are added. Good old rule: name things cleanly and life gets easier.
      </div>
    </>
  );
}










