import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { enqueue, startAutoSync } from "./sync";
import {
  localdb,
  type LocalWorkoutExercise,
  type LocalWorkoutSession,
  type LocalWorkoutSet,
  type LocalWorkoutTemplate,
  type LocalWorkoutTemplateExercise,
  type LoadType
} from "./localdb";

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function uuid(): string {
  return crypto.randomUUID();
}
function oneRmEpley(weight: number, reps: number): number {
  return Math.round(weight * (1 + reps / 30));
}
function isoToDay(iso: string): string {
  try {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return iso.slice(0, 10);
  }
}

const BAND_DEFAULT_EST: Record<number, number> = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 };

type SetLite = {
  load_type: LoadType;
  weight_lbs: number | null;
  reps: number | null;
  rpe: number | null;
  is_warmup: boolean;
  band_level: number | null;
  band_est_lbs: number | null;
};

type LastSetSummary = {
  source: "local" | "cloud";
  started_at: string;
  sets: SetLite[];
};

type ExerciseDraft = {
  load_type: LoadType;

  weight: string; // weight mode
  reps: string;

  band_level: number; // 1..5
  band_est_override: string; // advanced-only

  rpe: string; // advanced-only
  warmup: boolean;
};

function effectiveLoadLbs(s: { load_type: LoadType; weight_lbs: number | null; band_est_lbs: number | null }): number | null {
  if (s.load_type === "weight") return s.weight_lbs ?? null;
  if (s.load_type === "band") return s.band_est_lbs ?? null;
  return null;
}

function formatSet(s: SetLite) {
  const reps = s.reps ?? "—";
  const wu = s.is_warmup ? " WU" : "";
  const rpe = s.rpe != null ? ` @${s.rpe}` : "";
  if (s.load_type === "band") {
    const lvl = s.band_level ?? "?";
    const est = s.band_est_lbs != null ? ` (~${Math.round(Number(s.band_est_lbs))}lb)` : "";
    return `Band ${lvl}${est} x ${reps}${wu}${rpe}`;
  }
  if (s.load_type === "bodyweight") return `BW x ${reps}${wu}${rpe}`;
  const w = s.weight_lbs ?? "—";
  return `${w} x ${reps}${wu}${rpe}`;
}

function isCompoundExercise(name: string): boolean {
  const n = name.toLowerCase();
  const compoundKeywords = [
    "squat",
    "bench",
    "deadlift",
    "press",
    "overhead",
    "ohp",
    "row",
    "pull-up",
    "pull up",
    "chin-up",
    "chin up",
    "dip",
    "lunge",
    "split squat",
    "rdl",
    "romanian",
    "good morning",
    "hack squat",
    "leg press",
    "incline bench"
  ];
  const accessoryKeywords = [
    "curl",
    "extension",
    "fly",
    "lateral",
    "raise",
    "tricep",
    "pushdown",
    "pulldown",
    "face pull",
    "rear delt",
    "calf",
    "hamstring curl",
    "leg curl",
    "pec deck",
    "cable",
    "machine fly",
    "shrug",
    "abs",
    "crunch",
    "plank"
  ];
  if (accessoryKeywords.some((k) => n.includes(k))) return false;
  return compoundKeywords.some((k) => n.includes(k));
}

type BackupEnvelope = {
  app: "rebuild60";
  schema: number;
  exported_at: string;
  tables: Record<string, any[]>;
};

function LineChart({
  title,
  points,
  height = 120
}: {
  title: string;
  points: { xLabel: string; y: number }[];
  height?: number;
}) {
  const width = 340;
  const pad = 18;

  if (!points || points.length === 0) {
    return (
      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>No data yet.</div>
      </div>
    );
  }

  const ys = points.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = maxY - minY || 1;

  const toX = (i: number) => (points.length === 1 ? pad : pad + (i * (width - pad * 2)) / (points.length - 1));
  const toY = (y: number) => {
    const t = (y - minY) / span;
    return pad + (1 - t) * (height - pad * 2);
  };

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.y).toFixed(1)}`)
    .join(" ");

  const last = points[points.length - 1]?.y ?? 0;

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Latest: <b>{Number.isFinite(last) ? Math.round(last) : last}</b>
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${width} 0 ${height}`} style={{ marginTop: 8 }}>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" />
        <text x={pad} y={pad - 4} fontSize="10" opacity="0.65">
          {Math.round(maxY)}
        </text>
        <text x={pad} y={height - 4} fontSize="10" opacity="0.65">
          {Math.round(minY)}
        </text>
      </svg>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.75 }}>
        <span>{points[0]?.xLabel}</span>
        <span>{points[points.length - 1]?.xLabel}</span>
      </div>
    </div>
  );
}

/** -------------------------
 * Import parsing
 * ------------------------*/
type ImportSet = {
  load_type: LoadType;
  weight_lbs: number | null;
  reps: number;
  rpe: number | null;
  is_warmup: boolean;
  band_level: number | null;
  band_est_lbs: number | null;
};
type ImportExercise = { name: string; sets: ImportSet[] };
type ImportPlan = {
  session_title: string;
  day_date: string;
  exercises: ImportExercise[];
  warnings: string[];
};

function clampBandLevel(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  const x = Math.round(n);
  if (x < 1 || x > 5) return null;
  return x;
}

