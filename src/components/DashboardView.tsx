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
  adherence: number;
  big3: {
    bench: number;
    squat: number;
    deadlift: number;
  };
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

  refreshAiCoach: () => void;
  aiCoachBusy: boolean;
  aiCoachErr: string;
  aiCoach: AiCoachResult | null;

  timerOn: boolean;
  setTimerOn: (updater: (prev: boolean) => boolean) => void;
  secs: number;
  setSecs: (v: number) => void;
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
    timerOn,
    setTimerOn,
    secs,
    setSecs,
  } = props;

  return (
    <>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <h3 style={{ margin: 0 }}>Dashboard</h3>
            <button onClick={refreshDashboard} disabled={dashBusy}>
              {dashBusy ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
            Everything here is built from your <b>local</b> workout data (sessions/exercises/sets), so it works offline.
            Delete your test sessions and refresh to clean the charts.
          </div>

          {/* Band equivalent lbs override (used for band set e1RM/tonnage approximations when band_est_lbs is blank) */}
          <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fbfbfb", marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <div style={{ fontWeight: 800 }}>Band Equivalent Weights</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Saved locally (Dexie) per user and synced with your settings</div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
              These are your default “equivalent lbs” for band levels <b>1–5</b>. Used when a band set has no explicit override.
              Combined bands use the <b>combo factor</b> below.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(60px, 1fr))", gap: 8, marginTop: 10 }}>
              {(["1","2","3","4","5"] as const).map((k) => (
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

            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
              These are your default “equivalent lbs” for band levels <b>1–5</b>. Used only when a band set has no explicit “Est lbs”.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(60px, 1fr))", gap: 8, marginTop: 10 }}>
              {(["1","2","3","4","5"] as const).map((k) => (
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

            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button onClick={() => saveBandEquiv(bandEquivMap)}>Save</button>
              <button
                onClick={() =>
                  saveBandEquiv({ "1": 10, "2": 20, "3": 30, "4": 40, "5": 50 })
                }
                title="Reset to defaults"
              >
                Reset
              </button>
              <button onClick={loadBandEquiv} title="Reload saved values">
                Reload
              </button>
            </div>
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
            <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, background: "#fafafa", marginTop: 12 }}>
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
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                    Bench: {weeklyCoach.benchBest ? Math.round(weeklyCoach.benchBest) : "—"}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Squat: {weeklyCoach.squatBest ? Math.round(weeklyCoach.squatBest) : "—"}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    DL: {weeklyCoach.dlBest ? Math.round(weeklyCoach.dlBest) : "—"}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 10, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
                <b>Coach says:</b>{" "}
                {weeklyCoach.coachLine}
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.15)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ fontWeight: 800 }}>AI Coach Add-on (GPT-5.2)</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button disabled={aiCoachBusy} onClick={() => refreshAiCoach(false)}>
                      {aiCoachBusy ? "Thinking…" : "Refresh AI Coach"}
                    </button>
                    <button disabled={aiCoachBusy} onClick={() => refreshAiCoach(true)} style={{ opacity: 0.85 }}>
                      Force Refresh
                    </button>
                  </div>
                </div>

                {aiCoachErr && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#b00020" }}>{aiCoachErr}</div>
                )}

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

          <h4 style={{ marginTop: 18, marginBottom: 8 }}>Strength Trend (Best e1RM per day)</h4>
          <div style={{ display: "grid", gap: 12 }}>
            <LineChart title="Bench (name includes 'bench')" points={benchSeries} />
            <LineChart title="Squat (name includes 'squat')" points={squatSeries} />
            <LineChart title="Deadlift (name includes 'deadlift' or 'dl')" points={dlSeries} />
          </div>

          <div style={{ marginTop: 14, fontSize: 12, opacity: 0.8, lineHeight: 1.4 }}>
            <b>Note:</b> These strength charts match by exercise name keywords. If you use names like “Flat BB Press”,
            it won’t show in “bench” until we add that alias. Tell me your exact lift names and I’ll make the matcher
            smarter (without making it slow).
          </div>
        
    </>
  );
}


