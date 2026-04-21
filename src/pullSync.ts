import { supabase } from "./supabase";
import { localdb, type PendingOp } from "./localdb";

/**
 * Cloud -> local hydration for multi-device sync.
 * Intentionally simple for Sync Sprint 1:
 * - pull a full user-scoped snapshot
 * - upsert into Dexie
 * - avoid updated_at assumptions until schema is standardized
 */

function collectSyncIntent(pending: PendingOp[]) {
  const pendingDeleteTemplateIds = new Set<string>();
  const pendingDeleteTemplateExerciseIds = new Set<string>();
  const pendingCreateOrUpdateTemplateIds = new Set<string>();
  const pendingCreateOrUpdateTemplateExerciseIds = new Set<string>();
  const pendingDeleteSessionIds = new Set<string>();
  const pendingDeleteExerciseIds = new Set<string>();
  const pendingDeleteSetIds = new Set<string>();

  for (const item of pending) {
    const payload = item?.payload ?? {};
    switch (item.op) {
      case "create_template":
      case "update_template":
        if (payload?.id) pendingCreateOrUpdateTemplateIds.add(String(payload.id));
        break;
      case "delete_template":
        if (payload?.template_id) pendingDeleteTemplateIds.add(String(payload.template_id));
        break;
      case "insert_template_exercise":
      case "update_template_exercise":
        if (payload?.id) pendingCreateOrUpdateTemplateExerciseIds.add(String(payload.id));
        break;
      case "delete_template_exercise":
        if (payload?.template_exercise_id) pendingDeleteTemplateExerciseIds.add(String(payload.template_exercise_id));
        break;
      case "delete_session":
        if (payload?.session_id) pendingDeleteSessionIds.add(String(payload.session_id));
        break;
      case "delete_exercise":
        if (payload?.exercise_id) pendingDeleteExerciseIds.add(String(payload.exercise_id));
        break;
      case "delete_set":
        if (payload?.set_id) pendingDeleteSetIds.add(String(payload.set_id));
        break;
    }
  }

  return {
    pendingDeleteTemplateIds,
    pendingDeleteTemplateExerciseIds,
    pendingCreateOrUpdateTemplateIds,
    pendingCreateOrUpdateTemplateExerciseIds,
    pendingDeleteSessionIds,
    pendingDeleteExerciseIds,
    pendingDeleteSetIds
  };
}


