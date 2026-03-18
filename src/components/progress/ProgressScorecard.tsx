import type { CSSProperties, Dispatch, ReactNode, SetStateAction } from "react";
import ProgressCoachAnalysis from "./ProgressCoachAnalysis";
import ProgressVision from "./ProgressVision";

type Pose = "front" | "quarter" | "side" | "back" | "other";

type ScorecardMetricKey = "conditioning" | "muscularity" | "symmetry" | "waist_control" | "consistency";
type ScorecardMetric = { key: ScorecardMetricKey; label: string };
type Scorecard = {
  monthKey: string;
  ts: string;
  conditioning: number;
  muscularity: number;
  symmetry: number;
  waist_control: number;
  consistency: number;
  momentum: "up" | "down" | "flat";
  notes?: string;
};
type ScoreDelta = { key: ScorecardMetricKey; label: string; delta: number };

type Props = {
  scorecardOpen: boolean;
  onToggle: () => void;
  monthStats: any;
  monthReportBusy: boolean;
  monthlyHighlights: any;
  generatePhysiqueScorecard: () => void;
  scoreBusy: boolean;
  generateAiPhysiqueInsight: () => void;
  aiBusy: boolean;
  runVisionPhysiqueAnalysis: () => void;
  visionBusy: boolean;
  scoreShowHistory: boolean;
  setScoreShowHistory: Dispatch<SetStateAction<boolean>>;
  scoreHistory: Scorecard[];
  aiShowHistory: boolean;
  setAiShowHistory: Dispatch<SetStateAction<boolean>>;
  aiInsightHistory: { id: string; ts: string; text: string }[];
  visionShowHistory: boolean;
  setVisionShowHistory: Dispatch<SetStateAction<boolean>>;
  visionHistory: { id: string; ts: string; pose: Pose; scope: string; text: string }[];
  scorecard: Scorecard | null;
  setScorecard: Dispatch<SetStateAction<Scorecard | null>>;
  aiInsight: string;
  setAiInsight: Dispatch<SetStateAction<string>>;
  visionText: string;
  setVisionText: Dispatch<SetStateAction<string>>;
  aiAppendMode: boolean;
  setAiAppendMode: Dispatch<SetStateAction<boolean>>;
  visionAppendMode: boolean;
  setVisionAppendMode: Dispatch<SetStateAction<boolean>>;
  visionPose: Pose;
  setVisionPose: Dispatch<SetStateAction<Pose>>;
  visionScope: "last2" | "month";
  setVisionScope: Dispatch<SetStateAction<"last2" | "month">>;
  visionFocus: "balanced" | "lower" | "upper";
  setVisionFocus: Dispatch<SetStateAction<"balanced" | "lower" | "upper">>;
  scorecardDeltaSummary: { deltas: ScoreDelta[]; improving: number; flat: number; down: number } | null;
  previousScorecard: Scorecard | null;
  scorecardMetrics: ScorecardMetric[];
  formatDelta: (delta: number) => string;
  deltaTone: (delta: number) => CSSProperties;
  lastScoreSignals: any | null;
  showSignalDebug: boolean;
  setShowSignalDebug: Dispatch<SetStateAction<boolean>>;
};

function ProgressSection({
  title,
  subtitle,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12, padding: 12, marginBottom: 12, background: "rgba(255,255,255,0.03)" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "transparent", border: "none", color: "inherit", padding: 0, textAlign: "left", cursor: "pointer" }}
      >
        <div>
          <div style={{ fontWeight: 800 }}>{title}</div>
          {subtitle ? <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>{subtitle}</div> : null}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{open ? "−" : "+"}</div>
      </button>
      {open ? <div style={{ marginTop: 12 }}>{children}</div> : null}
    </div>
  );
}

