import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { enqueue, startAutoSync } from "./sync";
import { localdb, type LocalWorkoutExercise, type LocalWorkoutSession, type LocalWorkoutSet } from "./localdb";

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function uuid(): string {
  // Works in modern browsers (iOS/desktop)
  return crypto.randomUUID();
}

function oneRmEpley(weight: number, reps: number): number {
  // simple, stable estimate
  return Math.round(weight * (1 + reps / 30));
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("…");

  const [tab, setTab] = useState<"quick" | "workout">("quick");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const dayDate = useMemo(() => todayISO(), []);
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [sleepHours, setSleepHours] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [z2Minutes, setZ2Minutes] = useState("");
  const [notes, setNotes] = useState("");

  // Rest timer
  const [timerOn, setTimerOn] = useState(false);
  const [secs, setSecs] = useState(90);

  // Workout state (local-first)
  const [sessions, setSessions] = useState<LocalWorkoutSession[]>([]);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [exercises, setExercises] = useState<LocalWorkoutExercise[]>([]);
  const [sets, setSets] = useState<LocalWorkoutSet[]>([]);

  // Add exercise / set UI
  const [newExerciseName, setNewExerciseName] = useState("");
  const [advanced, setAdvanced] = useState(false);

  const [setWeight, setSetWeight] = useState("");
  const [setReps, setSetReps] = useState("");
  const [setRpe, setSetRpe] = useState("");
  const [setWarmup, setSetWarmup] = useState(false);
    setTab("quick");
    setOpenSessionId(null);
  }

  async function saveQuickLog() {
    if (!userId) return;

    await enqueue("upsert_daily", {
      user_id: userId,
      day_date: dayDate,
      weight_lbs: weight ? Number(weight) : null,
      waist_in: waist ? Number(waist) : null,
      sleep_hours: sleepHours ? Number(sleepHours) : null,
      notes: notes || null
    });

    await enqueue("upsert_nutrition", {
      user_id: userId,
      day_date: dayDate,
      calories: calories ? Number(calories) : null,
      protein_g: protein ? Number(protein) : null
    });

    if (z2Minutes) {
      await enqueue("insert_zone2", {
        user_id: userId,
        day_date: dayDate,
        modality: "Walk",
        minutes: Number(z2Minutes)
      });
    }

    alert("Saved instantly (local). Will sync when online.");
  }

  // ----------------------------
  // Workout: local-first helpers
  // ----------------------------
  async function loadTodaySessions() {
    if (!userId) return;
    const rows = await localdb.localSessions
      .where({ user_id: userId, day_date: dayDate })
      .sortBy("started_at");
    // newest first
    setSessions(rows.reverse());
  }

  async function openSession(sessionId: string) {
    setOpenSessionId(sessionId);
    const ex = await localdb.localExercises.where({ session_id: sessionId }).sortBy("sort_order");
    setExercises(ex);

    const allSets: LocalWorkoutSet[] = [];
    for (const e of ex) {
      const s = await localdb.localSets.where({ exercise_id: e.id }).sortBy("set_number");
      allSets.push(...s);
    }
    setSets(allSets);
  }

  useEffect(() => {
    if (!userId) return;
    loadTodaySessions();
  }, [userId]);

  async function createWorkoutSession() {
    if (!userId) return;
    const id = uuid();
    const started_at = new Date().toISOString();

    const local: LocalWorkoutSession = {
      id,
      user_id: userId,
      day_date: dayDate,
      started_at,
      title: "Week 1 Day 1",
      notes: null
    };

    await localdb.localSessions.put(local);
    await enqueue("create_workout", {
      id,
      user_id: userId,
      day_date: dayDate,
      started_at,
      title: local.title,
      notes: null
    });

    await loadTodaySessions();
    await openSession(id);
    setTab("workout");
  }

  async function addExercise() {
    if (!openSessionId) return;
    const name = newExerciseName.trim();
    if (!name) return;

    const id = uuid();
    const sort_order = exercises.length;

    const local: LocalWorkoutExercise = {
      id,
      session_id: openSessionId,
      name,
      sort_order
    };

    await localdb.localExercises.put(local);
    await enqueue("insert_exercise", {
      id,
      session_id: openSessionId,
      name,
      sort_order
    });

    setNewExerciseName("");
    await openSession(openSessionId);
  }

  function setsForExercise(exerciseId: string) {
    return sets.filter((s) => s.exercise_id === exerciseId).sort((a, b) => a.set_number - b.set_number);
  }

  async function addSet(exerciseId: string) {
    const reps = setReps ? Number(setReps) : null;
    const w = setWeight ? Number(setWeight) : null;
    if (!reps || reps <= 0) {
      alert("Reps required.");
      return;
    }

    const existing = await localdb.localSets.where({ exercise_id: exerciseId }).toArray();
    const nextSetNumber = (existing?.length ?? 0) + 1;

    const id = uuid();
    const local: LocalWorkoutSet = {
      id,
      exercise_id: exerciseId,
      set_number: nextSetNumber,
      weight_lbs: w,
      reps,
      rpe: advanced && setRpe ? Number(setRpe) : null,
      is_warmup: advanced ? !!setWarmup : false
    };

    await localdb.localSets.put(local);
    await enqueue("insert_set", {
      id,
      exercise_id: exerciseId,
      set_number: nextSetNumber,
      weight_lbs: w,
      reps,
      rpe: advanced && setRpe ? Number(setRpe) : null,
      is_warmup: advanced ? !!setWarmup : false
    });

    // Clear inputs and auto-start rest timer
    setSetWeight("");
    setSetReps("");
    setSetRpe("");
    setSetWarmup(false);
    setSecs(90);
    setTimerOn(true);

    if (openSessionId) await openSession(openSessionId);
  }

  // ----------------------------
  // UI
  // ----------------------------
  const openSessionObj = sessions.find((s) => s.id === openSessionId) ?? null;

  return (
    <div style={{ padding: 20, maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Rebuild @ 60 Tracker</h2>
        <button onClick={signOut}>Sign Out</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div><b>Today:</b> {dayDate} (Week 1 Day 1)</div>
        <div><b>Status:</b> {navigator.onLine ? status : "Offline (logging still works)"}</div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button onClick={() => setTab("quick")} disabled={tab === "quick"}>Quick Log</button>
        <button onClick={() => { setTab("workout"); loadTodaySessions(); }} disabled={tab === "workout"}>Workout</button>
      </div>

      <hr />

      {tab === "quick" && (
        <>
          <h3>60-Second Quick Log</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <input placeholder="Weight (lbs)" value={weight} onChange={(e) => setWeight(e.target.value)} />
            <input placeholder="Waist (in)" value={waist} onChange={(e) => setWaist(e.target.value)} />
            <input placeholder="Sleep (hours)" value={sleepHours} onChange={(e) => setSleepHours(e.target.value)} />
            <input placeholder="Calories" value={calories} onChange={(e) => setCalories(e.target.value)} />
            <input placeholder="Protein (g)" value={protein} onChange={(e) => setProtein(e.target.value)} />
            <input placeholder="Zone 2 minutes" value={z2Minutes} onChange={(e) => setZ2Minutes(e.target.value)} />
          </div>

          <textarea
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: "100%", marginTop: 10, height: 70 }}
          />

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button onClick={saveQuickLog}>Save Quick Log</button>
          </div>

          <hr />

          <h3>Rest Timer</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => { setSecs(90); setTimerOn(true); }}>Start 90s</button>
            <button onClick={() => { setSecs(120); setTimerOn(true); }}>Start 120s</button>
            <button onClick={() => setTimerOn((v) => !v)}>{timerOn ? "Pause" : "Resume"}</button>
            <button onClick={() => { setTimerOn(false); setSecs(90); }}>Reset</button>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
            </div>
          </div>
        </>
      )}

      {tab === "workout" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3>Workout Logger</h3>
            <button onClick={createWorkoutSession}>+ New Session</button>
          </div>

          {sessions.length === 0 ? (
            <p>No sessions today yet. Hit <b>New Session</b> and start the damage.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => openSession(s.id)}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    border: s.id === openSessionId ? "2px solid black" : "1px solid #ccc",
                    borderRadius: 8
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{s.title}</div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>{new Date(s.started_at).toLocaleTimeString()}</div>
                </button>
              ))}
            </div>
          )}

          {openSessionObj && (
            <>
              <hr />
              <h4>{openSessionObj.title}</h4>

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
                  <input
                    type="checkbox"
                    checked={advanced}
                    onChange={(e) => setAdvanced(e.target.checked)}
                  />
                  Advanced (RPE + Warmup)
                </label>
              </div>

              {exercises.length === 0 ? (
                <p style={{ marginTop: 12 }}>Add your first exercise and start logging sets.</p>
              ) : (
                <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                  {exercises.map((ex) => {
                    const exSets = setsForExercise(ex.id);
                    const last = exSets[exSets.length - 1];

                    return (
                      <div key={ex.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <div style={{ fontWeight: 800 }}>{ex.name}</div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>
                            {last?.weight_lbs && last?.reps ? `Last: ${last.weight_lbs} x ${last.reps}` : ""}
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: advanced ? "repeat(4, 1fr)" : "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
                          <input
                            placeholder="Weight"
                            value={setWeight}
                            onChange={(e) => setSetWeight(e.target.value)}
                          />
                          <input
                            placeholder="Reps"
                            value={setReps}
                            onChange={(e) => setSetReps(e.target.value)}
                          />
                          {advanced && (
                            <input
                              placeholder="RPE"
                              value={setRpe}
                              onChange={(e) => setSetRpe(e.target.value)}
                            />
                          )}
                          <button onClick={() => addSet(ex.id)}>Save Set</button>
                        </div>

                        {advanced && (
                          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                            <input
                              type="checkbox"
                              checked={setWarmup}
                              onChange={(e) => setSetWarmup(e.target.checked)}
                            />
                            Warmup set
                          </label>
                        )}

                        {exSets.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Sets</div>
                            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                              {exSets.map((s) => {
                                const est = s.weight_lbs && s.reps ? oneRmEpley(s.weight_lbs, s.reps) : null;
                                return (
                                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                    <div>
                                      <b>{s.set_number}.</b>{" "}
                                      {s.weight_lbs ?? "—"} x {s.reps ?? "—"}
                                      {s.is_warmup ? " (WU)" : ""}
                                      {s.rpe != null ? ` @RPE ${s.rpe}` : ""}
                                    </div>
                                    <div style={{ opacity: 0.75 }}>
                                      {est ? `~1RM ${est}` : ""}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <hr />

              <h3>Rest Timer</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => { setSecs(90); setTimerOn(true); }}>Start 90s</button>
                <button onClick={() => { setSecs(120); setTimerOn(true); }}>Start 120s</button>
                <button onClick={() => setTimerOn((v) => !v)}>{timerOn ? "Pause" : "Resume"}</button>
                <button onClick={() => { setTimerOn(false); setSecs(90); }}>Reset</button>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
