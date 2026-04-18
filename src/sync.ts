import { supabase } from "./supabase";
import { localdb, type PendingOp } from "./localdb";
import { pullSync } from "./pullSync";

/**
 * Offline-first sync:
 * - enqueue() writes to pendingOps (Dexie) immediately
 * - autosync processes queued ops when online
 * - poison-pill safe: one bad op won't block the whole queue
 * - cloud pull runs after push so multiple devices converge
 */

async function must<T>(promise: Promise<{ data: T | null; error: any } | { data?: T; error?: any }>) {
  const result: any = await promise;
  if (result?.error) throw result.error;
  return result?.data as T;
}

async function mustDeleteAffectRows(
  promise: Promise<{ data: any[] | null; error: any } | { data?: any[] | null; error?: any }>,
  context: string,
  options?: { allowNoOp?: boolean }
) {
  const result: any = await promise;
  if (result?.error) throw result.error;
  const rows = Array.isArray(result?.data) ? result.data : [];
  if (rows.length === 0) {
    if (options?.allowNoOp) {
      return rows;
    }
    console.error("DELETE NO-OP", `${context} affected 0 rows`);
    throw new Error(`${context} affected 0 rows`);
  }
  return rows;
}

export async function enqueue(op: PendingOp["op"], payload: any) {
  await localdb.pendingOps.add({
    createdAt: Date.now(),
    op,
    payload,
    status: "queued"
  });
}

async function processOp(op: PendingOp["op"], payload: any) {
  switch (op) {
    case "upsert_daily":
      await must(supabase.from("daily_logs").upsert(payload, { onConflict: "user_id,day_date" }));
      return;

    case "upsert_nutrition":
      await must(supabase.from("nutrition_logs").upsert(payload, { onConflict: "user_id,day_date" }));
      return;

    case "insert_zone2":
      await must(supabase.from("zone2_sessions").upsert(payload, { onConflict: "user_id,day_date" }));
      return;

    case "create_workout":
      await must(supabase.from("workout_sessions").upsert(payload, { onConflict: "id" }));
      return;

    case "insert_exercise":
      await must(supabase.from("workout_exercises").upsert(payload, { onConflict: "id" }));
      return;

    case "insert_set":
      await must(supabase.from("workout_sets").upsert(payload, { onConflict: "id" }));
      return;

    case "create_template":
      await must(supabase.from("workout_templates").upsert(payload, { onConflict: "id" }));
      return;

    case "update_template":
      await must(supabase.from("workout_templates").upsert(payload, { onConflict: "id" }));
      return;

    case "delete_template": {
      const template_id = payload?.template_id;
      if (!template_id) throw new Error("delete_template missing template_id");
      await must(supabase.from("workout_template_exercises").delete().eq("template_id", template_id));
      await mustDeleteAffectRows(
        supabase.from("workout_templates").delete().eq("id", template_id).select("id"),
        `delete_template for ${template_id}`
      );
      return;
    }

    case "insert_template_exercise":
      await must(supabase.from("workout_template_exercises").upsert(payload, { onConflict: "id" }));
      return;

    case "update_template_exercise":
      await must(supabase.from("workout_template_exercises").upsert(payload, { onConflict: "id" }));
      return;

    case "delete_template_exercise": {
      const template_exercise_id = payload?.template_exercise_id;
      if (!template_exercise_id) throw new Error("delete_template_exercise missing template_exercise_id");
      await mustDeleteAffectRows(
        supabase.from("workout_template_exercises").delete().eq("id", template_exercise_id).select("id"),
        `delete_template_exercise for ${template_exercise_id}`
      );
      return;
    }

    case "reorder_template_exercises": {
      const ordered_template_exercise_ids: string[] = payload?.ordered_template_exercise_ids ?? [];
      if (!Array.isArray(ordered_template_exercise_ids)) throw new Error("reorder_template_exercises ordered_template_exercise_ids must be array");
      for (let i = 0; i < ordered_template_exercise_ids.length; i++) {
        const id = ordered_template_exercise_ids[i];
        await must(supabase.from("workout_template_exercises").update({ sort_order: i }).eq("id", id));
      }
      return;
    }

    case "delete_set": {
      const set_id = payload?.set_id;
      if (!set_id) throw new Error("delete_set missing set_id");
      await mustDeleteAffectRows(
        supabase.from("workout_sets").delete().eq("id", set_id).select("id"),
        `delete_set for ${set_id}`
      );
      return;
    }

    case "renumber_sets": {
      const ordered_set_ids: string[] = payload?.ordered_set_ids ?? [];
      if (!Array.isArray(ordered_set_ids)) throw new Error("renumber_sets ordered_set_ids must be array");
      for (let i = 0; i < ordered_set_ids.length; i++) {
        const id = ordered_set_ids[i];
        await must(supabase.from("workout_sets").update({ set_number: i + 1 }).eq("id", id));
      }
      return;
    }

    case "delete_exercise": {
      const exercise_id = payload?.exercise_id;
      if (!exercise_id) throw new Error("delete_exercise missing exercise_id");
      await must(supabase.from("workout_sets").delete().eq("exercise_id", exercise_id));
      await mustDeleteAffectRows(
        supabase.from("workout_exercises").delete().eq("id", exercise_id).select("id"),
        `delete_exercise for ${exercise_id}`,
        { allowNoOp: true }
      );
      return;
    }

    case "reorder_exercises": {
      const ordered_exercise_ids: string[] = payload?.ordered_exercise_ids ?? [];
      if (!Array.isArray(ordered_exercise_ids)) throw new Error("reorder_exercises ordered_exercise_ids must be array");
      for (let i = 0; i < ordered_exercise_ids.length; i++) {
        const id = ordered_exercise_ids[i];
        await must(supabase.from("workout_exercises").update({ sort_order: i }).eq("id", id));
      }
      return;
    }

    case "delete_session": {
      const session_id = payload?.session_id;
      if (!session_id) throw new Error("delete_session missing session_id");

      const exRows = await must<any[]>(
        supabase
          .from("workout_exercises")
          .select("id")
          .eq("session_id", session_id)
      );

      const exIds = (exRows ?? []).map((r: any) => r.id);

      if (exIds.length > 0) {
        await must(supabase.from("workout_sets").delete().in("exercise_id", exIds));
      }

      await must(supabase.from("workout_exercises").delete().eq("session_id", session_id));
      await mustDeleteAffectRows(
        supabase.from("workout_sessions").delete().eq("id", session_id).select("id"),
        `delete_session for ${session_id}`
      );
      return;
    }

    default:
      throw new Error(`Unknown op: ${op}`);
  }
}

