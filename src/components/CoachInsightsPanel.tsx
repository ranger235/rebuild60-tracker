// src/components/CoachInsightsPanel.tsx

import React, { useMemo, useState } from "react";
import type { SessionCoachInsights } from "../lib/sessionCoach";

type Props = {
  insights: SessionCoachInsights | null;
  defaultOpen?: boolean;
};

function Section(props: { title: string; body: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.2, textTransform: "uppercase", opacity: 0.75 }}>
        {props.title}
      </div>
      <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.45 }}>
        {props.body}
      </div>
    </div>
  );
}

export default function CoachInsightsPanel({ insights, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const hasInsights = useMemo(() => {
    return !!(
      insights &&
      (insights.whyToday || insights.mainFocus || insights.progressionOpportunity || insights.watchItem)
    );
  }, [insights]);

  if (!hasInsights) return null;

  return (
    <div
      style={{
        border: "1px solid #d5d5d5",
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
        background: "#fcfcfc",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div>
          <div style={{ fontWeight: 800 }}>Coach Readout</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
            Deterministic workout underneath, practical coaching layer on top
          </div>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>
          {open ? "−" : "+"}
        </div>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          <Section title="Why Today" body={insights!.whyToday} />
          <Section title="Main Focus" body={insights!.mainFocus} />
          <Section title="Progression Opportunity" body={insights!.progressionOpportunity} />
          <Section title="Watch Item" body={insights!.watchItem} />
        </div>
      )}
    </div>
  );
}

