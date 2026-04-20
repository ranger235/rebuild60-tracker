import React from "react";
import CoachInsightsPanel from "./CoachInsightsPanel";
import { buildSessionCoachInsights } from "../lib/sessionCoach";
import TemplatesView from "./TemplatesView";
import { CoachBoundary } from "../CoachPanel";
import type { LocalWorkoutTemplate } from "../localdb";

type Draft = {
  loadType: "weight" | "band" | "bodyweight";
  weight: string;
  reps: string;
  rpe: string;
  warmup: boolean;
  bandLevel: string;
  bandLevel2: string;
  bandMode: "resist" | "assist";
  bandConfig: "single" | "doubled" | "combined";
  bandEst: string;
};

type LastSummary = {
  source: string;
  sets: Array<{
    load_type?: string | null;
    weight_lbs?: number | null;
    reps?: number | null;
    rpe?: number | null;
    is_warmup?: boolean | null;
    band_level?: number | null;
    band_mode?: string | null;
    band_config?: string | null;
    band_est_lbs?: number | null;
  }>;
};

type Props = {
  // Templates
  templates: LocalWorkoutTemplate[];
  openTemplateId: string | null;
  templateExercises: any[];
  newTemplateName: string;
  setNewTemplateName: (v: string) => void;
  newTemplateDesc: string;
  setNewTemplateDesc: (v: string) => void;
  createTemplate: () => any;
  openTemplate: (templateId: string) => any;
  deleteTemplate: (templateId: string) => any;
  editTemplateName: string;
  setEditTemplateName: (v: string) => void;
  editTemplateDesc: string;
  setEditTemplateDesc: (v: string) => void;
  saveTemplateMeta: () => any;
  newTemplateExerciseName: string;
  setNewTemplateExerciseName: (v: string) => void;
  addExerciseToTemplate: () => any;
  renameTemplateExercise: (templateExerciseId: string, rawName: string) => any;
  deleteTemplateExercise: (templateExerciseId: string) => any;
  moveTemplateExercise: (templateExerciseId: string, direction: -1 | 1) => any;
  startSessionFromTemplate: (templateId: string) => any;
  displayExerciseName: (raw: string) => string;
  displayStoredExerciseName: (exercise: { name: string; exercise_library_id?: string | null }) => string;
  exerciseControlFor: (exerciseLibraryId: string | null | undefined, exerciseName?: string | null | undefined) => { prefer?: boolean; avoid?: boolean; never?: boolean; injury?: boolean } | null;
  setExerciseControl: (exerciseLibraryId: string | null | undefined, control: "prefer" | "avoid" | "never" | "injury", exerciseName?: string | null | undefined) => any;

  // Sessions
  sessions: any[];
  openSessionId: string | null;
  openSession: (sessionId: string) => any;
  deleteSession: (sessionId: string) => any;
  createWorkoutSession: () => any;

  // Exercises within open session
  exercises: any[];
  setsForExercise: (exerciseId: string) => any[];
  newExerciseName: string;
  setNewExerciseName: (v: string) => void;
  addExercise: () => any;

  // Draft set entry per exercise
  draftByExerciseId: Record<string, Draft>;
  updateDraft: (exerciseId: string, patch: Partial<Draft>) => any;
  addSet: (exerciseId: string) => any;
  deleteSet: (exerciseId: string, setId: string) => any;
  deleteExerciseFromSession: (exerciseId: string) => any;

  // UI toggles
  advanced: boolean;
  setAdvanced: (v: boolean) => void;
  coachEnabled: boolean;
  setCoachEnabled: (v: boolean) => void;

  // Last numbers cache + refresh
  lastByExerciseName: Record<string, LastSummary | undefined>;
  ensureLastForExerciseName: (exerciseName: string) => any;
  exerciseKey: (raw: string) => string;

  // Helpers
  oneRmEpley: (weight: number, reps: number) => number;
  formatSet: (s: any) => string;

  // Rest timer
  timerOn: boolean;
  setTimerOn: (updater: any) => void;
  secs: number;
  setSecs: (updater: any) => void;
  recommendationComparison: {
    available: boolean;
    adherenceScore: number;
    focusAligned: boolean;
    recommendedFocus: string;
    actualFocus: string;
    matchedCount: number;
    totalRecommended: number;
    volumeDelta: number | null;
    loadDeltaAvg: number | null;
    substitutions: Array<{ recommended: string; actual: string }>;
    extras: string[];
    missed: string[];
    fidelityScore?: number;
    fidelityLabel?: "High" | "Moderate" | "Low";
    fidelityNote?: string;
    summary: string;
  } | null;
  coachSessionSeed: {
    sessionId: string;
    title: string;
    bias: string;
    summary: string;
    exercises: Array<{
      exerciseId: string;
      name: string;
      slot: string;
      sets: string;
      reps: string;
      load: string;
      loadBasis: string;
      note: string;
    }>;
  } | null;
};

