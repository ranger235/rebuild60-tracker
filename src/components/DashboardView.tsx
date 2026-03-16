import type { CSSProperties, RefObject } from "react";
import LineChart from "./LineChart";
import type { BrainSnapshot, BrainFocus } from "../lib/brainEngine";

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
    weight,
    setWeight,
    waist,
    setWaist,
    sleepHours,
    setSleepHours,
    calories,
    setCalories,
    protein,
    setProtein,
    z2Minutes,
    setZ2Minutes,
    notes,
    setNotes,
    saveQuickLog,
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
              <div style={{ fontSize: 16, fontWeight: 800 }}>{brainSnapshot.recommendedSession.bias}</div>
            </div>

            <div style={{ marginTop: 8, lineHeight: 1.4 }}>{brainSnapshot.recommendedSession.rationale}</div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>{brainSnapshot.recommendedSession.volumeNote}</div>

            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {brainSnapshot.recommendedSession.exercises.map((ex) => (
                <div key={`${ex.slot}-${ex.name}`} style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, padding: 10, background: "rgba(255,255,255,0.65)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{ex.slot}</div>
                      <div style={{ fontWeight: 800 }}>{ex.name}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 800 }}>{ex.sets} × {ex.reps}</div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>{ex.load}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{ex.note}</div>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 18 }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 800 }}>Quick Log Today</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
            <input value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Weight (lbs)" />
            <input value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="Waist (in)" />
            <input value={sleepHours} onChange={(e) => setSleepHours(e.target.value)} placeholder="Sleep (hours)" />
            <input value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="Protein (g)" />
            <input value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="Calories" />
            <input value={z2Minutes} onChange={(e) => setZ2Minutes(e.target.value)} placeholder="Zone 2 (min)" />
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={3} style={{ width: "100%", marginTop: 8 }} />
          <button onClick={saveQuickLog} style={{ marginTop: 8 }}>Save Quick Log</button>
        </div>

        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
            <div style={{ fontWeight: 800 }}>Band Equivalent Weights</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Local-first defaults</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(50px, 1fr))", gap: 8, marginTop: 10 }}>
            {(["1", "2", "3", "4", "5"] as const).map((k) => (
              <div key={k} style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>L{k}</div>
                <input
                  value={String(bandEquivMap[k] ?? "")}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const num = raw === "" ? 0 : Number(raw);
                    setBandEquivMap({ ...bandEquivMap, [k]: Number.isFinite(num) ? num : bandEquivMap[k] });
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Combined factor</div>
            <input
              value={String(bandComboFactor ?? "")}
              onChange={(e) => {
                const raw = e.target.value.trim();
                const num = raw === "" ? NaN : Number(raw);
                if (Number.isFinite(num)) setBandComboFactor(num);
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={() => saveBandEquiv(bandEquivMap, bandComboFactor)}>Save</button>
            <button onClick={loadBandEquiv}>Reload</button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 800 }}>Rest Timer</div>
          <div style={{ fontSize: 32, fontWeight: 800, marginTop: 8 }}>{fmtClock(secs)}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button onClick={() => setTimerOn((prev) => !prev)}>{timerOn ? "Pause" : "Start"}</button>
            <button onClick={() => { setSecs(180); setTimerOn(false); }}>3:00</button>
            <button onClick={() => { setSecs(300); setTimerOn(false); }}>5:00</button>
            <button onClick={() => { setSecs(0); setTimerOn(false); }}>Reset</button>
          </div>
        </div>
      </div>

      <h4 style={{ marginTop: 18, marginBottom: 8 }}>Recent Milestones</h4>
      {milestones.length === 0 ? (
        <div style={{ fontSize: 13, opacity: 0.75 }}>No milestone records yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {milestones.map((m) => (
            <div key={m.id} style={cardStyle}>
              <div style={{ fontWeight: 700 }}>{m.label}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{m.achieved_on} · {m.milestone_type}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}











