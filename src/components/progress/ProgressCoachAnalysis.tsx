type CoachRun = { id: string; ts: string; text: string };

export default function ProgressCoachAnalysis({
  aiInsight,
  aiInsightHistory,
  aiShowHistory,
  setAiInsight,
}: {
  aiInsight: string;
  aiInsightHistory: CoachRun[];
  aiShowHistory: boolean;
  setAiInsight: (text: string) => void;
}) {
  if (!aiInsight) return null;

  return (
    <div style={{ padding: 10, borderRadius: 10, background: "rgba(0,0,0,0.25)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <strong>Coach Analysis</strong>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          {aiInsightHistory[0]?.ts ? `Last run: ${aiInsightHistory[0].ts.replace("T", " ").slice(0, 19)}Z` : ""}
        </div>
      </div>
      <pre
        style={{
          marginTop: 8,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: "inherit",
          fontSize: 13,
          lineHeight: 1.35,
          opacity: 0.95,
        }}
      >
        {aiInsight}
      </pre>

      {aiShowHistory && aiInsightHistory.length > 0 ? (
        <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Previous coach runs (click to load):</div>
          <div style={{ display: "grid", gap: 6 }}>
            {aiInsightHistory.map((h) => (
              <button
                key={h.id}
                style={{
                  textAlign: "left",
                  padding: "6px 10px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.06)",
                }}
                onClick={() => setAiInsight(h.text)}
                title="Load this run into the viewer"
              >
                <span style={{ fontSize: 12, opacity: 0.9 }}>{h.ts.replace("T", " ").slice(0, 19)}Z</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