export default function WorkoutLoggerView(props: Props) {
  const {
    templates,
    openTemplateId,
    templateExercises,
    newTemplateName,
    setNewTemplateName,
    newTemplateDesc,
    setNewTemplateDesc,
    createTemplate,
    openTemplate,
    deleteTemplate,
    editTemplateName,
    setEditTemplateName,
    editTemplateDesc,
    setEditTemplateDesc,
    saveTemplateMeta,
    newTemplateExerciseName,
    setNewTemplateExerciseName,
    addExerciseToTemplate,
    renameTemplateExercise,
    deleteTemplateExercise,
    moveTemplateExercise,
    startSessionFromTemplate,
    displayExerciseName,
    displayStoredExerciseName,
    exerciseControlFor,
    setExerciseControl,
    sessions,
    openSessionId,
    openSession,
    deleteSession,
    createWorkoutSession,
    exercises,
    setsForExercise,
    newExerciseName,
    setNewExerciseName,
    addExercise,
    draftByExerciseId,
    updateDraft,
    addSet,
    deleteSet,
    deleteExerciseFromSession,
    advanced,
    setAdvanced,
    coachEnabled,
    setCoachEnabled,
    lastByExerciseName,
    ensureLastForExerciseName,
    exerciseKey,
    oneRmEpley,
    formatSet,
    timerOn,
    setTimerOn,
    secs,
    setSecs,
    recommendationComparison,
    coachSessionSeed
  } = props;

  const sessionCoachInsights = buildSessionCoachInsights({
    coachSessionSeed,
    recommendationComparison,
  });

  return (
    <>
      <h3>Workout Logger</h3>

      {recommendationComparison && (
        <div style={{ border: "1px solid #d5d5d5", borderRadius: 10, padding: 12, marginBottom: 12, background: "#fafafa" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700 }}>Recommendation vs Reality</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><div style={{ fontWeight: 700 }}>{recommendationComparison.adherenceScore}% match</div>{typeof recommendationComparison.fidelityScore === "number" && (<div style={{ fontWeight: 700 }}>Fidelity {recommendationComparison.fidelityScore}%</div>)}</div>
          </div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>{recommendationComparison.summary}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
            <span style={{ padding: "4px 8px", border: "1px solid #ddd", borderRadius: 999 }}>Focus: {recommendationComparison.recommendedFocus} → {recommendationComparison.actualFocus}</span>
            <span style={{ padding: "4px 8px", border: "1px solid #ddd", borderRadius: 999 }}>Exercises: {recommendationComparison.matchedCount}/{recommendationComparison.totalRecommended}</span>
            {recommendationComparison.volumeDelta != null && (
              <span style={{ padding: "4px 8px", border: "1px solid #ddd", borderRadius: 999 }}>Volume {recommendationComparison.volumeDelta >= 0 ? "+" : ""}{recommendationComparison.volumeDelta}%</span>
            )}
            {recommendationComparison.loadDeltaAvg != null && (
              <span style={{ padding: "4px 8px", border: "1px solid #ddd", borderRadius: 999 }}>Load {recommendationComparison.loadDeltaAvg >= 0 ? "+" : ""}{recommendationComparison.loadDeltaAvg}%</span>
            )}
            {typeof recommendationComparison.fidelityScore === "number" && (
              <span style={{ padding: "4px 8px", border: "1px solid #ddd", borderRadius: 999 }}>Fidelity {recommendationComparison.fidelityScore}% {recommendationComparison.fidelityLabel ? `(${recommendationComparison.fidelityLabel})` : ""}</span>
            )}
          </div>
          {recommendationComparison.fidelityNote && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <strong>Session fidelity:</strong> {recommendationComparison.fidelityNote}
            </div>
          )}
          {recommendationComparison.substitutions.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <strong>Swaps this session:</strong> {recommendationComparison.substitutions.map((s) => `${s.recommended} → ${s.actual}`).join(" • ")}
            </div>
          )}
        </div>
      )}

      {coachSessionSeed && (
        <div style={{ border: "1px solid #d5d5d5", borderRadius: 10, padding: 12, marginBottom: 12, background: "#f7fbff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800 }}>Loaded from Coach</div>
            <div style={{ fontWeight: 700 }}>{coachSessionSeed.bias}</div>
          </div>
          <div style={{ marginTop: 6, fontSize: 13 }}>
            <strong>{coachSessionSeed.title}</strong>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>{coachSessionSeed.summary}</div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
            Draft boxes are pre-seeded from the coach target. Rep boxes use the midpoint of a range for quick logging, while the full target range stays visible on each exercise card below.
          </div>
        </div>
      )}

      <CoachInsightsPanel insights={sessionCoachInsights} defaultOpen={false} />

      {/* Templates block */}
      <TemplatesView
        templates={templates}
        openTemplateId={openTemplateId}
        templateExercises={templateExercises}
        newTemplateName={newTemplateName}
        setNewTemplateName={setNewTemplateName}
        newTemplateDesc={newTemplateDesc}
        setNewTemplateDesc={setNewTemplateDesc}
        createTemplate={createTemplate}
        openTemplate={openTemplate}
        deleteTemplate={deleteTemplate}
        editTemplateName={editTemplateName}
        setEditTemplateName={setEditTemplateName}
        editTemplateDesc={editTemplateDesc}
        setEditTemplateDesc={setEditTemplateDesc}
        saveTemplateMeta={saveTemplateMeta}
        newTemplateExerciseName={newTemplateExerciseName}
        setNewTemplateExerciseName={setNewTemplateExerciseName}
        addExerciseToTemplate={addExerciseToTemplate}
        renameTemplateExercise={renameTemplateExercise}
        deleteTemplateExercise={deleteTemplateExercise}
        moveTemplateExercise={moveTemplateExercise}
        startSessionFromTemplate={startSessionFromTemplate}
        displayExerciseName={displayExerciseName}
      />

      <hr />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h4 style={{ margin: 0 }}>Sessions Today</h4>
        <button onClick={createWorkoutSession}>+ New Session</button>
      </div>

      {sessions.length === 0 ? (
        <p style={{ marginTop: 10 }}>No sessions today yet. Create one or start from a template.</p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {sessions.map((s) => (
            <div
              key={s.id}
              style={{
                border: s.id === openSessionId ? "2px solid black" : "1px solid #ccc",
                borderRadius: 8,
                padding: 12
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <button
                  onClick={() => openSession(s.id)}
                  style={{ textAlign: "left", padding: 0, border: "none", background: "transparent", flex: 1 }}
                >
                  <div style={{ fontWeight: 700 }}>{s.title}</div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>{new Date(s.started_at).toLocaleTimeString()}</div>
                </button>

                <button onClick={() => deleteSession(s.id)} style={{ opacity: 0.85 }}>
                  Delete
                </button>
              </div>

              {openSessionId === s.id && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <input
                      placeholder="Add exercise (e.g., Leverage Squat)"
                      value={newExerciseName}
                      onChange={(e) => setNewExerciseName(e.target.value)}
                      style={{ flex: 1 }}
                    />
                    <button onClick={addExercise}>Add</button>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
                      Advanced (RPE + Warmup)
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <input type="checkbox" checked={coachEnabled} onChange={(e) => setCoachEnabled(e.target.checked)} />
                      Coaching Panel (per exercise)
                    </label>
                  </div>

                  {exercises.length === 0 ? (
                    <p style={{ marginTop: 12, opacity: 0.85 }}>No exercises yet.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                      {exercises.map((ex) => {
                        const d = draftByExerciseId[ex.id];
                        const defaultLabel = displayStoredExerciseName(ex);
                        const lastSummary = lastByExerciseName[exerciseKey(ex.name)];
                        const preview = lastSummary?.sets?.slice?.(0, 5) ?? [];
                        const exSets = setsForExercise(ex.id) ?? [];
                        const compound = !!ex.is_compound;
                        const ctrl = exerciseControlFor(ex.exercise_library_id, ex.name);

                        return (
                          <div
                            key={ex.id}
                            style={{
                              border: "1px solid #ddd",
                              borderRadius: 10,
                              padding: 12,
                              boxShadow: ctrl?.never
                                ? "0 0 0 2px rgba(196, 55, 55, 0.18) inset"
                                : ctrl?.avoid
                                  ? "0 0 0 2px rgba(214, 135, 26, 0.18) inset"
                                  : ctrl?.prefer
                                    ? "0 0 0 2px rgba(53, 137, 55, 0.18) inset"
                                    : ctrl?.injury
                                      ? "0 0 0 2px rgba(184, 153, 34, 0.18) inset"
                                      : "none",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                              <div style={{ display: "grid", gap: 6 }}>
                                <div style={{ fontWeight: 800 }}>{defaultLabel}</div>
                                {ctrl && (ctrl.prefer || ctrl.avoid || ctrl.never || ctrl.injury) ? (
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    {ctrl.prefer && (
                                      <span style={{ padding: "2px 8px", borderRadius: 999, border: "1px solid #9ad39c", background: "#e8f8e8", fontSize: 11, fontWeight: 800, color: "#205f22" }}>
                                        Preferred
                                      </span>
                                    )}
                                    {ctrl.avoid && (
                                      <span style={{ padding: "2px 8px", borderRadius: 999, border: "1px solid #f0c07c", background: "#fff2df", fontSize: 11, fontWeight: 800, color: "#8a5600" }}>
                                        Avoid
                                      </span>
                                    )}
                                    {ctrl.never && (
                                      <span style={{ padding: "2px 8px", borderRadius: 999, border: "1px solid #e1a1a1", background: "#ffe9e9", fontSize: 11, fontWeight: 800, color: "#912323" }}>
                                        Never Show
                                      </span>
                                    )}
                                    {ctrl.injury && (
                                      <span style={{ padding: "2px 8px", borderRadius: 999, border: "1px solid #ead57a", background: "#fff8d9", fontSize: 11, fontWeight: 800, color: "#7c6500" }}>
                                        Injury-Sensitive
                                      </span>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                {(() => {
                                  const pillStyle = (active: boolean, bg: string, fg = "#111", ring = "rgba(0,0,0,0.12)") => ({
                                    padding: "4px 8px",
                                    borderRadius: 999,
                                    border: active ? `1px solid ${ring}` : "1px solid #ddd",
                                    background: active ? bg : "#fff",
                                    color: active ? fg : "#333",
                                    fontWeight: active ? 800 : 600,
                                    boxShadow: active ? `0 0 0 2px ${ring}` : "none",
                                    transform: active ? "translateY(-1px)" : "none",
                                  });
                                  return (
                                    <>
                                      <button onClick={() => setExerciseControl(ex.exercise_library_id, "prefer", ex.name)} aria-pressed={!!ctrl?.prefer} title="Prefer this exercise" style={pillStyle(!!ctrl?.prefer, "#dff7df", "#205f22", "rgba(53, 137, 55, 0.22)")}>👍 Prefer</button>
                                      <button onClick={() => setExerciseControl(ex.exercise_library_id, "avoid", ex.name)} aria-pressed={!!ctrl?.avoid} title="Avoid this exercise" style={pillStyle(!!ctrl?.avoid, "#fff0d6", "#8a5600", "rgba(214, 135, 26, 0.22)")}>👎 Avoid</button>
                                      <button onClick={() => setExerciseControl(ex.exercise_library_id, "never", ex.name)} aria-pressed={!!ctrl?.never} title="Never show this exercise" style={pillStyle(!!ctrl?.never, "#ffe0e0", "#912323", "rgba(196, 55, 55, 0.22)")}>🚫 Never</button>
                                      <button onClick={() => setExerciseControl(ex.exercise_library_id, "injury", ex.name)} aria-pressed={!!ctrl?.injury} title="Mark as injury-sensitive" style={pillStyle(!!ctrl?.injury, "#fff6cc", "#7c6500", "rgba(184, 153, 34, 0.22)")}>⚠️ Injury</button>
                                    </>
                                  );
                                })()}
                                <button onClick={() => ensureLastForExerciseName(ex.name)} style={{ padding: "6px 10px" }}>
                                  Refresh
                                </button>
                                <button
                                  onClick={() => deleteExerciseFromSession(ex.id)}
                                  style={{ padding: "6px 10px", color: "#8b0000" }}
                                  title="Remove exercise and all sets from this session"
                                >
                                  Remove Exercise
                                </button>
                              </div>
                            </div>

                            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
                              {lastSummary ? (
                                <>
                                  <div>
                                    <b>Last ({lastSummary.source}):</b>{" "}
                                    {preview.map((s2, i) => (
                                      <span key={i}>
                                        {i > 0 ? " | " : ""}
                                        {formatSet({
                                          load_type: (s2 as any).load_type ?? null,
                                          weight_lbs: (s2 as any).weight_lbs ?? null,
                                          band_level: (s2 as any).band_level ?? null,
                                          band_mode: (s2 as any).band_mode ?? null,
                                          band_config: (s2 as any).band_config ?? null,
                                          band_est_lbs: (s2 as any).band_est_lbs ?? null,
                                          reps: (s2 as any).reps ?? null,
                                          rpe: (s2 as any).rpe ?? null,
                                          is_warmup: !!(s2 as any).is_warmup
                                        })}
                                      </span>
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <div style={{ opacity: 0.7 }}>No last data yet. Hit Refresh.</div>
                              )}
                            </div>

                            {coachSessionSeed?.sessionId === openSessionId && (() => {
                              const coachEx = coachSessionSeed.exercises.find((seed) => seed.exerciseId === ex.id);
                              if (!coachEx) return null;
                              const repMidpoint =
                                coachEx.reps && coachEx.reps.includes("-")
                                  ? Math.round(
                                      coachEx.reps
                                        .split("-")
                                        .map((n) => Number(n.trim()))
                                        .filter((n) => Number.isFinite(n))
                                        .reduce((a, b) => a + b, 0) /
                                        2
                                    )
                                  : null;
                              return (
                                <div style={{ marginTop: 10, padding: "8px 10px", border: "1px solid #d7e7f7", background: "#f7fbff", borderRadius: 8, fontSize: 12 }}>
                                  <div style={{ fontWeight: 700 }}>Coach target — {coachEx.slot}</div>
                                  <div style={{ marginTop: 4 }}>
                                    {coachEx.sets} sets × {coachEx.reps} reps{coachEx.load ? ` @ ${coachEx.load}` : ""}
                                  </div>
                                  <div style={{ marginTop: 4, opacity: 0.85 }}>{coachEx.loadBasis}</div>
                                  {repMidpoint != null && (
                                    <div style={{ marginTop: 4, opacity: 0.8 }}>
                                      Draft prefill uses midpoint <strong>{repMidpoint}</strong> from target range <strong>{coachEx.reps}</strong> for quick entry.
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* Set entry */}
                            {d && (
                              <div style={{ marginTop: 10 }}>
                                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                                  <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 700 }}>Load:</div>
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    <button
                                      onClick={() => updateDraft(ex.id, { loadType: "weight" })}
                                      style={{ fontWeight: d.loadType === "weight" ? 800 : 600 }}
                                    >
                                      Weight
                                    </button>
                                    <button
                                      onClick={() => updateDraft(ex.id, { loadType: "band" })}
                                      style={{ fontWeight: d.loadType === "band" ? 800 : 600 }}
                                    >
                                      Band
                                    </button>
                                    <button
                                      onClick={() => updateDraft(ex.id, { loadType: "bodyweight" })}
                                      style={{ fontWeight: d.loadType === "bodyweight" ? 800 : 600 }}
                                    >
                                      BW
                                    </button>
                                  </div>
                                </div>

                                {/* Weight / BW */}
                                {(d.loadType === "weight" || d.loadType === "bodyweight") && (
                                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                    {d.loadType === "weight" && (
                                      <input
                                        placeholder="Weight"
                                        value={d.weight}
                                        onChange={(e) => updateDraft(ex.id, { weight: e.target.value })}
                                      />
                                    )}
                                    <input
                                      placeholder="Reps"
                                      value={d.reps}
                                      onChange={(e) => updateDraft(ex.id, { reps: e.target.value })}
                                    />
                                    {advanced && (
                                      <input
                                        placeholder="RPE"
                                        value={d.rpe}
                                        onChange={(e) => updateDraft(ex.id, { rpe: e.target.value })}
                                      />
                                    )}
                                    <button onClick={() => addSet(ex.id)}>Save Set</button>
                                  </div>
                                )}

                                {/* Band */}
                                {d.loadType === "band" && (
                                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                                      <select
                                        value={d.bandConfig}
                                        onChange={(e) =>
                                          updateDraft(ex.id, {
                                            bandConfig: e.target.value as any,
                                            bandLevel2: e.target.value === "combined" ? d.bandLevel2 : ""
                                          })
                                        }
                                      >
                                        <option value="single">Single</option>
                                        <option value="combined">Combined</option>
                                        <option value="doubled">Doubled</option>
                                      </select>
                                      <input
                                        placeholder="Primary 1–5"
                                        value={d.bandLevel}
                                        onChange={(e) => updateDraft(ex.id, { bandLevel: e.target.value })}
                                      />
                                      <input
                                        placeholder={d.bandConfig === "combined" ? "Second 1–5" : "Second n/a"}
                                        value={d.bandLevel2}
                                        onChange={(e) => updateDraft(ex.id, { bandLevel2: e.target.value })}
                                        disabled={d.bandConfig !== "combined"}
                                      />
                                      <select
                                        value={d.bandMode}
                                        onChange={(e) => updateDraft(ex.id, { bandMode: e.target.value as any })}
                                      >
                                        <option value="resist">Resist</option>
                                        <option value="assist">Assist</option>
                                      </select>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr", gap: 8 }}>
                                      <input
                                        placeholder="Est lbs override (opt)"
                                        value={d.bandEst}
                                        onChange={(e) => updateDraft(ex.id, { bandEst: e.target.value } as any)}
                                      />
                                      <input
                                        placeholder="Reps"
                                        value={d.reps}
                                        onChange={(e) => updateDraft(ex.id, { reps: e.target.value })}
                                      />
                                      {advanced ? (
                                        <input
                                          placeholder="RPE"
                                          value={d.rpe}
                                          onChange={(e) => updateDraft(ex.id, { rpe: e.target.value })}
                                        />
                                      ) : (
                                        <div style={{ display: "flex", alignItems: "center", fontSize: 12, opacity: 0.75 }}>
                                          {d.bandConfig === "combined"
                                            ? "Primary + second × combo factor"
                                            : d.bandConfig === "doubled"
                                              ? "Primary × 2"
                                              : "Primary only"}
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                      <button onClick={() => addSet(ex.id)}>Save Set</button>
                                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                                        Pick setup first. Combined uses both band boxes. Doubled mirrors the same band.
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {advanced && (
                                  <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                                    <input
                                      type="checkbox"
                                      checked={d.warmup}
                                      onChange={(e) => updateDraft(ex.id, { warmup: e.target.checked })}
                                    />
                                    Warmup set
                                  </label>
                                )}
                              </div>
                            )}

                            {/* Sets Today */}
                            <div style={{ marginTop: 12 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Sets (today)</div>
                              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                                {exSets.map((s3: any) => {
                                  const est =
                                    s3.weight_lbs != null && s3.reps != null
                                      ? oneRmEpley(Number(s3.weight_lbs), Number(s3.reps))
                                      : null;

                                  return (
                                    <div key={s3.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                                      <div>
                                        <b>{s3.set_number}.</b>{" "}
                                        {formatSet({
                                          load_type: (s3 as any).load_type ?? null,
                                          weight_lbs: s3.weight_lbs ?? null,
                                          band_level: (s3 as any).band_level ?? null,
                                          band_mode: (s3 as any).band_mode ?? null,
                                          band_config: (s3 as any).band_config ?? null,
                                          band_est_lbs: (s3 as any).band_est_lbs ?? null,
                                          reps: s3.reps ?? null,
                                          rpe: s3.rpe ?? null,
                                          is_warmup: !!s3.is_warmup
                                        })}
                                      </div>
                                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <div style={{ opacity: 0.75 }}>{est ? `~1RM ${est}` : ""}</div>
                                        <button
                                          onClick={() => deleteSet(ex.id, s3.id)}
                                          style={{ padding: "2px 8px", color: "#8b0000" }}
                                          title="Delete this saved set"
                                          aria-label={`Delete set ${s3.set_number} for ${defaultLabel}`}
                                        >
                                          ×
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {coachEnabled && <CoachBoundary exerciseName={displayExerciseName(ex.name)} sets={exSets} compound={compound} />}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <hr />

                  <h3>Rest Timer</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={() => {
                        setSecs(90);
                        setTimerOn(true);
                      }}
                    >
                      Start 90s
                    </button>
                    <button
                      onClick={() => {
                        setSecs(120);
                        setTimerOn(true);
                      }}
                    >
                      Start 120s
                    </button>
                    <button onClick={() => setTimerOn((v: boolean) => !v)}>{timerOn ? "Pause" : "Resume"}</button>
                    <button
                      onClick={() => {
                        setTimerOn(false);
                        setSecs(90);
                      }}
                    >
                      Reset
                    </button>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>
                      {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
























