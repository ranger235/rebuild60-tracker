import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { enqueue, startAutoSync } from "./sync";
import {
  localdb,
  type LocalWorkoutExercise,
  type LocalWorkoutSession,
  type LocalWorkoutSet,
  type LocalWorkoutTemplate,
  type LocalWorkoutTemplateExercise
} from "./localdb";
import { CoachBoundary } from "./CoachPanel";
import DashboardView from "./components/DashboardView";

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
  // best-effort: ISO string -> YYYY-MM-DD
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


// -----------------------------
// Exercise name normalization + aliases
// -----------------------------
function normalizeExerciseName(raw: string): string {
  return (raw || "")
    .toLowerCase()
    .trim()
    .replace(/[_\-]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Compact key used for lookups (Last numbers, analytics buckets, etc.)
function exerciseKey(raw: string): string {
  const n = normalizeExerciseName(raw).replace(/\s+/g, "");
  // Common shorthands / aliases first (canonical keys)
  if (n === "rdl") return "romaniandeadlift";
  if (n === "dl") return "deadlift";
  if (n === "bp") return "benchpress";
  if (n === "ohp") return "overheadpress";

  // Bench variations
  if (n === "flatbench" || n === "flatbenchpress" || n === "barbellbench" || n === "barbellbenchpress")
    return "benchpress";
  if (n === "dbbench" || n === "dbbenchpress" || n === "dumbbellbench" || n === "dumbbellbenchpress" || n === "dbbp")
    return "dumbbellbenchpress";

  // Squat variations
  if (
    n === "ssbsquat" ||
    n === "ssbsquats" ||
    n === "safetysquatbar" ||
    n === "safetysquatbarsquat" ||
    n === "safetysquatbarsquats"
  )
    return "ssbsquat";
  if (n === "splitsquat" || n === "splitsquats") return "splitsquat";

  return n;
}

// Display name (what the UI shows)
function displayExerciseName(raw: string): string {
  const k = exerciseKey(raw);
  if (k === "romaniandeadlift") return "Romanian Deadlift";
  if (k === "deadlift") return "Deadlift";
  if (k === "benchpress") return "Bench Press";
  if (k === "dumbbellbenchpress") return "DB Bench Press";
  if (k === "overheadpress") return "Overhead Press";
  if (k === "ssbsquat") return "SSB Squat";
  if (k === "splitsquat") return "Split Squat";
  // Keep user's original casing if it's not a known alias
  return raw;
}

// When the user types a known alias as the full name, store the expanded canonical name.
// (Prevents separate histories like "RDL" vs "Romanian Deadlift".)
function canonicalizeExerciseInput(raw: string): string {
  const trimmed = (raw || "").trim();
  if (!trimmed) return trimmed;
  const k = exerciseKey(trimmed);

  // If user typed only an alias as the full exercise name, store the canonical display name.
  // This prevents split histories like "RDL" vs "Romanian Deadlift".
  if (k === "romaniandeadlift") return "Romanian Deadlift";
  if (k === "deadlift") return "Deadlift";
  if (k === "benchpress") return "Bench Press";
  if (k === "dumbbellbenchpress") return "DB Bench Press";
  if (k === "overheadpress") return "Overhead Press";
  if (k === "ssbsquat") return "SSB Squat";
  if (k === "splitsquat") return "Split Squat";

  return trimmed;
}

function isBenchName(name: string): boolean {
  const k = exerciseKey(name);
  const n = normalizeExerciseName(name);
  return k === "benchpress" || k === "dumbbellbenchpress" || n.includes("bench");
}
function isSquatName(name: string): boolean {
  const n = normalizeExerciseName(name);
  return n.includes("squat");
}
function isDeadliftName(name: string): boolean {
  const k = exerciseKey(name);
  const n = normalizeExerciseName(name);
  // include RDL as a deadlift-family movement for the DL trend line
  return k === "deadlift" || k === "romaniandeadlift" || n.includes("deadlift") || n === "dl" || n === "rdl";
}

type SetLite = {
  load_type?: "weight" | "band" | "bodyweight" | null;
  weight_lbs: number | null;
  band_level?: number | null;
  band_mode?: "assist" | "resist" | null;
  band_config?: "single" | "doubled" | null;
  band_est_lbs?: number | null;
  reps: number | null;
  rpe: number | null;
  is_warmup: boolean;
};

type LastSetSummary = {
  source: "local" | "cloud";
  started_at: string;
  sets: SetLite[];
};

type ExerciseDraft = {
  loadType: "weight" | "band" | "bodyweight";
  weight: string; // used for loadType=weight
  bandLevel: string; // 1..5 when loadType=band
  bandMode: "assist" | "resist";
  bandConfig: "single" | "doubled";
  bandEst: string; // optional override
  reps: string;
  rpe: string;
  warmup: boolean;
};

function formatSet(s: SetLite) {
  const r = s.reps ?? "—";
  const wu = s.is_warmup ? " WU" : "";
  const rpe = s.rpe != null ? ` @${s.rpe}` : "";

  const lt = (s.load_type ?? "weight") as "weight" | "band" | "bodyweight";
  if (lt === "bodyweight") {
    return `BW x${r}${wu}${rpe}`;
  }
  if (lt === "band") {
    const lvl = s.band_level ?? "—";
    const mode = s.band_mode === "assist" ? "A" : "R";
    const cfg = s.band_config === "doubled" ? "D" : "S";
    const est =
      s.band_est_lbs != null
        ? Number(s.band_est_lbs)
        : (() => {
            const m = bandEquivMapRef.current?.[String(lvl)];
            return typeof m === "number" ? m : null;
          })();
    const estTxt = est != null ? `~${est}` : "";
    return `B${lvl}${mode}${cfg}${estTxt} x${r}${wu}${rpe}`;
  }

  const w = s.weight_lbs ?? "—";
  return `${w}x${r}${wu}${rpe}`;
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

// -----------------------------
// Simple SVG sparkline / line chart
export default function App() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("…");
  const [tab, setTab] = useState<"quick" | "workout" | "dash">("quick");

  // Auth
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  // Date
  const [selectedDayDate, setSelectedDayDate] = useState(todayISO());

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
  const [coachEnabled, setCoachEnabled] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("rebuild60:coachEnabled");
      if (v === "0") return false;
      if (v === "1") return true;
      return true;
    } catch {
      return true;
    }
  });