export async function runSyncPass(
  setStatus: (s: string) => void,
  onAfterSync?: () => Promise<void> | void
): Promise<{ completed: boolean; failed: number; hadQueuedOps: boolean }> {
  if (!navigator.onLine) {
    setStatus("Offline (local saves only)");
    return { completed: false, failed: 0, hadQueuedOps: false };
  }

  try {
    setStatus("Syncing…");

    const items = await localdb.pendingOps.orderBy("createdAt").toArray();

    if (items.length > 0) {
      setStatus("Local changes pending");
      let failed = 0;

      for (const item of items) {
        try {
          await processOp(item.op, item.payload);
          if (item.id != null) await localdb.pendingOps.delete(item.id);
        } catch (e: any) {
          failed++;
          if (item.id != null) {
            await localdb.pendingOps.update(item.id, {
              status: "retry",
              lastError: e?.message ?? String(e)
            });
          }
          continue;
        }
      }

      const auth = await supabase.auth.getUser();
      const currentUserId = auth.data.user?.id ?? null;
      if (currentUserId) {
        await pullSync(currentUserId);
      }
      if (onAfterSync) {
        await onAfterSync();
      }

      setStatus(failed === 0 ? "Synced" : `Sync issues (${failed} retrying)`);
      return { completed: true, failed, hadQueuedOps: true };
    }

    const auth = await supabase.auth.getUser();
    const currentUserId = auth.data.user?.id ?? null;
    if (currentUserId) {
      await pullSync(currentUserId);
    }
    if (onAfterSync) {
      await onAfterSync();
    }
    setStatus("Synced");
    return { completed: true, failed: 0, hadQueuedOps: false };
  } catch (e: any) {
    console.error(e);
    setStatus(navigator.onLine ? "Sync issues (retrying)" : "Offline (local saves only)");
    return { completed: false, failed: 1, hadQueuedOps: false };
  }
}

export function startAutoSync(
  setStatus: (s: string) => void,
  onAfterSync?: () => Promise<void> | void,
  onResult?: (result: { completed: boolean; failed: number; hadQueuedOps: boolean }) => void
) {
  let stopped = false;

  async function tick() {
    if (stopped) return;
    const result = await runSyncPass(setStatus, onAfterSync);
    if (onResult) onResult(result);
  }

  tick();
  const h = window.setInterval(tick, 6000);

  return () => {
    stopped = true;
    window.clearInterval(h);
  };
}



