function parseWorkoutScript(text: string, fallbackDate: string): ImportPlan {
  const warnings: string[] = [];
  let session_title = "Imported Workout";
  let day_date = fallbackDate;

  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\t/g, "  "));

  // headers
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    if (raw.startsWith("#")) continue;

    const mSess = raw.match(/^SESSION\s*:\s*(.+)$/i);
    if (mSess?.[1]) session_title = mSess[1].trim();

    const mDate = raw.match(/^DATE\s*:\s*(\d{4}-\d{2}-\d{2})$/i);
    if (mDate?.[1]) day_date = mDate[1].trim();
  }

  const exercises: ImportExercise[] = [];
  let cur: ImportExercise | null = null;

  const pushCur = () => {
    if (cur && cur.name.trim() && cur.sets.length > 0) exercises.push(cur);
    cur = null;
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const original = lines[idx];
    const lineNo = idx + 1;
    const trimmed = original.trim();

    if (!trimmed) continue;
    if (trimmed.startsWith("#")) continue;

    if (/^SESSION\s*:/i.test(trimmed)) continue;
    if (/^DATE\s*:/i.test(trimmed)) continue;

    const isIndented = /^\s+/.test(original);

    if (!isIndented) {
      if (/^\d+(\.\d+)?\s*x\s*\d+/i.test(trimmed) || /^band\s+\d/i.test(trimmed)) {
        warnings.push(`Line ${lineNo}: looks like a set but no exercise header above it. Skipped.`);
        continue;
      }
      pushCur();
      cur = { name: trimmed, sets: [] };
      continue;
    }

    if (!cur) {
      warnings.push(`Line ${lineNo}: set found but no exercise header above it. Skipped.`);
      continue;
    }

    const is_warmup = /\bWU\b/i.test(trimmed);
    const rpeMatch = trimmed.match(/@\s*(\d+(\.\d+)?)/);
    const rpe = rpeMatch ? Number(rpeMatch[1]) : null;

    const bandMatch = trimmed.match(
      /^band\s+([1-5])\s*(?:\(\s*~?\s*(\d+(\.\d+)?)\s*\))?\s*x\s*(\d+)\b/i
    );
    if (bandMatch) {
      const level = clampBandLevel(Number(bandMatch[1]));
      const reps = Number(bandMatch[4]);

      if (!level) {
        warnings.push(`Line ${lineNo}: band level must be 1–5.`);
        continue;
      }
      if (!reps || reps <= 0) {
        warnings.push(`Line ${lineNo}: reps missing/invalid.`);
        continue;
      }

      const override = bandMatch[2] ? Number(bandMatch[2]) : null;
      const est = override ?? (BAND_DEFAULT_EST[level] ?? null);

      cur.sets.push({
        load_type: "band",
        weight_lbs: null,
        reps,
        rpe,
        is_warmup,
        band_level: level,
        band_est_lbs: est
      });
      continue;
    }

    const wMatch = trimmed.match(/^(\d+(\.\d+)?)\s*x\s*(\d+)\b/i);
    if (wMatch) {
      const weight_lbs = Number(wMatch[1]);
      const reps = Number(wMatch[3]);
      if (!reps || reps <= 0) {
        warnings.push(`Line ${lineNo}: reps missing/invalid.`);
        continue;
      }

      cur.sets.push({
        load_type: "weight",
        weight_lbs,
        reps,
        rpe,
        is_warmup,
        band_level: null,
        band_est_lbs: null
      });
      continue;
    }

    const bwMatch = trimmed.match(/^bw\s*x\s*(\d+)\b/i);
    if (bwMatch) {
      const reps = Number(bwMatch[1]);
      if (!reps || reps <= 0) {
        warnings.push(`Line ${lineNo}: reps missing/invalid.`);
        continue;
      }
      cur.sets.push({
        load_type: "bodyweight",
        weight_lbs: null,
        reps,
        rpe,
        is_warmup,
        band_level: null,
        band_est_lbs: null
      });
      continue;
    }

    warnings.push(`Line ${lineNo}: couldn’t parse set line: "${trimmed}". Use "135 x 6" or "Band 3 x 10".`);
  }

  pushCur();

  if (exercises.length === 0) warnings.push("No exercises/sets parsed. Check format.");
  return { session_title, day_date, exercises, warnings };
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("…");
  const [tab, setTab] = useState<"quick" | "workout" | "dash">("quick");

  // Auth
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  // Date
  const dayDate = useMemo(() => todayISO(), []);

  // Quick Log
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

  // Workout: local-first state
  const [sessions, setSessions] = useState<LocalWorkoutSession[]>([]);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [exercises, setExercises] = useState<LocalWorkoutExercise[]>([]);
  const [sets, setSets] = useState<LocalWorkoutSet[]>([]);

  // Workout UI
  const [newExerciseName, setNewExerciseName] = useState("");
  const [advanced, setAdvanced] = useState(false);

  // Per-exercise drafts
  const [draftByExerciseId, setDraftByExerciseId] = useState<Record<string, ExerciseDraft>>({});

  // Templates
  const [templates, setTemplates] = useState<LocalWorkoutTemplate[]>([]);
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const [templateExercises, setTemplateExercises] = useState<LocalWorkoutTemplateExercise[]>([]);

  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [newTemplateExerciseName, setNewTemplateExerciseName] = useState("");

  // Last numbers cache
  const [lastByExerciseName, setLastByExerciseName] = useState<Record<string, LastSetSummary | undefined>>({});

  // Backup/Restore
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  // Dashboard computed series
  const [dashBusy, setDashBusy] = useState(false);
  const [tonnageSeries, setTonnageSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [setsSeries, setSetsSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [benchSeries, setBenchSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [squatSeries, setSquatSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [dlSeries, setDlSeries] = useState<{ xLabel: string; y: number }[]>([]);

  // Import modal
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMergeIntoOpen, setImportMergeIntoOpen] = useState(false);
  const [importExcludeFromAnalytics, setImportExcludeFromAnalytics] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPlan | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  /** -----------------------------
   * Auth boot + autosync
   * ----------------------------- */
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUserId(data.user?.id ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const stop = startAutoSync(setStatus);
    return stop;
  }, [userId]);

  // Timer tick
  useEffect(() => {
    if (!timerOn) return;
    const t = window.setInterval(() => setSecs((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, [timerOn]);

  async function signUp() {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert("Account created. If email confirmation is ON, confirm then sign in.");
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setTab("quick");
    setOpenSessionId(null);
    setOpenTemplateId(null);
    setLastByExerciseName({});
    setDraftByExerciseId({});
  }

  /** -----------------------------
   * Backup / Restore
   * ----------------------------- */
  async function exportBackup() {
    try {
      setBackupBusy(true);
      const tables: Record<string, any[]> = {};
      const dexieAny = localdb as any;
      const tableList: any[] = dexieAny.tables ?? [];
      for (const t of tableList) tables[t.name as string] = await t.toArray();

      const envelope: BackupEnvelope = {
        app: "rebuild60",
        schema: 1,
        exported_at: new Date().toISOString(),
        tables
      };

      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `rebuild60-backup-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      alert("Backup exported. Save that file somewhere safe.");
    } catch (e: any) {
      console.error(e);
      alert(`Backup export failed: ${e?.message ?? String(e)}`);
    } finally {
      setBackupBusy(false);
    }
  }

  async function importBackupFile(file: File) {
    try {
      setBackupBusy(true);

      const text = await file.text();
      const parsed = JSON.parse(text) as BackupEnvelope;

      if (!parsed || parsed.app !== "rebuild60" || !parsed.tables) {
        alert("That file doesn't look like a Rebuild @ 60 backup JSON.");
        return;
      }

      const ok = confirm(
        "IMPORT will OVERWRITE your local data on this device.\n\nIf you're not 100% sure, hit Cancel and export a backup first.\n\nContinue?"
      );
      if (!ok) return;

      const dexieAny = localdb as any;
      const tableList: any[] = dexieAny.tables ?? [];
      const byName = new Map<string, any>();
      for (const t of tableList) byName.set(t.name, t);

      await localdb.transaction("rw", (localdb as any).tables, async () => {
        for (const t of tableList) await t.clear();
        for (const [tableName, rows] of Object.entries(parsed.tables)) {
          const t = byName.get(tableName);
          if (!t) continue;
          if (!Array.isArray(rows) || rows.length === 0) continue;
          await t.bulkPut(rows);
        }
      });

      setLastByExerciseName({});
      setDraftByExerciseId({});
      setOpenSessionId(null);
      setOpenTemplateId(null);

      if (userId) {
        await loadTodaySessions();
        await loadTemplates();
      }

      alert("Restore complete. If you have pending offline items, keep the app online to sync.");
    } catch (e: any) {
      console.error(e);
      alert(`Restore failed: ${e?.message ?? String(e)}`);
    } finally {
      setBackupBusy(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  }

  /** -----------------------------
   * Quick Log save
   * ----------------------------- */
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

  /** -----------------------------
   * Workout: local-first helpers
   * ----------------------------- */
  async function loadTodaySessions() {
    if (!userId) return;
    const rows = await localdb.localSessions.where({ user_id: userId, day_date: dayDate }).sortBy("started_at");
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

    setDraftByExerciseId((prev) => {
      const next = { ...prev };
      for (const e of ex) {
        if (!next[e.id]) {
          next[e.id] = {
            load_type: "weight",
            weight: "",
            reps: "",
            band_level: 3,
            band_est_override: "",
            rpe: "",
            warmup: false
          };
        }
      }
      return next;
    });
  }

  function setsForExercise(exerciseId: string) {
    return sets.filter((s) => s.exercise_id === exerciseId).sort((a, b) => a.set_number - b.set_number);
  }

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
      notes: null,
      exclude_from_analytics: false
    };

    await localdb.localSessions.put(local);

    await enqueue("create_workout", {
      id,
      user_id: userId,
      day_date: dayDate,
      started_at,
      title: local.title,
      notes: null,
      exclude_from_analytics: false
    });

    await loadTodaySessions();
    await openSession(id);
    setTab("workout");
  }

  function updateDraft(exerciseId: string, patch: Partial<ExerciseDraft>) {
    setDraftByExerciseId((prev) => {
      const cur =
        prev[exerciseId] ??
        ({
          load_type: "weight",
          weight: "",
          reps: "",
          band_level: 3,
          band_est_override: "",
          rpe: "",
          warmup: false
        } as ExerciseDraft);

      return { ...prev, [exerciseId]: { ...cur, ...patch } };
    });
  }

  async function ensureLastForExerciseName(exName: string) {
    if (lastByExerciseName[exName]) return;

    const local = await getLocalLastForExerciseName(exName, openSessionId);
    if (local) {
      setLastByExerciseName((prev) => ({ ...prev, [exName]: local }));
      return;
    }

    const cloud = await getCloudLastForExerciseName(exName);
    if (cloud) {
      setLastByExerciseName((prev) => ({ ...prev, [exName]: cloud }));
      return;
    }
  }

  function pickFirstWorkSet(setsAll: SetLite[]): SetLite | null {
    const work = setsAll.find((s) => !s.is_warmup && (s.reps ?? 0) > 0);
    return work ?? setsAll[0] ?? null;
  }
  function pickTopSet(setsAll: SetLite[]): SetLite | null {
    let best: SetLite | null = null;
    for (const s of setsAll) {
      const load = effectiveLoadLbs({ load_type: s.load_type, weight_lbs: s.weight_lbs, band_est_lbs: s.band_est_lbs }) ?? -1;
      const reps = s.reps ?? -1;
      if (!best) best = s;
      else {
        const bestLoad = effectiveLoadLbs({ load_type: best.load_type, weight_lbs: best.weight_lbs, band_est_lbs: best.band_est_lbs }) ?? -1;
        const bestReps = best.reps ?? -1;
        if (load > bestLoad) best = s;
        else if (load === bestLoad && reps > bestReps) best = s;
      }
    }
    return best;
  }

  function applyDefaultAutofill(exerciseId: string, exName: string) {
    const summary = lastByExerciseName[exName];
    if (!summary || summary.sets.length === 0) return;

    const existing = draftByExerciseId[exerciseId];
    if (existing && (existing.weight || existing.reps)) return;

    const compound = isCompoundExercise(exName);
    const chosen = compound ? pickFirstWorkSet(summary.sets) : pickTopSet(summary.sets);
    if (!chosen) return;

    if (chosen.load_type === "band") {
      updateDraft(exerciseId, {
        load_type: "band",
        reps: chosen.reps != null ? String(chosen.reps) : "",
        band_level: chosen.band_level ?? 3,
        band_est_override: ""
      });
      return;
    }

    if (chosen.load_type === "bodyweight") {
      updateDraft(exerciseId, { load_type: "bodyweight", reps: chosen.reps != null ? String(chosen.reps) : "" });
      return;
    }

    updateDraft(exerciseId, {
      load_type: "weight",
      weight: chosen.weight_lbs != null ? String(chosen.weight_lbs) : "",
      reps: chosen.reps != null ? String(chosen.reps) : ""
    });
  }

  async function addExercise() {
    if (!openSessionId) return;

    const name = newExerciseName.trim();
    if (!name) return;

    const id = uuid();
    const sort_order = exercises.length;

    const local: LocalWorkoutExercise = { id, session_id: openSessionId, name, sort_order };
    await localdb.localExercises.put(local);

    await enqueue("insert_exercise", { id, session_id: openSessionId, name, sort_order });

    setNewExerciseName("");

    setDraftByExerciseId((prev) => ({
      ...prev,
      [id]: prev[id] ?? {
        load_type: "weight",
        weight: "",
        reps: "",
        band_level: 3,
        band_est_override: "",
        rpe: "",
        warmup: false
      }
    }));

    await openSession(openSessionId);
    await ensureLastForExerciseName(name);
    applyDefaultAutofill(id, name);
  }

  /** -----------------------------
   * Set delete + renumber
   * ----------------------------- */
  async function deleteSet(setId: string, exerciseId: string) {
    const ok = confirm("Delete this set?");
    if (!ok) return;

    try {
      await localdb.localSets.delete(setId);
      await enqueue("delete_set", { set_id: setId });

      const remaining = await localdb.localSets.where({ exercise_id: exerciseId }).sortBy("set_number");
      for (let i = 0; i < remaining.length; i++) {
        const s = remaining[i];
        const newNum = i + 1;
        if (s.set_number !== newNum) await localdb.localSets.update(s.id, { set_number: newNum });
      }

      await enqueue("renumber_sets", { ordered_set_ids: remaining.map((s) => s.id) });

      if (openSessionId) await openSession(openSessionId);
    } catch (e: any) {
      console.error(e);
      alert(`Delete set failed: ${e?.message ?? String(e)}`);
    }
  }

  async function addSet(exerciseId: string) {
    const d = draftByExerciseId[exerciseId];
    if (!d) return;

    const reps = d.reps ? Number(d.reps) : null;
    if (!reps || reps <= 0) {
      alert("Reps required.");
      return;
    }

    const load_type = d.load_type;

    let weight_lbs: number | null = null;
    let band_level: number | null = null;
    let band_est_lbs: number | null = null;

    if (load_type === "weight") {
      weight_lbs = d.weight ? Number(d.weight) : null;
    } else if (load_type === "band") {
      band_level = d.band_level ?? 3;
      const defaultEst = BAND_DEFAULT_EST[band_level] ?? null;
      const override = advanced && d.band_est_override ? Number(d.band_est_override) : null;
      band_est_lbs = override ?? defaultEst;
    }

    const existing = await localdb.localSets.where({ exercise_id: exerciseId }).toArray();
    const nextSetNumber = (existing?.length ?? 0) + 1;

    const id = uuid();
    const local: LocalWorkoutSet = {
      id,
      exercise_id: exerciseId,
      set_number: nextSetNumber,

      weight_lbs,
      reps,
      rpe: advanced && d.rpe ? Number(d.rpe) : null,
      is_warmup: advanced ? !!d.warmup : false,

      load_type,
      band_level,
      band_est_lbs
    };

    await localdb.localSets.put(local);

    await enqueue("insert_set", {
      id,
      exercise_id: exerciseId,
      set_number: nextSetNumber,

      load_type,
      weight_lbs,
      reps,
      rpe: advanced && d.rpe ? Number(d.rpe) : null,
      is_warmup: advanced ? !!d.warmup : false,

      band_level,
      band_est_lbs
    });

    updateDraft(exerciseId, { weight: "", reps: "", rpe: "", warmup: false, band_est_override: "" });

    setSecs(90);
    setTimerOn(true);

    if (openSessionId) await openSession(openSessionId);

    const ex = exercises.find((e) => e.id === exerciseId);
    if (ex) {
      setLastByExerciseName((prev) => {
        const prevSummary = prev[ex.name];
        const appended: SetLite = {
          load_type,
          weight_lbs,
          reps,
          rpe: advanced && d.rpe ? Number(d.rpe) : null,
          is_warmup: advanced ? !!d.warmup : false,
          band_level,
          band_est_lbs
        };
        return {
          ...prev,
          [ex.name]: {
            source: "local",
            started_at: new Date().toISOString(),
            sets: prevSummary?.sets ? [...prevSummary.sets, appended] : [appended]
          }
        };
      });
    }
  }

  /** -----------------------------
   * Delete Session
   * ----------------------------- */
  async function deleteSession(sessionId: string) {
    const sess = sessions.find((s) => s.id === sessionId) ?? null;
    const label = sess ? `${sess.title} @ ${new Date(sess.started_at).toLocaleTimeString()}` : sessionId;

    const ok = confirm(
      `Delete this entire session (and all sets/exercises)?\n\n${label}\n\nThis removes it locally immediately and queues a cloud delete.`
    );
    if (!ok) return;

    try {
      await localdb.transaction("rw", localdb.localSessions, localdb.localExercises, localdb.localSets, async () => {
        const ex = await localdb.localExercises.where({ session_id: sessionId }).toArray();
        const exIds = ex.map((e) => e.id);
        for (const exId of exIds) await localdb.localSets.where({ exercise_id: exId }).delete();
        await localdb.localExercises.where({ session_id: sessionId }).delete();
        await localdb.localSessions.delete(sessionId);
      });

      await enqueue("delete_session", { session_id: sessionId });

      if (openSessionId === sessionId) {
        setOpenSessionId(null);
        setExercises([]);
        setSets([]);
        setDraftByExerciseId({});
      }

      await loadTodaySessions();
      alert("Session deleted (local). Will sync delete when online.");
    } catch (e: any) {
      console.error(e);
      alert(`Delete failed: ${e?.message ?? String(e)}`);
    }
  }

  /** -----------------------------
   * Templates
   * ----------------------------- */
  async function loadTemplates() {
    if (!userId) return;
    const rows = await localdb.localTemplates.where({ user_id: userId }).sortBy("created_at");
    setTemplates(rows.reverse());
  }

  async function openTemplate(templateId: string) {
    setOpenTemplateId(templateId);
    const ex = await localdb.localTemplateExercises.where({ template_id: templateId }).sortBy("sort_order");
    setTemplateExercises(ex);
  }

  async function createTemplate() {
    if (!userId) return;
    const name = newTemplateName.trim();
    if (!name) {
      alert("Template name required.");
      return;
    }

    const id = uuid();
    const created_at = new Date().toISOString();

    const local: LocalWorkoutTemplate = {
      id,
      user_id: userId,
      name,
      description: newTemplateDesc.trim() || null,
      created_at
    };

    await localdb.localTemplates.put(local);

    await enqueue("create_template", {
      id,
      user_id: userId,
      name: local.name,
      description: local.description,
      created_at
    });

    setNewTemplateName("");
    setNewTemplateDesc("");

    await loadTemplates();
    await openTemplate(id);
  }

  async function addExerciseToTemplate() {
    if (!openTemplateId) return;
    const name = newTemplateExerciseName.trim();
    if (!name) return;

    const id = uuid();
    const sort_order = templateExercises.length;

    const local: LocalWorkoutTemplateExercise = { id, template_id: openTemplateId, name, sort_order };
    await localdb.localTemplateExercises.put(local);

    await enqueue("insert_template_exercise", { id, template_id: openTemplateId, name, sort_order });

    setNewTemplateExerciseName("");
    await openTemplate(openTemplateId);
  }

  async function deleteTemplate(templateId: string) {
    const t = templates.find((x) => x.id === templateId);
    const ok = confirm(`Delete template "${t?.name ?? "Template"}" and all its exercises?`);
    if (!ok) return;

    try {
      await localdb.transaction("rw", localdb.localTemplates, localdb.localTemplateExercises, async () => {
        await localdb.localTemplateExercises.where({ template_id: templateId }).delete();
        await localdb.localTemplates.delete(templateId);
      });

      await enqueue("delete_template", { template_id: templateId });

      if (openTemplateId === templateId) {
        setOpenTemplateId(null);
        setTemplateExercises([]);
      }

      await loadTemplates();
      alert("Template deleted (local). Will sync delete when online.");
    } catch (e: any) {
      console.error(e);
      alert(`Delete template failed: ${e?.message ?? String(e)}`);
    }
  }

  async function startSessionFromTemplate() {
    if (!userId) return;
    if (!openTemplateId) {
      alert("Pick a template first.");
      return;
    }

    const t = templates.find((x) => x.id === openTemplateId) ?? null;
    const ex = await localdb.localTemplateExercises.where({ template_id: openTemplateId }).sortBy("sort_order");
    if (!t) return alert("Template not found.");
    if (ex.length === 0) return alert("Template needs at least 1 exercise.");

    const sessionId = uuid();
    const started_at = new Date().toISOString();

    const localSession: LocalWorkoutSession = {
      id: sessionId,
      user_id: userId,
      day_date: dayDate,
      started_at,
      title: t.name,
      notes: null,
      exclude_from_analytics: false
    };

    await localdb.localSessions.put(localSession);

    await enqueue("create_workout", {
      id: sessionId,
      user_id: userId,
      day_date: dayDate,
      started_at,
      title: t.name,
      notes: null,
      exclude_from_analytics: false
    });

    for (let i = 0; i < ex.length; i++) {
      const te = ex[i];
      const exerciseId = uuid();

      const localExercise: LocalWorkoutExercise = { id: exerciseId, session_id: sessionId, name: te.name, sort_order: i };
      await localdb.localExercises.put(localExercise);

      await enqueue("insert_exercise", { id: exerciseId, session_id: sessionId, name: te.name, sort_order: i });

      setDraftByExerciseId((prev) => ({
        ...prev,
        [exerciseId]:
          prev[exerciseId] ??
          ({
            load_type: "weight",
            weight: "",
            reps: "",
            band_level: 3,
            band_est_override: "",
            rpe: "",
            warmup: false
          } as ExerciseDraft)
      }));
    }

    await loadTodaySessions();
    await openSession(sessionId);
    setTab("workout");
    alert("Session created from template (instant).");
  }

  /** -----------------------------
   * Last numbers: local then cloud
   * ----------------------------- */
  async function getLocalLastForExerciseName(exName: string, excludeSessionId: string | null): Promise<LastSetSummary | null> {
    const allExercises = await localdb.localExercises.toArray();
    const matches = allExercises.filter((e) => e.name === exName && e.session_id !== excludeSessionId);
    if (matches.length === 0) return null;

    let best: { ex: LocalWorkoutExercise; started_at: string } | null = null;
    for (const e of matches) {
      const s = await localdb.localSessions.get(e.session_id);
      if (!s) continue;
      if (!best || s.started_at > best.started_at) best = { ex: e, started_at: s.started_at };
    }
    if (!best) return null;

    const ss = await localdb.localSets.where({ exercise_id: best.ex.id }).sortBy("set_number");
    if (ss.length === 0) return null;

    const all = ss.map((x) => ({
      load_type: x.load_type ?? "weight",
      weight_lbs: x.weight_lbs ?? null,
      reps: x.reps ?? null,
      rpe: x.rpe ?? null,
      is_warmup: !!x.is_warmup,
      band_level: x.band_level ?? null,
      band_est_lbs: x.band_est_lbs ?? null
    }));

    return { source: "local", started_at: best.started_at, sets: all };
  }

  async function getCloudLastForExerciseName(exName: string): Promise<LastSetSummary | null> {
    if (!userId) return null;
    if (!navigator.onLine) return null;

    const { data: sess, error: sessErr } = await supabase
      .from("workout_sessions")
      .select("id, started_at")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(30);

    if (sessErr || !sess || sess.length === 0) return null;

    const sessionIds = sess.map((s) => s.id);

    const { data: ex, error: exErr } = await supabase
      .from("workout_exercises")
      .select("id, session_id, name")
      .eq("name", exName)
      .in("session_id", sessionIds);

    if (exErr || !ex || ex.length === 0) return null;

    const sessionRank = new Map<string, number>();
    sess.forEach((s, idx) => sessionRank.set(s.id, idx));

    let best = ex[0];
    for (const e of ex) {
      const rBest = sessionRank.get(best.session_id) ?? 9999;
      const rE = sessionRank.get(e.session_id) ?? 9999;
      if (rE < rBest) best = e;
    }

    const started_at = (sess.find((s) => s.id === best.session_id)?.started_at as string) ?? new Date().toISOString();

    const { data: ss, error: ssErr } = await supabase
      .from("workout_sets")
      .select("load_type, weight_lbs, reps, rpe, is_warmup, set_number, band_level, band_est_lbs")
      .eq("exercise_id", best.id)
      .order("set_number", { ascending: true });

    if (ssErr || !ss || ss.length === 0) return null;

    const all = ss.map((x: any) => ({
      load_type: (x.load_type ?? "weight") as LoadType,
      weight_lbs: x.weight_lbs ?? null,
      reps: x.reps ?? null,
      rpe: x.rpe ?? null,
      is_warmup: !!x.is_warmup,
      band_level: x.band_level ?? null,
      band_est_lbs: x.band_est_lbs ?? null
    }));

    return { source: "cloud", started_at, sets: all };
  }

  /** -----------------------------
   * Import: preview + commit
   * ----------------------------- */
  function buildPreview() {
    const p = parseWorkoutScript(importText, dayDate);
    setImportPreview(p);
  }

  async function doImport() {
    if (!userId) return;
    const plan = importPreview ?? parseWorkoutScript(importText, dayDate);
    setImportPreview(plan);

    if (!plan.exercises.length) return alert("Nothing to import. Check format.");

    const merge = importMergeIntoOpen && !!openSessionId;

    if (importMergeIntoOpen && !openSessionId) {
      alert("Merge toggle is ON but no session is open. Open a session first, or turn merge OFF.");
      return;
    }

    setImportBusy(true);
    try {
      let targetSessionId = openSessionId ?? null;

      if (!merge) {
        targetSessionId = uuid();
        const started_at = new Date().toISOString();

        const localSession: LocalWorkoutSession = {
          id: targetSessionId,
          user_id: userId,
          day_date: plan.day_date,
          started_at,
          title: plan.session_title,
          notes: null,
          exclude_from_analytics: !!importExcludeFromAnalytics
        };

        await localdb.localSessions.put(localSession);

        await enqueue("create_workout", {
          id: targetSessionId,
          user_id: userId,
          day_date: plan.day_date,
          started_at,
          title: plan.session_title,
          notes: null,
          exclude_from_analytics: !!importExcludeFromAnalytics
        });
      }

      if (!targetSessionId) throw new Error("Missing target session id");

      const existingExercises = merge ? await localdb.localExercises.where({ session_id: targetSessionId }).toArray() : [];

      const nameToExerciseId = new Map<string, string>();
      let sortBase = existingExercises.length;

      for (const e of existingExercises) nameToExerciseId.set(e.name, e.id);

      for (const ex of plan.exercises) {
        let exerciseId = nameToExerciseId.get(ex.name) ?? null;

        if (!exerciseId) {
          exerciseId = uuid();
          const sort_order = sortBase++;
          const localExercise: LocalWorkoutExercise = {
            id: exerciseId,
            session_id: targetSessionId,
            name: ex.name,
            sort_order
          };
          await localdb.localExercises.put(localExercise);
          await enqueue("insert_exercise", { id: exerciseId, session_id: targetSessionId, name: ex.name, sort_order });
          nameToExerciseId.set(ex.name, exerciseId);

          setDraftByExerciseId((prev) => ({
            ...prev,
            [exerciseId!]:
              prev[exerciseId!] ??
              ({
                load_type: "weight",
                weight: "",
                reps: "",
                band_level: 3,
                band_est_override: "",
                rpe: "",
                warmup: false
              } as ExerciseDraft)
          }));
        }

        const existingSets = await localdb.localSets.where({ exercise_id: exerciseId }).toArray();
        let nextSetNumber = (existingSets?.length ?? 0) + 1;

        for (const s of ex.sets) {
          const setId = uuid();

          const localSet: LocalWorkoutSet = {
            id: setId,
            exercise_id: exerciseId,
            set_number: nextSetNumber++,

            load_type: s.load_type,
            weight_lbs: s.weight_lbs,
            reps: s.reps,
            rpe: s.rpe,
            is_warmup: s.is_warmup,

            band_level: s.band_level,
            band_est_lbs: s.band_est_lbs
          };

          await localdb.localSets.put(localSet);

          await enqueue("insert_set", {
            id: setId,
            exercise_id: exerciseId,
            set_number: localSet.set_number,

            load_type: localSet.load_type,
            weight_lbs: localSet.weight_lbs,
            reps: localSet.reps,
            rpe: localSet.rpe,
            is_warmup: localSet.is_warmup,

            band_level: localSet.band_level,
            band_est_lbs: localSet.band_est_lbs
          });
        }
      }

      setTab("workout");
      await loadTodaySessions();
      await openSession(targetSessionId);

      setImportOpen(false);
      setImportText("");
      setImportPreview(null);
      setImportMergeIntoOpen(false);
      setImportExcludeFromAnalytics(false);

      alert(`Imported: ${plan.exercises.length} exercises, ${plan.exercises.reduce((a, e) => a + e.sets.length, 0)} sets.`);
    } catch (e: any) {
      console.error(e);
      alert(`Import failed: ${e?.message ?? String(e)}`);
    } finally {
      setImportBusy(false);
    }
  }

  /** -----------------------------
   * Dashboard computations (local, offline)
   * ----------------------------- */
  async function refreshDashboard() {
    if (!userId) return;
    setDashBusy(true);
    try {
      const allSessions = await localdb.localSessions.where({ user_id: userId }).toArray();

      const allowedSessionIds = new Set<string>(allSessions.filter((s) => !s.exclude_from_analytics).map((s) => s.id));

      const sessionDay = new Map<string, string>();
      for (const s of allSessions) {
        if (!allowedSessionIds.has(s.id)) continue;
        const day = s.day_date || isoToDay(s.started_at);
        sessionDay.set(s.id, day);
      }

      const allExercises = await localdb.localExercises.toArray();
      const allSets = await localdb.localSets.toArray();

      const exInfo = new Map<string, { session_id: string; name: string }>();
      for (const e of allExercises) {
        if (!allowedSessionIds.has(e.session_id)) continue;
        exInfo.set(e.id, { session_id: e.session_id, name: e.name });
      }

      const tonnageByDay = new Map<string, number>();
      const setsByDay = new Map<string, number>();

      const bestBenchE1RM = new Map<string, number>();
      const bestSquatE1RM = new Map<string, number>();
      const bestDlE1RM = new Map<string, number>();

      const bumpMax = (map: Map<string, number>, day: string, val: number) => {
        const cur = map.get(day);
        if (cur == null || val > cur) map.set(day, val);
      };

      for (const s of allSets) {
        const info = exInfo.get(s.exercise_id);
        if (!info) continue;
        const day = sessionDay.get(info.session_id);
        if (!day) continue;

        setsByDay.set(day, (setsByDay.get(day) ?? 0) + 1);

        const reps = s.reps ?? 0;
        const load = effectiveLoadLbs({
          load_type: s.load_type ?? "weight",
          weight_lbs: s.weight_lbs ?? null,
          band_est_lbs: s.band_est_lbs ?? null
        });

        if (load != null && load > 0 && reps > 0) {
          tonnageByDay.set(day, (tonnageByDay.get(day) ?? 0) + load * reps);

          if (s.is_warmup) continue;

          const n = info.name.toLowerCase();
          const e1 = oneRmEpley(load, reps);

          if (n.includes("bench")) bumpMax(bestBenchE1RM, day, e1);
          if (n.includes("squat")) bumpMax(bestSquatE1RM, day, e1);
          if (n.includes("deadlift") || n === "dl") bumpMax(bestDlE1RM, day, e1);
        }
      }

      const end = new Date();
      const days: string[] = [];
      for (let i = 27; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(end.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        days.push(`${yyyy}-${mm}-${dd}`);
      }

      setTonnageSeries(days.map((d) => ({ xLabel: d.slice(5), y: Math.round(tonnageByDay.get(d) ?? 0) })));
      setSetsSeries(days.map((d) => ({ xLabel: d.slice(5), y: setsByDay.get(d) ?? 0 })));

      setBenchSeries(
        days.filter((d) => bestBenchE1RM.get(d) != null).map((d) => ({ xLabel: d.slice(5), y: bestBenchE1RM.get(d)! }))
      );
      setSquatSeries(
        days.filter((d) => bestSquatE1RM.get(d) != null).map((d) => ({ xLabel: d.slice(5), y: bestSquatE1RM.get(d)! }))
      );
      setDlSeries(
        days.filter((d) => bestDlE1RM.get(d) != null).map((d) => ({ xLabel: d.slice(5), y: bestDlE1RM.get(d)! }))
      );
    } finally {
      setDashBusy(false);
    }
  }

  /** -----------------------------
   * Effects
   * ----------------------------- */
  useEffect(() => {
    if (!userId) return;
    loadTodaySessions();
    loadTemplates();
  }, [userId]);

  useEffect(() => {
    if (!openSessionId) return;
    (async () => {
      for (const ex of exercises) {
        await ensureLastForExerciseName(ex.name);
        applyDefaultAutofill(ex.id, ex.name);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSessionId, exercises.length]);

  useEffect(() => {
    if (!userId) return;
    if (tab !== "dash") return;
    void refreshDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, userId]);

  /** -----------------------------
   * Render
   * ----------------------------- */
  if (loading) return <div style={{ padding: 20 }}>Loading…</div>;

  if (!userId) {
    return (
      <div style={{ padding: 20, maxWidth: 520 }}>
        <h2>Rebuild @ 60 Tracker</h2>
        <p>Login for private, offline-first logging.</p>

        <input
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10 }}
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 10, marginBottom: 10 }}
        />

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={signIn}>Sign In</button>
          <button onClick={signUp}>Sign Up</button>
        </div>
      </div>
    );
  }

  // --- render helper bits below (UI) ---
  const openSessionObj = sessions.find((s) => s.id === openSessionId) ?? null;
  const openTemplateObj = templates.find((t) => t.id === openTemplateId) ?? null;

  return (
    <div style={{ padding: 20, maxWidth: 950 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Rebuild @ 60 Tracker</h2>
        <button onClick={signOut}>Sign Out</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div>
          <b>Today:</b> {dayDate} (Week 1 Day 1)
        </div>
        <div>
          <b>Status:</b> {navigator.onLine ? status : "Offline (logging still works)"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={() => setTab("quick")} disabled={tab === "quick"}>
          Quick Log
        </button>
        <button
          onClick={() => {
            setTab("workout");
            loadTodaySessions();
            loadTemplates();
          }}
          disabled={tab === "workout"}
        >
          Workout
        </button>
        <button onClick={() => setTab("dash")} disabled={tab === "dash"}>
          Dashboard
        </button>
      </div>

      <hr />

      {tab === "dash" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
            <h3 style={{ margin: 0 }}>Dashboard</h3>
            <button onClick={refreshDashboard} disabled={dashBusy}>
              {dashBusy ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>
            Built from your <b>local</b> workout history (works offline). Planned/test sessions are excluded. Warmups are excluded from e1RM charts.
          </div>

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
        </>
      )}

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

          <h3>Backup / Restore</h3>
          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={exportBackup} disabled={backupBusy}>
                {backupBusy ? "Working…" : "Export Backup (.json)"}
              </button>

              <button onClick={() => importFileRef.current?.click()} disabled={backupBusy} title="Import will overwrite local data on this device">
                {backupBusy ? "Working…" : "Import Backup (.json)"}
              </button>

              <input
                ref={importFileRef}
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importBackupFile(f);
                }}
              />
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8, lineHeight: 1.4 }}>
              Export after big changes. Save it somewhere safe.
            </div>
          </div>

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
            <button onClick={() => setTimerOn((v) => !v)}>{timerOn ? "Pause" : "Resume"}</button>
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
        </>
      )}

      {tab === "workout" && (
        <>
          <h3>Workout Logger</h3>

          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => {
                setImportOpen(true);
                setImportMergeIntoOpen(false);
                setImportExcludeFromAnalytics(false);
                setImportPreview(null);
              }}
            >
              Import Workout
            </button>
          </div>

          {importOpen && (
            <div style={{ border: "2px solid #111", borderRadius: 12, padding: 12, marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Import Workout</div>
                <button
                  onClick={() => {
                    setImportOpen(false);
                    setImportPreview(null);
                  }}
                >
                  Close
                </button>
              </div>

              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6, lineHeight: 1.4 }}>
                Format:
                <div
                  style={{
                    fontFamily: "monospace",
                    whiteSpace: "pre-wrap",
                    marginTop: 6,
                    border: "1px solid #ddd",
                    borderRadius: 8,
                    padding: 8
                  }}
                >
                  {`SESSION: Lower A
DATE: ${dayDate}

Leverage Squat
  95 x 5 WU
  115 x 5 WU
  135 x 6 @8

Band OHP
  Band 3 x 10
  Band 3 (~35) x 10`}
                </div>
              </div>

              <textarea
                placeholder="Paste workout script here…"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                style={{ width: "100%", marginTop: 10, height: 180 }}
              />

              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={importMergeIntoOpen}
                    onChange={(e) => setImportMergeIntoOpen(e.target.checked)}
                  />
                  Merge into currently open session (Option 2). Otherwise creates a NEW session (default).
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={importExcludeFromAnalytics}
                    onChange={(e) => setImportExcludeFromAnalytics(e.target.checked)}
                  />
                  Mark imported session as planned/test (exclude from analytics)
                </label>
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <button onClick={buildPreview} disabled={!importText.trim() || importBusy}>
                  Preview Import
                </button>
                <button onClick={doImport} disabled={!importText.trim() || importBusy}>
                  {importBusy ? "Importing…" : "Import Now"}
                </button>
              </div>

              {importPreview && (
                <div style={{ marginTop: 12, borderTop: "1px solid #ddd", paddingTop: 10 }}>
                  <div style={{ fontWeight: 800 }}>
                    Preview → {importPreview.session_title} ({importPreview.day_date})
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                    Exercises: <b>{importPreview.exercises.length}</b> · Sets:{" "}
                    <b>{importPreview.exercises.reduce((a, e) => a + e.sets.length, 0)}</b>
                  </div>

                  <div style={{ marginTop: 8 }}>
                    {importPreview.exercises.map((ex, i) => (
                      <div key={i} style={{ marginTop: 8 }}>
                        <div style={{ fontWeight: 800 }}>{ex.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>
                          {ex.sets.map((s, j) => (
                            <span key={j}>
                              {formatSet({
                                load_type: s.load_type,
                                weight_lbs: s.weight_lbs,
                                reps: s.reps,
                                rpe: s.rpe,
                                is_warmup: s.is_warmup,
                                band_level: s.band_level,
                                band_est_lbs: s.band_est_lbs
                              })}
                              {j < ex.sets.length - 1 ? ", " : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {importPreview.warnings.length > 0 && (
                    <div style={{ marginTop: 10, padding: 10, border: "1px solid #f0c", borderRadius: 10 }}>
                      <div style={{ fontWeight: 800 }}>Warnings</div>
                      <ul style={{ marginTop: 6 }}>
                        {importPreview.warnings.slice(0, 20).map((w, i) => (
                          <li key={i} style={{ fontSize: 12 }}>
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginTop: 10 }}>
            <h4 style={{ marginTop: 0 }}>Templates</h4>

            <div style={{ display: "grid", gap: 8 }}>
              <input placeholder="New template name (e.g., Lower A)" value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} />
              <input placeholder="Description (optional)" value={newTemplateDesc} onChange={(e) => setNewTemplateDesc(e.target.value)} />
              <button onClick={createTemplate}>Create Template</button>
            </div>

            {templates.length > 0 && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => openTemplate(t.id)}
                    style={{
                      textAlign: "left",
                      padding: 10,
                      border: t.id === openTemplateId ? "2px solid black" : "1px solid #ccc",
                      borderRadius: 8
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{t.name}</div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>{t.description ?? ""}</div>
                  </button>
                ))}
              </div>
            )}

            {openTemplateId && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                  <div style={{ fontWeight: 800 }}>{openTemplateObj?.name ?? "Template"}</div>
                  <button onClick={() => deleteTemplate(openTemplateId)} title="Delete this template">
                    Delete Template
                  </button>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                  <input
                    placeholder="Add exercise to template"
                    value={newTemplateExerciseName}
                    onChange={(e) => setNewTemplateExerciseName(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button onClick={addExerciseToTemplate}>Add</button>
                </div>

                {templateExercises.length > 0 && (
                  <div style={{ marginTop: 10, opacity: 0.9 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Template exercises</div>
                    <ol>
                      {templateExercises
                        .slice()
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((e) => (
                          <li key={e.id}>{e.name}</li>
                        ))}
                    </ol>
                  </div>
                )}

                <button onClick={startSessionFromTemplate} style={{ marginTop: 10 }}>
                  Start Session from Template
                </button>
              </div>
            )}
          </div>

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
                      <div style={{ fontWeight: 700 }}>
                        {s.title} {s.exclude_from_analytics ? <span style={{ fontSize: 11, opacity: 0.7 }}>(planned/test)</span> : null}
                      </div>
                      <div style={{ opacity: 0.8, fontSize: 12 }}>{new Date(s.started_at).toLocaleTimeString()}</div>
                    </button>

                    <button onClick={() => deleteSession(s.id)} title="Delete session (and all sets)">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {openSessionObj && (
            <>
              <hr />
              <h4 style={{ marginBottom: 6 }}>
                {openSessionObj.title}{" "}
                {openSessionObj.exclude_from_analytics ? <span style={{ fontSize: 12, opacity: 0.7 }}>(planned/test excluded)</span> : null}
              </h4>

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
                  Advanced (RPE + Warmup + Band estimate override)
                </label>
              </div>

              {exercises.length === 0 ? (
                <p style={{ marginTop: 12 }}>Add your first exercise and start logging sets.</p>
              ) : (
                <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                  {exercises.map((ex) => {
                    const exSets = setsForExercise(ex.id);
                    const lastSummary = lastByExerciseName[ex.name];
                    const preview = lastSummary?.sets ? lastSummary.sets.slice(-3) : [];
                    const d = draftByExerciseId[ex.id];
                    const compound = isCompoundExercise(ex.name);
                    const defaultLabel = compound ? "Default: 1st work" : "Default: top set";
                    if (!d) return null;

                    return (
                      <div key={ex.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <div style={{ fontWeight: 800 }}>
                            {ex.name}{" "}
                            <span style={{ fontSize: 12, opacity: 0.7, fontWeight: 600 }}>({defaultLabel})</span>
                          </div>
                          <button onClick={() => ensureLastForExerciseName(ex.name)} style={{ padding: "6px 10px" }}>
                            Refresh
                          </button>
                        </div>

                        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>
                          {lastSummary ? (
                            <div>
                              <b>Last ({lastSummary.source}):</b>{" "}
                              {preview.map((s, i) => (
                                <span key={i}>
                                  {formatSet(s)}
                                  {i < preview.length - 1 ? ", " : ""}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div style={{ opacity: 0.7 }}>
                              <b>Last:</b> (none yet)
                            </div>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                          <button onClick={() => updateDraft(ex.id, { load_type: "weight" })} style={{ fontWeight: d.load_type === "weight" ? 800 : 400 }}>
                            Weight
                          </button>
                          <button onClick={() => updateDraft(ex.id, { load_type: "band" })} style={{ fontWeight: d.load_type === "band" ? 800 : 400 }}>
                            Band
                          </button>
                          <button
                            onClick={() => updateDraft(ex.id, { load_type: "bodyweight" })}
                            style={{ fontWeight: d.load_type === "bodyweight" ? 800 : 400 }}
                          >
                            BW
                          </button>
                        </div>

                        {d.load_type === "weight" && (
                          <div style={{ display: "grid", gridTemplateColumns: advanced ? "repeat(4, 1fr)" : "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
                            <input placeholder="Weight" value={d.weight} onChange={(e) => updateDraft(ex.id, { weight: e.target.value })} />
                            <input placeholder="Reps" value={d.reps} onChange={(e) => updateDraft(ex.id, { reps: e.target.value })} />
                            {advanced && <input placeholder="RPE" value={d.rpe} onChange={(e) => updateDraft(ex.id, { rpe: e.target.value })} />}
                            <button onClick={() => addSet(ex.id)}>Save Set</button>
                          </div>
                        )}

                        {d.load_type === "band" && (
                          <>
                            <div style={{ display: "grid", gridTemplateColumns: advanced ? "repeat(4, 1fr)" : "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
                              <select value={String(d.band_level)} onChange={(e) => updateDraft(ex.id, { band_level: Number(e.target.value) })}>
                                <option value="1">Band 1</option>
                                <option value="2">Band 2</option>
                                <option value="3">Band 3</option>
                                <option value="4">Band 4</option>
                                <option value="5">Band 5</option>
                              </select>

                              <input placeholder="Reps" value={d.reps} onChange={(e) => updateDraft(ex.id, { reps: e.target.value })} />

                              {advanced ? (
                                <input
                                  placeholder={`Est lbs (default ${BAND_DEFAULT_EST[d.band_level] ?? "?"})`}
                                  value={d.band_est_override}
                                  onChange={(e) => updateDraft(ex.id, { band_est_override: e.target.value })}
                                />
                              ) : (
                                <div style={{ fontSize: 12, opacity: 0.75, display: "flex", alignItems: "center" }}>
                                  Est: ~{BAND_DEFAULT_EST[d.band_level] ?? "?"} lb
                                </div>
                              )}

                              <button onClick={() => addSet(ex.id)}>Save Set</button>
                            </div>

                            {advanced && (
                              <input placeholder="RPE" value={d.rpe} onChange={(e) => updateDraft(ex.id, { rpe: e.target.value })} style={{ marginTop: 8, width: "100%" }} />
                            )}
                          </>
                        )}

                        {d.load_type === "bodyweight" && (
                          <div style={{ display: "grid", gridTemplateColumns: advanced ? "repeat(3, 1fr)" : "repeat(2, 1fr)", gap: 8, marginTop: 10 }}>
                            <input placeholder="Reps" value={d.reps} onChange={(e) => updateDraft(ex.id, { reps: e.target.value })} />
                            {advanced && <input placeholder="RPE" value={d.rpe} onChange={(e) => updateDraft(ex.id, { rpe: e.target.value })} />}
                            <button onClick={() => addSet(ex.id)}>Save Set</button>
                          </div>
                        )}

                        {advanced && (
                          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                            <input type="checkbox" checked={d.warmup} onChange={(e) => updateDraft(ex.id, { warmup: e.target.checked })} />
                            Warmup set
                          </label>
                        )}

                        {exSets.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Sets (today)</div>
                            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                              {exSets.map((s) => {
                                const load = effectiveLoadLbs({
                                  load_type: s.load_type ?? "weight",
                                  weight_lbs: s.weight_lbs ?? null,
                                  band_est_lbs: s.band_est_lbs ?? null
                                });

                                const est =
                                  !s.is_warmup && load != null && s.reps != null && s.reps > 0 ? oneRmEpley(Number(load), Number(s.reps)) : null;

                                return (
                                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                                    <div style={{ flex: 1 }}>
                                      <b>{s.set_number}.</b>{" "}
                                      {s.load_type === "band"
                                        ? `Band ${s.band_level ?? "?"} (~${s.band_est_lbs ?? BAND_DEFAULT_EST[s.band_level ?? 3] ?? "?"}lb)`
                                        : s.load_type === "bodyweight"
                                          ? "BW"
                                          : `${s.weight_lbs ?? "—"} lb`}{" "}
                                      x {s.reps ?? "—"}
                                      {s.is_warmup ? " (WU)" : ""}
                                      {s.rpe != null ? ` @RPE ${s.rpe}` : ""}
                                    </div>

                                    <div style={{ opacity: 0.75, minWidth: 90, textAlign: "right" }}>
                                      {est ? `~1RM ${est}` : ""}
                                    </div>

                                    <button onClick={() => deleteSet(s.id, ex.id)} style={{ marginLeft: 8 }}>
                                      Delete
                                    </button>
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
                <button onClick={() => setTimerOn((v) => !v)}>{timerOn ? "Pause" : "Resume"}</button>
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
            </>
          )}
        </>
      )}
    </div>
  );
}