// Band equivalent lbs calibration (user editable)
const [bandEquivMap, setBandEquivMap] = useState<Record<string, number>>({
  "1": 10,
  "2": 20,
  "3": 30,
  "4": 40,
  "5": 50
});
const bandEquivMapRef = useRef<Record<string, number>>(bandEquivMap);
useEffect(() => {
  bandEquivMapRef.current = bandEquivMap;
}, [bandEquivMap]);

async function loadBandEquiv() {
  if (!userId) return;
  const row = await localdb.localSettings.get([userId, "band_equiv_v1"]);
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value);
      if (parsed && typeof parsed === "object") {
        const next: Record<string, number> = { ...bandEquivMap };
        for (const k of ["1", "2", "3", "4", "5"]) {
          const v = (parsed as any)[k];
          if (typeof v === "number" && isFinite(v)) next[k] = v;
        }
        setBandEquivMap(next);
      }
    } catch {
      // ignore
    }
  }
}

async function saveBandEquiv(next: Record<string, number>) {
  if (!userId) return;
  const updatedAt = Date.now();
  await localdb.localSettings.put({
    user_id: userId,
    key: "band_equiv_v1",
    value: JSON.stringify(next),
    updatedAt
  });
  setBandEquivMap(next);
}

useEffect(() => {
  // load persisted band equivalence map for this user
  loadBandEquiv();
}, [userId]);

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
  type WeeklyCoach = {
    thisWeekStart: string;
    thisWeekEnd: string;
    sessionsThis: number;
    sessionsPrev: number;
    tonnageThis: number;
    tonnagePrev: number;
    setsThis: number;
    setsPrev: number;
    benchBest?: number;
    squatBest?: number;
    dlBest?: number;
    coachLine: string;
  };

  const [weeklyCoach, setWeeklyCoach] = useState<WeeklyCoach | null>(null);

  type AiCoach = { text: string; ts: number; model: string };
  const [aiCoach, setAiCoach] = useState<AiCoach | null>(null);
  const [aiCoachBusy, setAiCoachBusy] = useState(false);
  const [aiCoachErr, setAiCoachErr] = useState<string | null>(null);

  const [tonnageSeries, setTonnageSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [setsSeries, setSetsSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [benchSeries, setBenchSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [squatSeries, setSquatSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [dlSeries, setDlSeries] = useState<{ xLabel: string; y: number }[]>([]);
  // Quick Log trend series (last 28 days)
  const [weightSeries, setWeightSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [waistSeries, setWaistSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [sleepSeries, setSleepSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [calSeries, setCalSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [proteinSeries, setProteinSeries] = useState<{ xLabel: string; y: number }[]>([]);
  const [z2Series, setZ2Series] = useState<{ xLabel: string; y: number }[]>([]);


  // -----------------------------
  // Auth boot + autosync
  // -----------------------------
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

  useEffect(() => {
    if (!userId) return;
    void loadBandEquiv();
  }, [userId]);


  // AI Coach Add-on: load cached weekly AI coach from localStorage
  useEffect(() => {
    if (!userId || !weeklyCoach) return;
    const key = `aiCoach:${userId}:${weeklyCoach.thisWeekStart}`;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        setAiCoach(null);
        return;
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.text === "string") setAiCoach(parsed);
      else setAiCoach(null);
    } catch {
      setAiCoach(null);
    }
  }, [userId, weeklyCoach?.thisWeekStart]);


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

  // -----------------------------
  // Backup / Restore
  // -----------------------------
  async function exportBackup() {
    try {
      setBackupBusy(true);

      const tables: Record<string, any[]> = {};
      const dexieAny = localdb as any;
      const tableList: any[] = dexieAny.tables ?? [];

      for (const t of tableList) {
        const name = t.name as string;
        tables[name] = await t.toArray();
      }

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
        await loadSessionsForDay(selectedDayDate);
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

  // -----------------------------
  // Quick Log save (offline-safe)
  // -----------------------------
  
  async function refreshAiCoach(force = false) {
    if (!userId || !weeklyCoach) return;
    setAiCoachErr(null);

    const key = `aiCoach:${userId}:${weeklyCoach.thisWeekStart}`;
    const lastKey = key + ":last";
    const now = Date.now();
    const last = Number(localStorage.getItem(lastKey) || "0");
    const sixHours = 6 * 60 * 60 * 1000;
    if (!force && last && now - last < sixHours) {
      setAiCoachErr("AI Coach is rate-limited (6h). Use Force Refresh if you really need it.");
      return;
    }

    setAiCoachBusy(true);
    try {
      const payload = {
        user_id: userId,
        week: {
          start: weeklyCoach.thisWeekStart,
          end: weeklyCoach.thisWeekEnd
        },
        coach_core: weeklyCoach,
        quick_log_today: {
          day_date: selectedDayDate,
          weight_lbs: weight ? Number(weight) : null,
          waist_in: waist ? Number(waist) : null,
          sleep_hours: sleepHours ? Number(sleepHours) : null,
          calories: calories ? Number(calories) : null,
          protein_g: protein ? Number(protein) : null,
          zone2_minutes: z2Minutes ? Number(z2Minutes) : null,
          notes: notes || null
        }
      };

      const resp = await fetch("/.netlify/functions/coach-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error || `AI coach error (${resp.status})`);
      }

      const ai: AiCoach = { text: String(data.text || ""), ts: Number(data.ts || Date.now()), model: String(data.model || "gpt-5.2") };
      setAiCoach(ai);
      localStorage.setItem(key, JSON.stringify(ai));
      localStorage.setItem(lastKey, String(now));
    } catch (e: any) {
      setAiCoachErr(e?.message || "AI coach failed.");
    } finally {
      setAiCoachBusy(false);
    }
  }


async function saveQuickLog() {
    if (!userId) return;

    const day = selectedDayDate;
    const nowIso = new Date().toISOString();

    // 1) Local-first: overwrite the ONE daily snapshot for this day.
    // Use a transaction so Dashboard trends can never see a half-updated state.
    await localdb.transaction('rw', localdb.dailyMetrics, localdb.nutritionDaily, localdb.zone2Daily, async () => {
      await localdb.dailyMetrics.put({
        user_id: userId,
        day_date: day,
        weight_lbs: weight ? Number(weight) : null,
        waist_in: waist ? Number(waist) : null,
        sleep_hours: sleepHours ? Number(sleepHours) : null,
        notes: notes || null,
        updatedAt: nowIso
      } as any);

      await localdb.nutritionDaily.put({
        user_id: userId,
        day_date: day,
        calories: calories ? Number(calories) : null,
        protein_g: protein ? Number(protein) : null,
        updatedAt: nowIso
      } as any);

      if (z2Minutes && String(z2Minutes).trim() !== "") {
        await localdb.zone2Daily.put({
          user_id: userId,
          day_date: day,
          modality: "Walk",
          minutes: Number(z2Minutes),
          updatedAt: nowIso
        } as any);
      } else {
        // If user clears Zone 2, reflect that locally.
        await localdb.zone2Daily.delete([userId, day]);
      }
    });

    // 2) Queue cloud sync ops (best-effort). Even if this fails, local is already correct.
    try {
      await enqueue("upsert_daily", {
        user_id: userId,
        day_date: day,
        weight_lbs: weight ? Number(weight) : null,
        waist_in: waist ? Number(waist) : null,
        sleep_hours: sleepHours ? Number(sleepHours) : null,
        notes: notes || null
      });

      await enqueue("upsert_nutrition", {
        user_id: userId,
        day_date: day,
        calories: calories ? Number(calories) : null,
        protein_g: protein ? Number(protein) : null
      });

      if (z2Minutes && String(z2Minutes).trim() !== "") {
        await enqueue("insert_zone2", {
          user_id: userId,
          day_date: day,
          modality: "Walk",
          minutes: Number(z2Minutes)
        });
      } else {
        // Optional: if you want clearing Zone 2 to delete in Supabase too, we can add a delete op.
        // For now, keep it simple: local reflects cleared; cloud will update next time you write a value.
      }
    } catch (e) {
      console.warn("Quick Log saved locally, but queueing sync ops failed:", e);
    }

    // 3) Force UI to re-read local data and refresh Dashboard trend series.
    try {
      await refreshDashboard();
    } catch (e) {
      console.warn("refreshDashboard failed after Quick Log save:", e);
    }

    alert(`Saved for ${day}. (Local-first) Will sync when online.`);
  }

  // -----------------------------
  // Workout: local-first helpers
  // -----------------------------
  async function loadSessionsForDay(day: string) {
    if (!userId) return;
    const rows = await localdb.localSessions
      .where({ user_id: userId, day_date: day })
      .sortBy("started_at");
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
        if (!next[e.id]) next[e.id] = { loadType: "weight", weight: "", bandLevel: "3", bandMode: "resist", bandConfig: "single", bandEst: "", reps: "", rpe: "", warmup: false };
      }
      return next;
    });
  }

  function setsForExercise(exerciseId: string) {
    return sets
      .filter((s) => s.exercise_id === exerciseId)
      .sort((a, b) => a.set_number - b.set_number);
  }

  async function createWorkoutSession() {
    if (!userId) return;

    const id = uuid();
    const started_at = new Date().toISOString();

    const local: LocalWorkoutSession = {
      id,
      user_id: userId,
      day_date: selectedDayDate,
      started_at,
      title: "Week 1 Day 1",
      notes: null
    };

    await localdb.localSessions.put(local);

    await enqueue("create_workout", {
      id,
      user_id: userId,
      day_date: selectedDayDate,
      started_at,
      title: local.title,
      notes: null
    });

    await loadSessionsForDay(selectedDayDate);
    await openSession(id);
    setTab("workout");
  }

  function updateDraft(exerciseId: string, patch: Partial<ExerciseDraft>) {
    setDraftByExerciseId((prev) => ({
      ...prev,
      [exerciseId]: { ...(prev[exerciseId] ?? { loadType: "weight", weight: "", bandLevel: "3", bandMode: "resist", bandConfig: "single", bandEst: "", reps: "", rpe: "", warmup: false }), ...patch }
    }));
  }

  async function addExercise() {
    if (!openSessionId) return;

    const name = canonicalizeExerciseInput(newExerciseName);
    if (!name.trim()) return;

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

    setDraftByExerciseId((prev) => ({
      ...prev,
      [id]: prev[id] ?? { loadType: "weight", weight: "", bandLevel: "3", bandMode: "resist", bandConfig: "single", bandEst: "", reps: "", rpe: "", warmup: false }
    }));

    await openSession(openSessionId);

    await ensureLastForExerciseName(name);
    applyDefaultAutofill(id, name);
  }

  
async function addSet(exerciseId: string) {
  const d =
    draftByExerciseId[exerciseId] ??
    { loadType: "weight", weight: "", bandLevel: "3", bandMode: "resist", bandConfig: "single", bandEst: "", reps: "", rpe: "", warmup: false };

  const reps = d.reps ? Number(d.reps) : null;
  if (!reps || reps <= 0) {
    alert("Reps required.");
    return;
  }

  const loadType = d.loadType || "weight";

  // Band equiv map (from localSettings)
  const bandEquiv = bandEquivMapRef.current;

  let weight_lbs: number | null = null;
  let band_level: number | null = null;
  let band_mode: "assist" | "resist" | null = null;
  let band_config: "single" | "doubled" | null = null;
  let band_est_lbs: number | null = null;

  if (loadType === "weight") {
    const w = d.weight ? Number(d.weight) : null;
    if (!w || w <= 0) {
      alert("Weight required (or switch to Band/BW).");
      return;
    }
    weight_lbs = w;
  } else if (loadType === "band") {
    const lvl = d.bandLevel ? Number(d.bandLevel) : null;
    if (!lvl || lvl < 1 || lvl > 5) {
      alert("Band level (1–5) required.");
      return;
    }
    band_level = lvl;
    band_mode = d.bandMode || "resist";
    band_config = d.bandConfig || "single";
    const override = d.bandEst ? Number(d.bandEst) : null;

    const base = bandEquiv?.[String(lvl)] != null ? Number(bandEquiv[String(lvl)]) : null;
    const cfgMult = band_config === "doubled" ? 2 : 1;
    const est = override && override > 0 ? override : base != null ? base * cfgMult : null;

    band_est_lbs = est != null ? Math.round(est) : null;
  } else {
    // bodyweight
    weight_lbs = null;
  }

  const existing = await localdb.localSets.where({ exercise_id: exerciseId }).toArray();
  const nextSetNumber = (existing?.length ?? 0) + 1;

  const id = uuid();
  const local: LocalWorkoutSet = {
    id,
    exercise_id: exerciseId,
    set_number: nextSetNumber,
    load_type: loadType as any,
    weight_lbs,
    band_level,
    band_mode,
    band_config,
    band_est_lbs,
    reps,
    rpe: advanced && d.rpe ? Number(d.rpe) : null,
    is_warmup: advanced ? !!d.warmup : false
  };

  await localdb.localSets.put(local);

  await enqueue("insert_set", {
    id,
    exercise_id: exerciseId,
    set_number: nextSetNumber,
    load_type: loadType,
    weight_lbs,
    band_level,
    band_mode,
    band_config,
    band_est_lbs,
    reps,
    rpe: advanced && d.rpe ? Number(d.rpe) : null,
    is_warmup: advanced ? !!d.warmup : false
  });

  // Reset only the fields that correspond to the load type, keep selections so logging is fast
  updateDraft(exerciseId, {
    weight: loadType === "weight" ? "" : d.weight,
    bandEst: loadType === "band" ? "" : d.bandEst,
    reps: "",
    rpe: "",
    warmup: false
  });

  setSecs(90);
  setTimerOn(true);

  if (openSessionId) await openSession(openSessionId);

  const ex = exercises.find((e) => e.id === exerciseId);
  if (ex) {
    setLastByExerciseName((prev) => {
      const prevSummary = prev[ex.name];
      const appended: SetLite = {
        load_type: loadType,
        weight_lbs: weight_lbs ?? null,
        band_level,
        band_mode,
        band_config,
        band_est_lbs,
        reps: reps ?? null,
        rpe: advanced && d.rpe ? Number(d.rpe) : null,
        is_warmup: advanced ? !!d.warmup : false
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

// -----------------------------
  // Delete Session (local now + cloud queued)
  // -----------------------------
  async function deleteSession(sessionId: string) {
    const sess = sessions.find((s) => s.id === sessionId) ?? null;
    const label = sess ? `${sess.title} @ ${new Date(sess.started_at).toLocaleTimeString()}` : sessionId;

    const ok = confirm(
      `Delete this entire session (and all sets/exercises)?\n\n${label}\n\nThis removes it locally immediately and queues a cloud delete.`
    );
    if (!ok) return;

    try {
      // local delete in one transaction
      await localdb.transaction("rw", localdb.localSessions, localdb.localExercises, localdb.localSets, async () => {
        const ex = await localdb.localExercises.where({ session_id: sessionId }).toArray();
        const exIds = ex.map((e) => e.id);

        for (const exId of exIds) {
          await localdb.localSets.where({ exercise_id: exId }).delete();
        }
        await localdb.localExercises.where({ session_id: sessionId }).delete();
        await localdb.localSessions.delete(sessionId);
      });

      // queue cloud delete (handled in sync.ts update below)
      await enqueue("delete_session", { session_id: sessionId });

      // refresh UI
      setOpenSessionId((cur) => (cur === sessionId ? null : cur));
      setExercises((cur) => (openSessionId === sessionId ? [] : cur));
      setSets((cur) => (openSessionId === sessionId ? [] : cur));
      setDraftByExerciseId((prev) => {
        if (openSessionId !== sessionId) return prev;
        return {};
      });

      await loadSessionsForDay(selectedDayDate);
      alert("Session deleted (local). Will sync delete when online.");
    } catch (e: any) {
      console.error(e);
      alert(`Delete failed: ${e?.message ?? String(e)}`);
    }
  }

  // -----------------------------
  // Templates
  // -----------------------------
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


  async function deleteTemplate(templateId: string) {
    if (!userId) return;

    const t = templates.find((x) => x.id === templateId);
    const label = t ? `"${t.name}"` : "this template";
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;

    // Local-first delete
    await localdb.transaction("rw", localdb.localTemplates, localdb.localTemplateExercises, async () => {
      await localdb.localTemplateExercises.where({ template_id: templateId }).delete();
      await localdb.localTemplates.delete(templateId);
    });

    // UI state
    if (openTemplateId === templateId) {
      setOpenTemplateId(null);
      setTemplateExercises([]);
    }
    await loadTemplates();

    // Queue cloud delete (best-effort)
    try {
      await enqueue("delete_template", { user_id: userId, template_id: templateId });
    } catch (e) {
      console.warn("Failed to enqueue delete_template:", e);
    }
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

    const local: LocalWorkoutTemplateExercise = {
      id,
      template_id: openTemplateId,
      name,
      sort_order
    };

    await localdb.localTemplateExercises.put(local);

    await enqueue("insert_template_exercise", {
      id,
      template_id: openTemplateId,
      name,
      sort_order
    });

    setNewTemplateExerciseName("");
    await openTemplate(openTemplateId);
  }

  async function startSessionFromTemplate() {
    if (!userId) return;
    if (!openTemplateId) {
      alert("Pick a template first.");
      return;
    }

    const t = templates.find((x) => x.id === openTemplateId) ?? null;
    const ex = await localdb.localTemplateExercises.where({ template_id: openTemplateId }).sortBy("sort_order");

    if (!t) {
      alert("Template not found.");
      return;
    }
    if (ex.length === 0) {
      alert("Template needs at least 1 exercise.");
      return;
    }

    const sessionId = uuid();
    const started_at = new Date().toISOString();

    const localSession: LocalWorkoutSession = {
      id: sessionId,
      user_id: userId,
      day_date: selectedDayDate,
      started_at,
      title: t.name,
      notes: null
    };

    await localdb.localSessions.put(localSession);

    await enqueue("create_workout", {
      id: sessionId,
      user_id: userId,
      day_date: selectedDayDate,
      started_at,
      title: t.name,
      notes: null
    });

    for (let i = 0; i < ex.length; i++) {
      const te = ex[i];
      const exerciseId = uuid();

      const localExercise: LocalWorkoutExercise = {
        id: exerciseId,
        session_id: sessionId,
        name: te.name,
        sort_order: i
      };

      await localdb.localExercises.put(localExercise);

      await enqueue("insert_exercise", {
        id: exerciseId,
        session_id: sessionId,
        name: te.name,
        sort_order: i
      });

      setDraftByExerciseId((prev) => ({
        ...prev,
        [exerciseId]: prev[exerciseId] ?? { loadType: "weight", weight: "", bandLevel: "3", bandMode: "resist", bandConfig: "single", bandEst: "", reps: "", rpe: "", warmup: false }
      }));
    }

    await loadSessionsForDay(selectedDayDate);
    await openSession(sessionId);
    setTab("workout");
    alert("Session created from template (instant).");
  }

  // -----------------------------
  // Last numbers
  // -----------------------------
  async function getLocalLastForExerciseName(exName: string, excludeSessionId: string | null): Promise<LastSetSummary | null> {
    const k = exerciseKey(exName);
    const allExercises = await localdb.localExercises.toArray();
    const matches = allExercises.filter((e) => exerciseKey(e.name) === k && e.session_id !== excludeSessionId);
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
      load_type: (x as any).load_type ?? null,
      weight_lbs: x.weight_lbs ?? null,
      band_level: (x as any).band_level ?? null,
      band_mode: (x as any).band_mode ?? null,
      band_config: (x as any).band_config ?? null,
      band_est_lbs: (x as any).band_est_lbs ?? null,
      reps: x.reps ?? null,
      rpe: x.rpe ?? null,
      is_warmup: !!x.is_warmup
    }));

    return { source: "local", started_at: best.started_at, sets: all };
  }

  async function getCloudLastForExerciseName(exName: string): Promise<LastSetSummary | null> {
    if (!userId) return null;
    if (!navigator.onLine) return null;

    const k = exerciseKey(exName);

    const { data: sess, error: sessErr } = await supabase
      .from("workout_sessions")
      .select("id, started_at")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(30);

    if (sessErr || !sess || sess.length === 0) return null;

    const sessionIds = sess.map((s) => s.id);

    // Pull exercises for recent sessions and filter client-side by alias key.
    const { data: ex, error: exErr } = await supabase
      .from("workout_exercises")
      .select("id, session_id, name")
      .in("session_id", sessionIds);

    if (exErr || !ex || ex.length === 0) return null;

    const matches = ex.filter((e: any) => exerciseKey(String(e.name || "")) === k);
    if (matches.length === 0) return null;

    // Choose the most recent session in sess ordering
    const sessionRank = new Map<string, number>();
    sess.forEach((s, idx) => sessionRank.set(s.id, idx));

    let best = matches[0];
    for (const e of matches) {
      const rBest = sessionRank.get(best.session_id) ?? 9999;
      const rE = sessionRank.get(e.session_id) ?? 9999;
      if (rE < rBest) best = e;
    }

    const started_at = (sess.find((s) => s.id === best.session_id)?.started_at as string) ?? new Date().toISOString();

    const { data: ss, error: ssErr } = await supabase
      .from("workout_sets")
      .select("load_type, weight_lbs, band_level, band_mode, band_config, band_est_lbs, reps, rpe, is_warmup, set_number")
      .eq("exercise_id", best.id)
      .order("set_number", { ascending: true });

    if (ssErr || !ss || ss.length === 0) return null;

    const all = ss.map((x: any) => ({
      load_type: x.load_type ?? null,
      weight_lbs: x.weight_lbs ?? null,
      band_level: x.band_level ?? null,
      band_mode: x.band_mode ?? null,
      band_config: x.band_config ?? null,
      band_est_lbs: x.band_est_lbs ?? null,
      reps: x.reps ?? null,
      rpe: x.rpe ?? null,
      is_warmup: !!x.is_warmup
    }));

    return { source: "cloud", started_at, sets: all };
  }

  async function ensureLastForExerciseName(exName: string) {
    const k = exerciseKey(exName);
    if (lastByExerciseName[k]) return;

    const local = await getLocalLastForExerciseName(exName, openSessionId);
    if (local) {
      setLastByExerciseName((prev) => ({ ...prev, [k]: local }));
      return;
    }

    const cloud = await getCloudLastForExerciseName(exName);
    if (cloud) {
      setLastByExerciseName((prev) => ({ ...prev, [k]: cloud }));
      return;
    }
  }

  function pickLastSet(setsAll: SetLite[]): SetLite | null {
    if (setsAll.length === 0) return null;
    return setsAll[setsAll.length - 1];
  }

  function pickFirstWorkSet(setsAll: SetLite[]): SetLite | null {
    const work = setsAll.find((s) => !s.is_warmup && (s.reps ?? 0) > 0);
    return work ?? setsAll[0] ?? null;
  }

  
function effectiveLoadForTopSet(s: SetLite): number {
  const lt = s.load_type ?? "weight";
  if (lt === "weight") return Number(s.weight_lbs ?? -1);
  if (lt === "band") return Number(s.band_est_lbs ?? -1);
  // bodyweight: treat as 0 so it doesn't beat loaded sets
  return 0;
}

function pickTopSet(setsAll: SetLite[]): SetLite | null {
    let best: SetLite | null = null;
    for (const s of setsAll) {
      const w = s.weight_lbs ?? -1;
      const r = s.reps ?? -1;
      if (!best) {
        best = s;
        continue;
      }
      const bw = best.weight_lbs ?? -1;
      const br = best.reps ?? -1;
      if (w > bw) best = s;
      else if (w === bw && r > br) best = s;
    }
    return best;
  }

  function applyDefaultAutofill(exerciseId: string, exName: string) {
    const summary = lastByExerciseName[exerciseKey(exName)];
    if (!summary || summary.sets.length === 0) return;

    const existing = draftByExerciseId[exerciseId];
    if (existing && (existing.weight || existing.reps)) return;

    const compound = isCompoundExercise(exName);
    const chosen = compound ? pickFirstWorkSet(summary.sets) : pickTopSet(summary.sets);
    if (!chosen) return;

    updateDraft(exerciseId, {
      loadType: (chosen.load_type as any) ?? "weight",
      weight: chosen.weight_lbs != null ? String(chosen.weight_lbs) : "",
      bandLevel: chosen.band_level != null ? String(chosen.band_level) : "",
      bandMode: (chosen.band_mode as any) ?? "resist",
      bandConfig: (chosen.band_config as any) ?? "single",
      bandEst: chosen.band_est_lbs != null ? String(chosen.band_est_lbs) : "",
      reps: chosen.reps != null ? String(chosen.reps) : "",
      rpe: chosen.rpe != null ? String(chosen.rpe) : "",
      warmup: !!chosen.is_warmup
    });
  }

  function applyLastModeToDraft(exerciseId: string, exName: string, mode: "last" | "top" | "firstWork") {
    const summary = lastByExerciseName[exerciseKey(exName)];
    if (!summary || summary.sets.length === 0) return;

    const chosen =
      mode === "last"
        ? pickLastSet(summary.sets)
        : mode === "top"
          ? pickTopSet(summary.sets)
          : pickFirstWorkSet(summary.sets);

    if (!chosen) return;

    updateDraft(exerciseId, {
      loadType: (chosen.load_type as any) ?? "weight",
      weight: chosen.weight_lbs != null ? String(chosen.weight_lbs) : "",
      bandLevel: chosen.band_level != null ? String(chosen.band_level) : "",
      bandMode: (chosen.band_mode as any) ?? "resist",
      bandConfig: (chosen.band_config as any) ?? "single",
      bandEst: chosen.band_est_lbs != null ? String(chosen.band_est_lbs) : "",
      reps: chosen.reps != null ? String(chosen.reps) : "",
      rpe: chosen.rpe != null ? String(chosen.rpe) : "",
      warmup: !!chosen.is_warmup
    });
  }

  // -----------------------------
  // Dashboard computations (local, offline)
  // -----------------------------
  async function refreshDashboard() {
    if (!userId) return;
    setDashBusy(true);
    try {
      // last 28 days of sessions for this user
      const allSessions = await localdb.localSessions.where({ user_id: userId }).toArray();

      // Map session_id -> day
      const sessionDay = new Map<string, string>();
      for (const s of allSessions) {
        const day = s.day_date || isoToDay(s.started_at);
        sessionDay.set(s.id, day);
      }

      // Load all exercises/sets (local)
      const allExercises = await localdb.localExercises.toArray();
      const allSets = await localdb.localSets.toArray();

      // exerciseId -> { sessionId, name }
      const exInfo = new Map<string, { session_id: string; name: string }>();
      for (const e of allExercises) exInfo.set(e.id, { session_id: e.session_id, name: e.name });

      // Aggregate per-day tonnage and set counts
      const tonnageByDay = new Map<string, number>();
      const setsByDay = new Map<string, number>();

      // Per-day best e1RM for selected lift buckets (by exercise name match)
      const bestBenchE1RM = new Map<string, number>();
      const bestSquatE1RM = new Map<string, number>();
      const bestDlE1RM = new Map<string, number>();

      function bumpMax(map: Map<string, number>, day: string, val: number) {
        const cur = map.get(day);
        if (cur == null || val > cur) map.set(day, val);
      }

      for (const s of allSets) {
        const info = exInfo.get(s.exercise_id);
        if (!info) continue;
        const day = sessionDay.get(info.session_id);
        if (!day) continue;

        setsByDay.set(day, (setsByDay.get(day) ?? 0) + 1);

        const w = s.weight_lbs ?? 0;
        const r = s.reps ?? 0;
        if (w > 0 && r > 0) {
          tonnageByDay.set(day, (tonnageByDay.get(day) ?? 0) + w * r);

          // e1RM (best per day) for bucketed names
          const e1 = oneRmEpley(w, r);

          if (isBenchName(info.name)) bumpMax(bestBenchE1RM, day, e1);
          if (isSquatName(info.name)) bumpMax(bestSquatE1RM, day, e1);
          if (isDeadliftName(info.name)) bumpMax(bestDlE1RM, day, e1);
        }
      }

      // Build last 28 days axis
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

      // Weekly coach summary: compare last 7 days vs prior 7 days
      const fmt = (d: Date) => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      };

      const endDay = new Date(end);
      const startThis = new Date(endDay);
      startThis.setDate(endDay.getDate() - 6);
      const startPrev = new Date(endDay);
      startPrev.setDate(endDay.getDate() - 13);
      const endPrev = new Date(endDay);
      endPrev.setDate(endDay.getDate() - 7);

      const thisDays: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(endDay);
        d.setDate(endDay.getDate() - i);
        thisDays.push(fmt(d));
      }
      const prevDays: string[] = [];
      for (let i = 13; i >= 7; i--) {
        const d = new Date(endDay);
        d.setDate(endDay.getDate() - i);
        prevDays.push(fmt(d));
      }

      const sumMap = (map: Map<string, number>, ds: string[]) => ds.reduce((acc, k) => acc + (map.get(k) ?? 0), 0);
      const countSessions = (ds: string[]) =>
        allSessions.filter((s) => ds.includes(s.day_date || isoToDay(s.started_at)) && (s as any).exclude_from_analytics !== true).length;

      const tonThis = Math.round(sumMap(tonnageByDay, thisDays));
      const tonPrev = Math.round(sumMap(tonnageByDay, prevDays));
      const setsThis = Math.round(sumMap(setsByDay, thisDays));
      const setsPrev = Math.round(sumMap(setsByDay, prevDays));

      const sessionsThis = countSessions(thisDays);
      const sessionsPrev = countSessions(prevDays);

      const bestInRange = (map: Map<string, number>, ds: string[]) => {
        let best: number | undefined;
        for (const d of ds) {
          const v = map.get(d);
          if (v == null) continue;
          if (best == null || v > best) best = v;
        }
        return best;
      };

      const benchBest = bestInRange(bestBenchE1RM, thisDays);
      const squatBest = bestInRange(bestSquatE1RM, thisDays);
      const dlBest = bestInRange(bestDlE1RM, thisDays);

      const pct = (a: number, b: number) => {
        if (b === 0) return a === 0 ? 0 : 100;
        return ((a - b) / b) * 100;
      };

      const tonPct = pct(tonThis, tonPrev);
      const setsPct = pct(setsThis, setsPrev);

      let coachLine = "Keep the wheels turning.";
      if (sessionsThis === 0) coachLine = "No sessions logged in the last 7 days — get one on the board.";
      else if (tonThis > tonPrev && tonPct >= 10) coachLine = "Volume is up — nice. Keep intensity honest and recover hard.";
      else if (tonThis < tonPrev && tonPct <= -10) coachLine = "Volume dipped — fine if planned. If not, tighten the routine this week.";
      else if (setsThis > setsPrev && setsPct >= 10) coachLine = "More work sets this week — solid. Watch joints and sleep.";
      else if (setsThis < setsPrev && setsPct <= -10) coachLine = "Fewer sets this week — could be recovery or could be drift. Choose deliberately.";

      setWeeklyCoach({
        thisWeekStart: fmt(startThis),
        thisWeekEnd: fmt(endDay),
        sessionsThis,
        sessionsPrev,
        tonnageThis: tonThis,
        tonnagePrev: tonPrev,
        setsThis,
        setsPrev,
        benchBest,
        squatBest,
        dlBest,
        coachLine
      });


      const tonSeries = days.map((d) => ({ xLabel: d.slice(5), y: Math.round(tonnageByDay.get(d) ?? 0) }));
      const setSeries = days.map((d) => ({ xLabel: d.slice(5), y: setsByDay.get(d) ?? 0 }));

      // e1RM series: only plot days where there is data (otherwise it looks like flatlined heart monitor)
      const bench = days
        .filter((d) => bestBenchE1RM.get(d) != null)
        .map((d) => ({ xLabel: d.slice(5), y: bestBenchE1RM.get(d)! }));

      const squat = days
        .filter((d) => bestSquatE1RM.get(d) != null)
        .map((d) => ({ xLabel: d.slice(5), y: bestSquatE1RM.get(d)! }));

      const dl = days
        .filter((d) => bestDlE1RM.get(d) != null)
        .map((d) => ({ xLabel: d.slice(5), y: bestDlE1RM.get(d)! }));

      
      // Quick Log trends (last 28 days) from local Dexie tables
      const dayKeys = days.map((d) => [userId, d] as [string, string]);
      const dailyRows = await localdb.dailyMetrics.bulkGet(dayKeys);
      const nutrRows = await localdb.nutritionDaily.bulkGet(dayKeys);
      const z2Rows = await localdb.zone2Daily.bulkGet(dayKeys);

      const wSeries = days
        .map((d, i) => {
          const row = dailyRows[i];
          const v = row?.weight_lbs;
          return v == null ? null : { xLabel: d.slice(5), y: Number(v) };
        })
        .filter(Boolean) as { xLabel: string; y: number }[];

      const wsSeries = days
        .map((d, i) => {
          const row = dailyRows[i];
          const v = row?.waist_in;
          return v == null ? null : { xLabel: d.slice(5), y: Number(v) };
        })
        .filter(Boolean) as { xLabel: string; y: number }[];

      const slSeries = days
        .map((d, i) => {
          const row = dailyRows[i];
          const v = row?.sleep_hours;
          return v == null ? null : { xLabel: d.slice(5), y: Number(v) };
        })
        .filter(Boolean) as { xLabel: string; y: number }[];

      const cSeries = days
        .map((d, i) => {
          const row = nutrRows[i];
          const v = row?.calories;
          return v == null ? null : { xLabel: d.slice(5), y: Number(v) };
        })
        .filter(Boolean) as { xLabel: string; y: number }[];

      const pSeries = days
        .map((d, i) => {
          const row = nutrRows[i];
          const v = row?.protein_g;
          return v == null ? null : { xLabel: d.slice(5), y: Number(v) };
        })
        .filter(Boolean) as { xLabel: string; y: number }[];

      const zSeries = days
        .map((d, i) => {
          const row = z2Rows[i];
          const v = row?.minutes;
          return v == null ? null : { xLabel: d.slice(5), y: Number(v) };
        })
        .filter(Boolean) as { xLabel: string; y: number }[];
setTonnageSeries(tonSeries);
      setSetsSeries(setSeries);
      setBenchSeries(bench);
      setSquatSeries(squat);
      setDlSeries(dl);
      setWeightSeries(wSeries);
      setWaistSeries(wsSeries);
      setSleepSeries(slSeries);
      setCalSeries(cSeries);
      setProteinSeries(pSeries);
      setZ2Series(zSeries);
    } finally {
      setDashBusy(false);
    }
  }

  // -----------------------------
  // Effects
  // -----------------------------
  useEffect(() => {
    if (!userId) return;
    // Reload sessions whenever the selected log date changes
    setOpenSessionId(null);
    setExercises([]);
    setSets([]);
    loadSessionsForDay(selectedDayDate);
    loadTemplates();
  }, [userId, selectedDayDate]);

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

  // refresh dashboard when opening the dashboard tab
  useEffect(() => {
    if (!userId) return;
    if (tab !== "dash") return;
    void refreshDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, userId]);

  // -----------------------------
  // Render
  // -----------------------------
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

  const openSessionObj = sessions.find((s) => s.id === openSessionId) ?? null;

  return (
    <div style={{ padding: 20, maxWidth: 950 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Rebuild @ 60 Tracker</h2>
        <button onClick={signOut}>Sign Out</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <b>Log date:</b>
          </div>
          <input
            type="date"
            value={selectedDayDate}
            onChange={(e) => setSelectedDayDate(e.target.value)}
            style={{ padding: "6px 8px" }}
          />
          <button onClick={() => setSelectedDayDate(todayISO())}>Today</button>
          <button
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              const yyyy = d.getFullYear();
              const mm = String(d.getMonth() + 1).padStart(2, "0");
              const dd = String(d.getDate()).padStart(2, "0");
              setSelectedDayDate(`${yyyy}-${mm}-${dd}`);
            }}
          >
            Yesterday
          </button>
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
            loadSessionsForDay(selectedDayDate);
            loadTemplates();
          }}
          disabled={tab === "workout"}
        >
          Workout
        </button>
        <button
          onClick={() => setTab("dash")}
          disabled={tab === "dash"}
          title="Charts are computed from your local workout history"
        >
          Dashboard
        </button>
      </div>

      <hr />

      
      {tab === "dash" && (
        <DashboardView
          dashBusy={dashBusy}
          refreshDashboard={refreshDashboard}
          exportBackup={exportBackup}
          backupBusy={backupBusy}
          importFileRef={importFileRef}
          loadBandEquiv={loadBandEquiv}
          bandEquiv={bandEquiv}
          setBandEquiv={setBandEquiv}
          weight={weight}
          setWeight={setWeight}
          waist={waist}
          setWaist={setWaist}
          sleepHours={sleepHours}
          setSleepHours={setSleepHours}
          calories={calories}
          setCalories={setCalories}
          protein={protein}
          setProtein={setProtein}
          z2Minutes={z2Minutes}
          setZ2Minutes={setZ2Minutes}
          notes={notes}
          setNotes={setNotes}
          saveQuickLog={saveQuickLog}
          weeklyCoach={weeklyCoach}
          tonnageSeries={tonnageSeries}
          setsSeries={setsSeries}
          benchSeries={benchSeries}
          squatSeries={squatSeries}
          dlSeries={dlSeries}
          weightSeries={weightSeries}
          waistSeries={waistSeries}
          sleepSeries={sleepSeries}
          calSeries={calSeries}
          proteinSeries={proteinSeries}
          z2Series={z2Series}
          refreshAiCoach={refreshAiCoach}
          aiCoachBusy={aiCoachBusy}
          aiCoachErr={aiCoachErr}
          aiCoach={aiCoach}
          timerOn={timerOn}
          setTimerOn={setTimerOn}
          secs={secs}
          setSecs={setSecs}
        />
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

              <button
                onClick={() => importFileRef.current?.click()}
                disabled={backupBusy}
                title="Import will overwrite local data on this device"
              >
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
              <b>Tip:</b> Export after big updates (new templates, new week block). Save it to iCloud/Drive/Dropbox.
              Import is for “new phone” or “oh crap”.
            </div>
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
          <h3>Workout Logger</h3>

          {/* Templates block */}
          <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginTop: 10 }}>
            <h4 style={{ marginTop: 0 }}>Templates</h4>

            <div style={{ display: "grid", gap: 8 }}>
              <input
                placeholder="New template name (e.g., Lower A)"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
              />
              <input
                placeholder="Description (optional)"
                value={newTemplateDesc}
                onChange={(e) => setNewTemplateDesc(e.target.value)}
              />
              <button onClick={createTemplate}>Create Template</button>
            </div>

            {templates.length > 0 && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {templates.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "stretch"
                    }}
                  >
                    <button
                      onClick={() => openTemplate(t.id)}
                      style={{
                        flex: 1,
                        textAlign: "left",
                        padding: 10,
                        border: t.id === openTemplateId ? "2px solid black" : "1px solid #ccc",
                        borderRadius: 8
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>{t.name}</div>
                      <div style={{ opacity: 0.75, fontSize: 12 }}>{t.description ?? ""}</div>
                    </button>

                    <button
                      onClick={() => deleteTemplate(t.id)}
                      title="Delete template"
                      style={{
                        width: 46,
                        borderRadius: 8,
                        border: "1px solid #c66",
                        fontWeight: 900
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {openTemplateId && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", gap: 10 }}>
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
                          <li key={e.id}>{displayExerciseName(e.name)}</li>
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
                      <div style={{ fontWeight: 700 }}>{s.title}</div>
                      <div style={{ opacity: 0.8, fontSize: 12 }}>{new Date(s.started_at).toLocaleTimeString()}</div>
                    </button>

                    <button
                      onClick={() => deleteSession(s.id)}
                      title="Delete session (and all sets)"
                      style={{ opacity: 0.9 }}
                    >
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
              <h4 style={{ marginBottom: 6 }}>{openSessionObj.title}</h4>

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
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <input type="checkbox" checked={coachEnabled} onChange={(e) => setCoachEnabled(e.target.checked)} />
                  Coach suggestions
                </label>
              </div>

              {exercises.length === 0 ? (
                <p style={{ marginTop: 12 }}>Add your first exercise and start logging sets.</p>
              ) : (
                <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                  {exercises.map((ex) => {
                    const exSets = setsForExercise(ex.id);
                    const lastSummary = lastByExerciseName[exerciseKey(ex.name)];
                    const preview = lastSummary?.sets ? lastSummary.sets.slice(-3) : [];
                    const d = draftByExerciseId[ex.id] ?? { loadType: "weight", weight: "", bandLevel: "3", bandMode: "resist", bandConfig: "single", bandEst: "", reps: "", rpe: "", warmup: false };

                    const compound = isCompoundExercise(ex.name);
                    const defaultLabel = compound ? "Default: 1st work" : "Default: top set";

                    return (
                      <div key={ex.id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <div style={{ fontWeight: 800 }}>
                            {displayExerciseName(ex.name)}{" "}
                            <span style={{ fontSize: 12, opacity: 0.7, fontWeight: 600 }}>
                              ({defaultLabel})
                            </span>
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
                                {preview.map((s, i) => (
                                  <span key={i}>
                                    {formatSet(s)}
                                    {i < preview.length - 1 ? ", " : ""}
                                  </span>
                                ))}
                              </div>
                              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                                <button onClick={() => applyLastModeToDraft(ex.id, ex.name, "last")}>Use Last Set</button>
                                <button onClick={() => applyLastModeToDraft(ex.id, ex.name, "top")}>Use Top Set</button>
                                <button onClick={() => applyLastModeToDraft(ex.id, ex.name, "firstWork")}>Use First Work</button>
                              </div>
                            </>
                          ) : (
                            <div style={{ opacity: 0.7 }}>
                              <b>Last:</b> (none yet){" "}
                              <button onClick={() => ensureLastForExerciseName(ex.name)} style={{ marginLeft: 8 }}>
                                check
                              </button>
                            </div>
                          )}
                        </div>

                        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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

{d.loadType === "weight" && (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: advanced ? "repeat(4, 1fr)" : "repeat(3, 1fr)",
      gap: 8,
      marginTop: 10
    }}
  >
    <input
      placeholder="Weight"
      value={d.weight}
      onChange={(e) => updateDraft(ex.id, { weight: e.target.value })}
    />
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

{d.loadType === "band" && (
  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
      <input
        placeholder="Level 1–5"
        value={d.bandLevel}
        onChange={(e) => updateDraft(ex.id, { bandLevel: e.target.value })}
      />
      <select
        value={d.bandMode}
        onChange={(e) => updateDraft(ex.id, { bandMode: e.target.value as any })}
      >
        <option value="resist">Resist</option>
        <option value="assist">Assist</option>
      </select>
      <select
        value={d.bandConfig}
        onChange={(e) => updateDraft(ex.id, { bandConfig: e.target.value as any })}
      >
        <option value="single">Single</option>
        <option value="doubled">Doubled</option>
      </select>
      <input
        placeholder="Est lbs (optional)"
        value={d.bandEst}
        onChange={(e) => updateDraft(ex.id, { bandEst: e.target.value })}
      />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: advanced ? "repeat(4, 1fr)" : "repeat(3, 1fr)", gap: 8 }}>
      <div style={{ fontSize: 12, opacity: 0.8, alignSelf: "center" }}>
        Uses Dashboard band equiv if Est lbs blank
      </div>
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
  </div>
)}

{d.loadType === "bodyweight" && (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: advanced ? "repeat(4, 1fr)" : "repeat(3, 1fr)",
      gap: 8,
      marginTop: 10
    }}
  >
    <div style={{ fontSize: 12, opacity: 0.8, alignSelf: "center" }}>Bodyweight set</div>
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

                        {advanced && (
                          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                            <input
                              type="checkbox"
                              checked={d.warmup}
                              onChange={(e) => updateDraft(ex.id, { warmup: e.target.checked })}
                            />
                            Warmup set
                          </label>
                        )}

                        {exSets.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Sets (today)</div>
                            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                              {exSets.map((s) => {
                                const est =
                                  s.weight_lbs != null && s.reps != null
                                    ? oneRmEpley(Number(s.weight_lbs), Number(s.reps))
                                    : null;

                                return (
                                  <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                    <div>
                                      <b>{s.set_number}.</b> {formatSet({
                                          load_type: (s as any).load_type ?? null,
                                          weight_lbs: s.weight_lbs ?? null,
                                          band_level: (s as any).band_level ?? null,
                                          band_mode: (s as any).band_mode ?? null,
                                          band_config: (s as any).band_config ?? null,
                                          band_est_lbs: (s as any).band_est_lbs ?? null,
                                          reps: s.reps ?? null,
                                          rpe: s.rpe ?? null,
                                          is_warmup: !!s.is_warmup
                                        })}
                                      
                                    </div>
                                    <div style={{ opacity: 0.75 }}>{est ? `~1RM ${est}` : ""}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {coachEnabled && (
                          <CoachBoundary exerciseName={displayExerciseName(ex.name)} sets={exSets} compound={compound} />
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


































































