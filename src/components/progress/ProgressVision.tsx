type Pose = "front" | "quarter" | "side" | "back" | "other";
type VisionRun = { id: string; ts: string; pose: Pose; scope: string; text: string };

export default function ProgressVision({
  visionText,
  visionPose,
  visionScope,
  visionFocus,
  visionShowHistory,
  visionHistory,
  setVisionPose,
  setVisionScope,
  setVisionText,
}: {
  visionText: string;
  visionPose: Pose;
  visionScope: "last2" | "month";
  visionFocus: "balanced" | "lower" | "upper";
  visionShowHistory: boolean;
  visionHistory: VisionRun[];
  setVisionPose: (pose: Pose) => void;
  setVisionScope: (scope: "last2" | "month") => void;
  setVisionText: (text: string) => void;
}) {
  if (!visionText) return null;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>
        <strong>Vision Analysis</strong> — {visionPose.toUpperCase()} ({visionScope === "month" ? "month" : "last 2"}, {visionFocus})
      </div>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          padding: 10,
          borderRadius: 12,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          margin: 0,
          opacity: 0.95,
        }}
      >
        {visionText}
      </pre>

      {visionShowHistory && visionHistory.length > 0 ? (
        <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 6 }}>Previous Vision runs (click to load):</div>
          <div style={{ display: "grid", gap: 6 }}>
            {visionHistory.map((h) => (
              <button
                key={h.id}
                style={{
                  textAlign: "left",
                  padding: "6px 10px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.06)",
                }}
                onClick={() => {
                  setVisionPose(h.pose);
                  setVisionScope(h.scope as "last2" | "month");
                  setVisionText(h.text);
                }}
                title="Load this Vision run into the viewer"
              >
                <span style={{ fontSize: 12, opacity: 0.9 }}>
                  {h.ts.replace("T", " ").slice(0, 19)}Z • {h.pose.toUpperCase()} • {h.scope}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
