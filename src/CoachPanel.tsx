import React from "react";

type Props = {
  exerciseName: string;
  sets: { weight: string; reps: string; rpe?: string }[];
  compound: boolean;
};

function estimate1RM(weight: number, reps: number) {
  return weight * (1 + reps / 30);
}

export function CoachPanel({ exerciseName, sets, compound }: Props) {
  const workSets = sets.filter(
    (s) => s.weight && s.reps && !isNaN(Number(s.weight)) && !isNaN(Number(s.reps))
  );

  if (workSets.length === 0) return null;

  const last = workSets[workSets.length - 1];
  const weight = Number(last.weight);
  const reps = Number(last.reps);

  const e1rm = estimate1RM(weight, reps);

  let suggestion = "";

  if (compound) {
    if (reps >= 5) {
      suggestion = "Suggestion: +5 lbs next session";
    } else {
      suggestion = "Suggestion: Hold weight";
    }
  } else {
    if (reps >= 12) {
      suggestion = "Suggestion: Add small load bump";
    } else {
      suggestion = "Suggestion: Add 1–2 reps next time";
    }
  }

  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        border: "1px solid #eee",
        borderRadius: 8,
        background: "#fafafa",
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 600 }}>Coach</div>
      <div>Last set: {weight} × {reps}</div>
      <div>Est. 1RM: {e1rm.toFixed(1)}</div>
      <div style={{ marginTop: 4 }}>{suggestion}</div>
    </div>
  );
}

