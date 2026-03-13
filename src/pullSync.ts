import { supabase } from "./supabase";
import { localdb } from "./localdb";

/**
 * Cloud -> local hydration for multi-device sync.
 * Intentionally simple for Sync Sprint 1:
 * - pull a full user-scoped snapshot
 * - upsert into Dexie
 * - avoid updated_at assumptions until schema is standardized
 */

function toMillis(value: any): number {
  const n = Date.parse(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export async function pullSync(userId: string) {
  if (!userId) return;

  // Core user-scoped tables
  const [{ data: sessions, error: sessionsErr }, { data: daily, error: dailyErr }, { data: nutrition, error: nutritionErr }, { data: zone2, error: zone2Err }, { data: templates, error: templatesErr }] =
    await Promise.all([
      supabase
        .from("workout_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("started_at", { ascending: true }),
      supabase
        .from("daily_logs")
        .select("*")
        .eq("user_id", userId)
        .order("day_date", { ascending: true }),
      supabase
        .from("nutrition_logs")
        .select("*")
        .eq("user_id", userId)
        .order("day_date", { ascending: true }),
      supabase
        .from("zone2_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("day_date", { ascending: true }),
      supabase
        .from("workout_templates")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
    ]);

  if (sessionsErr) throw sessionsErr;
  if (dailyErr) throw dailyErr;
  if (nutritionErr) throw nutritionErr;
  if (zone2Err) throw zone2Err;
  if (templatesErr) throw templatesErr;

  const sessionRows = (sessions ?? []) as any[];
  const templateRows = (templates ?? []) as any[];

  const sessionIds = sessionRows.map((r) => r.id).filter(Boolean);
  const templateIds = templateRows.map((r) => r.id).filter(Boolean);

  // Child tables
  const exercisesPromise = sessionIds.length
    ? supabase.from("workout_exercises").select("*").in("session_id", sessionIds)
    : Promise.resolve({ data: [], error: null } as any);

  const templateExercisesPromise = templateIds.length
    ? supabase.from("workout_template_exercises").select("*").in("template_id", templateIds)
    : Promise.resolve({ data: [], error: null } as any);

  const [{ data: exercises, error: exercisesErr }, { data: templateExercises, error: templateExercisesErr }] =
    await Promise.all([exercisesPromise, templateExercisesPromise]);

  if (exercisesErr) throw exercisesErr;
  if (templateExercisesErr) throw templateExercisesErr;

  const exerciseRows = (exercises ?? []) as any[];
  const exerciseIds = exerciseRows.map((r) => r.id).filter(Boolean);

  const setsPromise = exerciseIds.length
    ? supabase.from("workout_sets").select("*").in("exercise_id", exerciseIds)
    : Promise.resolve({ data: [], error: null } as any);

  const { data: sets, error: setsErr } = await setsPromise;
  if (setsErr) throw setsErr;

  // Collapse zone2 to one row per day for Dexie's [user_id+day_date] key.
  const zone2ByDay = new Map<string, any>();
  for (const row of (zone2 ?? []) as any[]) {
    const key = `${row.user_id}::${row.day_date}`;
    const prev = zone2ByDay.get(key);
    if (!prev || toMillis(row.updatedAt ?? row.updated_at ?? row.created_at ?? row.day_date) >= toMillis(prev.updatedAt ?? prev.updated_at ?? prev.created_at ?? prev.day_date)) {
      zone2ByDay.set(key, row);
    }
  }

  await localdb.transaction(
    "rw",
    localdb.localSessions,
    localdb.localExercises,
    localdb.localSets,
    localdb.localTemplates,
    localdb.localTemplateExercises,
    localdb.dailyMetrics,
    localdb.nutritionDaily,
    localdb.zone2Daily,
    async () => {
      await localdb.localSessions.bulkPut(sessionRows as any);
      await localdb.localExercises.bulkPut(exerciseRows as any);
      await localdb.localSets.bulkPut(((sets ?? []) as any[]) as any);
      await localdb.localTemplates.bulkPut(templateRows as any);
      await localdb.localTemplateExercises.bulkPut(((templateExercises ?? []) as any[]) as any);
      await localdb.dailyMetrics.bulkPut(((daily ?? []) as any[]) as any);
      await localdb.nutritionDaily.bulkPut(((nutrition ?? []) as any[]) as any);
      await localdb.zone2Daily.bulkPut(Array.from(zone2ByDay.values()) as any);
    }
  );
}