export default function ProgressScorecard(props: Props) {
  const {
    scorecardOpen,
    onToggle,
    monthStats,
    monthReportBusy,
    monthlyHighlights,
    generatePhysiqueScorecard,
    scoreBusy,
    generateAiPhysiqueInsight,
    aiBusy,
    runVisionPhysiqueAnalysis,
    visionBusy,
    scoreShowHistory,
    setScoreShowHistory,
    scoreHistory,
    aiShowHistory,
    setAiShowHistory,
    aiInsightHistory,
    visionShowHistory,
    setVisionShowHistory,
    visionHistory,
    scorecard,
    setScorecard,
    aiInsight,
    setAiInsight,
    visionText,
    setVisionText,
    aiAppendMode,
    setAiAppendMode,
    visionAppendMode,
    setVisionAppendMode,
    visionPose,
    setVisionPose,
    visionScope,
    setVisionScope,
    visionFocus,
    setVisionFocus,
    scorecardDeltaSummary,
    previousScorecard,
    scorecardMetrics,
    formatDelta,
    deltaTone,
    lastScoreSignals,
    showSignalDebug,
    setShowSignalDebug,
  } = props;

  return (
    <ProgressSection
      title="Monthly Scorecard"
      subtitle="Structured monthly evaluation built from Quick Log, measurements, anchors, and coach interpretation."
      open={scorecardOpen}
      onToggle={onToggle}
    >
      <div style={{ marginTop: 12, padding: 12, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 12 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
            <div>
              <strong>Monthly Scorecard + Coach Analysis</strong> <span style={{ opacity: 0.8 }}>({monthStats.monthKey})</span>
              <div style={{ marginTop: 6, opacity: 0.85, fontSize: 12 }}>
                Window: {monthStats.startYMD} → {monthStats.endYMD}
                {monthReportBusy ? " • loading…" : ""}
              </div>
            </div>

            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify({ monthStats, monthlyHighlights }, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `rebuild60-monthly-report-${monthStats.monthKey}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export JSON
            </button>
          </div>

          <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
              <div>
                <strong>Advanced Analysis Tools</strong>
                <div style={{ marginTop: 4, opacity: 0.8, fontSize: 12 }}>
                  Manual analysis actions. Keep these when you want a fresh structured score, a new coach read, or a vision pass.
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={generatePhysiqueScorecard} disabled={scoreBusy} title="Generate a 1–10 monthly scorecard">
                  {scoreBusy ? "Scoring…" : "Run Scorecard"}
                </button>
                <button onClick={generateAiPhysiqueInsight} disabled={aiBusy}>
                  {aiBusy ? "Generating AI…" : "Run AI"}
                </button>
                <button onClick={runVisionPhysiqueAnalysis} disabled={visionBusy} title="Compare two photos with Vision AI">
                  {visionBusy ? "Vision…" : "Run Vision"}
                </button>
                <button onClick={() => setScoreShowHistory((s) => !s)} disabled={scoreHistory.length === 0} title="Show previous scorecards">
                  {scoreShowHistory ? "Hide scores" : "Scores"}
                </button>
                <button onClick={() => setAiShowHistory((s) => !s)} disabled={aiInsightHistory.length === 0} title="Show previous AI runs">
                  {aiShowHistory ? "Hide AI history" : "AI history"}
                </button>
                <button onClick={() => setVisionShowHistory((s) => !s)} disabled={visionHistory.length === 0} title="Show previous Vision runs">
                  {visionShowHistory ? "Hide vision" : "Vision history"}
                </button>
                <button onClick={() => setShowSignalDebug((s) => !s)} disabled={!lastScoreSignals && !monthStats?.signals} title="Show deterministic signals used for scoring">
                  {showSignalDebug ? "Hide signals" : "Signals"}
                </button>
                <button onClick={() => setScorecard(null)} disabled={!scorecard} title="Clear the current scorecard display">
                  Clear score
                </button>
                <button onClick={() => setAiInsight("")} disabled={!aiInsight} title="Clear the current AI output">
                  Clear AI
                </button>
                <button onClick={() => setVisionText("")} disabled={!visionText} title="Clear the current Vision output">
                  Clear vision
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.9 }}>
                <input type="checkbox" checked={aiAppendMode} onChange={(e) => setAiAppendMode(e.target.checked)} />
                Append AI runs
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.9 }}>
                <input type="checkbox" checked={visionAppendMode} onChange={(e) => setVisionAppendMode(e.target.checked)} />
                Append Vision runs
              </label>
              <label style={{ fontSize: 12, opacity: 0.9 }}>
                Vision pose:{" "}
                <select value={visionPose} onChange={(e) => setVisionPose(e.target.value as Pose)} style={{ padding: 6 }}>
                  <option value="front">Front</option>
                  <option value="quarter">Quarter Turn</option>
                  <option value="side">Side</option>
                  <option value="back">Back</option>
                </select>
              </label>
              <label style={{ fontSize: 12, opacity: 0.9 }}>
                Scope:{" "}
                <select value={visionScope} onChange={(e) => setVisionScope(e.target.value as "last2" | "month")} style={{ padding: 6 }}>
                  <option value="month">This month (first → last)</option>
                  <option value="last2">Last 2 anchors</option>
                </select>
              </label>
              <label style={{ fontSize: 12, opacity: 0.9 }}>
                Focus:{" "}
                <select value={visionFocus} onChange={(e) => setVisionFocus(e.target.value as "balanced" | "lower" | "upper")} style={{ padding: 6 }}>
                  <option value="balanced">Balanced</option>
                  <option value="lower">Lower Body Priority</option>
                  <option value="upper">Upper Body Priority</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        {showSignalDebug ? (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <div>
                <strong>Deterministic Signal Debug</strong>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.82 }}>
                  Inspect the exact month-scoped signals driving the scorecard. No mysticism, no smoke machine.
                </div>
              </div>
              <div style={{ fontSize: 12, opacity: 0.82 }}>
                Source: {lastScoreSignals ? "latest scorecard artifact" : "live month snapshot"}
              </div>
            </div>
            <pre
              style={{
                marginTop: 10,
                marginBottom: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                padding: 10,
                borderRadius: 10,
                background: "rgba(0,0,0,0.18)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontSize: 12,
                lineHeight: 1.45,
                maxHeight: 320,
                overflow: "auto",
              }}
            >
              {JSON.stringify(lastScoreSignals ?? monthStats?.signals ?? null, null, 2)}
            </pre>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.06)" }}>
              <strong>Quick Log</strong>
              <div style={{ marginTop: 6, opacity: 0.9 }}>Days logged: {monthStats.quicklogDays}</div>
              <div style={{ marginTop: 6, opacity: 0.9 }}>
                Weight:{" "}
                {monthStats.qWeight.first == null
                  ? "—"
                  : `${monthStats.qWeight.first.toFixed(1)} → ${monthStats.qWeight.last?.toFixed(1)} (${monthStats.qWeight.delta! >= 0 ? "+" : ""}${monthStats.qWeight.delta!.toFixed(1)})`}
              </div>
              <div style={{ marginTop: 6, opacity: 0.9 }}>
                Waist:{" "}
                {monthStats.qWaist.first == null
                  ? "—"
                  : `${monthStats.qWaist.first.toFixed(1)} → ${monthStats.qWaist.last?.toFixed(1)} (${monthStats.qWaist.delta! >= 0 ? "+" : ""}${monthStats.qWaist.delta!.toFixed(1)})`}
              </div>
              <div style={{ marginTop: 6, opacity: 0.8, fontSize: 12 }}>
                Avg sleep: {monthStats.avgSleep == null ? "—" : monthStats.avgSleep.toFixed(1)}h • Avg protein:{" "}
                {monthStats.avgProtein == null ? "—" : Math.round(monthStats.avgProtein)}g • Avg Zone2:{" "}
                {monthStats.avgZone2 == null ? "—" : Math.round(monthStats.avgZone2)}m
              </div>
            </div>

            <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.06)" }}>
              <strong>Measurements</strong>
              <div style={{ marginTop: 6, opacity: 0.9 }}>Entries: {monthStats.measDays}</div>
              <div style={{ marginTop: 6, opacity: 0.9 }}>
                Weight:{" "}
                {monthStats.mWeight.first == null
                  ? "—"
                  : `${monthStats.mWeight.first.toFixed(1)} → ${monthStats.mWeight.last?.toFixed(1)} (${monthStats.mWeight.delta! >= 0 ? "+" : ""}${monthStats.mWeight.delta!.toFixed(1)})`}
              </div>
              <div style={{ marginTop: 6, opacity: 0.9 }}>
                Waist:{" "}
                {monthStats.mWaist.first == null
                  ? "—"
                  : `${monthStats.mWaist.first.toFixed(1)} → ${monthStats.mWaist.last?.toFixed(1)} (${monthStats.mWaist.delta! >= 0 ? "+" : ""}${monthStats.mWaist.delta!.toFixed(1)})`}
              </div>
              <div style={{ marginTop: 6, opacity: 0.8, fontSize: 12 }}>
                Tip: Quick Log is your “daily signal.” Measurements are your “official tape.”
              </div>
            </div>

            <div style={{ padding: 10, borderRadius: 10, background: "rgba(255,255,255,0.06)" }}>
              <strong>Physique Scorecard</strong>
              <div style={{ marginTop: 6, opacity: 0.85, fontSize: 12 }}>
                1–10 ratings for this month. Use it to see trajectory, not perfection.
              </div>

              {scorecard ? (
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ opacity: 0.9 }}>
                      Month: <strong>{scorecard.monthKey}</strong>
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>Generated: {scorecard.ts.replace("T", " ").slice(0, 19)}Z</div>
                  </div>

                  {scorecardDeltaSummary ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "8px 10px", borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                      <strong>Scorecard Trend</strong>
                      <span style={{ fontSize: 12, opacity: 0.9 }}>vs {previousScorecard?.monthKey}</span>
                      <span style={{ fontSize: 12, opacity: 0.9 }}>
                        Improving: <strong>{scorecardDeltaSummary.improving}</strong>
                      </span>
                      <span style={{ fontSize: 12, opacity: 0.9 }}>
                        Flat: <strong>{scorecardDeltaSummary.flat}</strong>
                      </span>
                      <span style={{ fontSize: 12, opacity: 0.9 }}>
                        Down: <strong>{scorecardDeltaSummary.down}</strong>
                      </span>
                    </div>
                  ) : null}

                  <div style={{ display: "grid", gridTemplateColumns: scorecardDeltaSummary ? "1fr auto auto" : "1fr auto", gap: 6, alignItems: "center" }}>
                    {scorecardMetrics.map((metric) => {
                      const value = Number(scorecard[metric.key] ?? 0);
                      const delta = scorecardDeltaSummary?.deltas.find((d) => d.key === metric.key)?.delta ?? null;
                      return (
                        <div key={metric.key} style={{ display: "contents" }}>
                          <div style={{ opacity: 0.9 }}>{metric.label}</div>
                          <div>
                            <strong>{value.toFixed(1)}</strong>
                          </div>
                          {scorecardDeltaSummary ? (
                            <div>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  minWidth: 52,
                                  padding: "2px 8px",
                                  borderRadius: 999,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  ...deltaTone(delta ?? 0),
                                }}
                              >
                                {formatDelta(delta ?? 0)}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ opacity: 0.9 }}>
                    Momentum: <strong>{scorecard.momentum === "up" ? "↑ Improving" : scorecard.momentum === "down" ? "↓ Slipping" : "→ Flat"}</strong>
                    {previousScorecard ? (
                      <span style={{ opacity: 0.8 }}>
                        {" "}• Previous:{" "}
                        <strong>{previousScorecard.momentum === "up" ? "↑ Improving" : previousScorecard.momentum === "down" ? "↓ Slipping" : "→ Flat"}</strong>
                      </span>
                    ) : null}
                  </div>

                  {scorecard.notes ? (
                    <div style={{ opacity: 0.9, fontSize: 12, lineHeight: 1.35 }}>
                      <strong>Notes:</strong> {scorecard.notes}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div style={{ marginTop: 8, opacity: 0.85 }}>
                  No scorecard yet. Hit <strong>Scorecard</strong> above.
                </div>
              )}

              {scoreShowHistory && scoreHistory.length > 0 ? (
                <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Previous scorecards (click to load):</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {scoreHistory.map((h) => (
                      <button
                        key={h.ts}
                        style={{
                          textAlign: "left",
                          padding: "6px 10px",
                          borderRadius: 10,
                          background: "rgba(255,255,255,0.06)",
                        }}
                        onClick={() => setScorecard(h)}
                        title="Load this scorecard"
                      >
                        <span style={{ fontSize: 12, opacity: 0.9 }}>
                          {h.monthKey} • {h.ts.replace("T", " ").slice(0, 19)}Z • {h.momentum === "up" ? "↑" : h.momentum === "down" ? "↓" : "→"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <ProgressCoachAnalysis
            aiInsight={aiInsight}
            aiInsightHistory={aiInsightHistory}
            aiShowHistory={aiShowHistory}
            setAiInsight={setAiInsight}
          />

          <ProgressVision
            visionText={visionText}
            visionPose={visionPose}
            visionScope={visionScope}
            visionFocus={visionFocus}
            visionShowHistory={visionShowHistory}
            visionHistory={visionHistory}
            setVisionPose={setVisionPose}
            setVisionScope={setVisionScope}
            setVisionText={setVisionText}
          />
        </div>
      </div>
    </ProgressSection>
  );
}


