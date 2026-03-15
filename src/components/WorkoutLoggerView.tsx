import React from "react";
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
    newTemplateExerciseName,
    setNewTemplateExerciseName,
    addExerciseToTemplate,
    startSessionFromTemplate,
    displayExerciseName,
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
    setSecs
  } = props;

  return (
    <>
      <h3>Workout Logger</h3>

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
                        const defaultLabel = displayExerciseName(ex.name);
                        const lastSummary = lastByExerciseName[exerciseKey(ex.name)];
                        const preview = lastSummary?.sets?.slice?.(0, 5) ?? [];
                        const exSets = setsForExercise(ex.id) ?? [];
                        const compound = !!ex.is_compound;

                        return (
                          <div key={ex.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                              <div style={{ fontWeight: 800 }}>
                                {defaultLabel}{" "}
                                <span style={{ fontSize: 12, opacity: 0.7, fontWeight: 600 }}>({defaultLabel})</span>
                              </div>
                              <button onClick={() => ensureLastForExerciseName(ex.name)} style={{ padding: "6px 10px" }}>
                                Refresh
                              </button>
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
                                    <div key={s3.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
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
                                      <div style={{ opacity: 0.75 }}>{est ? `~1RM ${est}` : ""}</div>
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