function preserveExerciseIdentity<T extends { id?: string | null; exercise_library_id?: string | null; exercise_family_id?: string | null }>(
  remoteRows: T[],
  localRows: T[]
): T[] {
  const localById = new Map(localRows.map((row) => [String(row.id ?? ""), row]));
  return remoteRows.map((row) => {
    const local = localById.get(String(row.id ?? ""));
    if (!local) return row;
    return {
      ...row,
      exercise_library_id: row.exercise_library_id ?? local.exercise_library_id ?? null,
      exercise_family_id: row.exercise_family_id ?? local.exercise_family_id ?? null,
    };
  });
}

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

  const pending = await localdb.pendingOps.toArray();
  const {
    pendingDeleteTemplateIds,
    pendingDeleteTemplateExerciseIds,
    pendingCreateOrUpdateTemplateIds,
    pendingCreateOrUpdateTemplateExerciseIds,
    pendingDeleteSessionIds,
    pendingDeleteExerciseIds,
    pendingDeleteSetIds
  } = collectSyncIntent(pending as PendingOp[]);

  const sessionRows = ((sessions ?? []) as any[]).filter((row) => !pendingDeleteSessionIds.has(String(row.id)));

  const templateRows = ((templates ?? []) as any[]).filter((row) => !pendingDeleteTemplateIds.has(String(row.id)));

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

  const templateExerciseRows = ((templateExercises ?? []) as any[]).filter((row) => {
    const id = String(row.id);
    const templateId = String(row.template_id);
    if (pendingDeleteTemplateIds.has(templateId)) return false;
    if (pendingDeleteTemplateExerciseIds.has(id)) return false;
    return true;
  });

  const exerciseRows = ((exercises ?? []) as any[]).filter((row) => {
    const id = String(row.id);
    const sessionId = String(row.session_id);
    if (pendingDeleteExerciseIds.has(id)) return false;
    if (pendingDeleteSessionIds.has(sessionId)) return false;
    return true;
  });
  const exerciseIds = exerciseRows.map((r) => r.id).filter(Boolean);

  const setsPromise = exerciseIds.length
    ? supabase.from("workout_sets").select("*").in("exercise_id", exerciseIds)
    : Promise.resolve({ data: [], error: null } as any);

  const { data: sets, error: setsErr } = await setsPromise;
  if (setsErr) throw setsErr;

  const validExerciseIds = new Set(exerciseRows.map((row) => String(row.id)));
  const setRows = ((sets ?? []) as any[]).filter((row) => {
    const id = String(row.id);
    const exerciseId = String(row.exercise_id);
    if (pendingDeleteSetIds.has(id)) return false;
    if (pendingDeleteExerciseIds.has(exerciseId)) return false;
    return validExerciseIds.has(exerciseId);
  });

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
      const existingLocalExercises = exerciseRows.length
        ? await localdb.localExercises.bulkGet(exerciseRows.map((row) => String(row.id)))
        : [];
      const existingLocalTemplateExercises = templateExerciseRows.length
        ? await localdb.localTemplateExercises.bulkGet(templateExerciseRows.map((row) => String(row.id)))
        : [];

      const mergedExerciseRows = preserveExerciseIdentity(
        exerciseRows as any[],
        (existingLocalExercises.filter(Boolean) as any[])
      );
      const mergedTemplateExerciseRows = preserveExerciseIdentity(
        templateExerciseRows as any[],
        (existingLocalTemplateExercises.filter(Boolean) as any[])
      );

      await localdb.localSessions.bulkPut(sessionRows as any);
      await localdb.localExercises.bulkPut(mergedExerciseRows as any);
      await localdb.localSets.bulkPut(setRows as any);

      const remoteTemplateIdSet = new Set(templateRows.map((row) => String(row.id)));
      const remoteTemplateExerciseIdSet = new Set(mergedTemplateExerciseRows.map((row) => String(row.id)));

      const localUserTemplates = await localdb.localTemplates.where({ user_id: userId }).toArray();
      const staleTemplateIds = localUserTemplates
        .filter((row) => {
          const id = String(row.id);
          if (pendingCreateOrUpdateTemplateIds.has(id)) return false;
          return !remoteTemplateIdSet.has(id);
        })
        .map((row) => String(row.id));

      if (staleTemplateIds.length) {
        await localdb.localTemplateExercises.where("template_id").anyOf(staleTemplateIds).delete();
        await localdb.localTemplates.bulkDelete(staleTemplateIds);
      }

      const survivingTemplateIds = localUserTemplates
        .map((row) => String(row.id))
        .filter((id) => remoteTemplateIdSet.has(id) || pendingCreateOrUpdateTemplateIds.has(id));

      if (survivingTemplateIds.length) {
        const localTemplateExerciseRows = await localdb.localTemplateExercises.where("template_id").anyOf(survivingTemplateIds).toArray();
        const staleTemplateExerciseIds = localTemplateExerciseRows
          .filter((row) => {
            const id = String(row.id);
            if (pendingCreateOrUpdateTemplateExerciseIds.has(id)) return false;
            return !remoteTemplateExerciseIdSet.has(id);
          })
          .map((row) => String(row.id));

        if (staleTemplateExerciseIds.length) {
          await localdb.localTemplateExercises.bulkDelete(staleTemplateExerciseIds);
        }
      }

      await localdb.localTemplates.bulkPut(templateRows as any);
      await localdb.localTemplateExercises.bulkPut(mergedTemplateExerciseRows as any);
      await localdb.dailyMetrics.bulkPut(((daily ?? []) as any[]) as any);
      await localdb.nutritionDaily.bulkPut(((nutrition ?? []) as any[]) as any);
      await localdb.zone2Daily.bulkPut(Array.from(zone2ByDay.values()) as any);
    }
  );
}




