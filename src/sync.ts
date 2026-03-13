import { supabase } from "./supabase";
import { localdb, type PendingOp } from "./localdb";

/**
 * Offline-first sync:
 * - enqueue() writes to pendingOps (Dexie) immediately
 * - autosync processes queued ops when online
 * - poison-pill safe: one bad op won't block the whole queue
 */

export async function enqueue(op: PendingOp["op"], payload: any) {
  await localdb.pendingOps.add({
    createdAt: Date.now(),
    op,
    payload,
    status: "queued"
  });
}

async function must<T>(promise: Promise<{ data?: T; error: any }>, context: string): Promise<T | null | undefined> {
  const { data, error } = await promise;
  if (error) {
    console.error(`Sync error [${context}]`, error);
    throw new Error(error.message || context);
  }
  return data;
}


async function processOp(op: PendingOp["op"], payload: any) {
  switch (op) {
    case "upsert_daily":
      await must(supabase.from("daily_logs").upsert(payload, { onConflict: "user_id,day_date" }), "upsert_daily");
      return;

    case "upsert_nutrition":
      await must(supabase.from("nutrition_logs").upsert(payload, { onConflict: "user_id,day_date" }), "upsert_nutrition");
      return;

    case "insert_zone2":
      await must(supabase.from("zone2_sessions").insert(payload), "insert_zone2");
      return;

    case "create_workout":
      await must(supabase.from("workout_sessions").insert(payload), "create_workout");
      return;

    case "insert_exercise":
      await must(supabase.from("workout_exercises").insert(payload), "insert_exercise");
      return;

    case "insert_set":
      await must(supabase.from("workout_sets").insert(payload), "insert_set");
      return;

    case "create_template":
      await must(supabase.from("workout_templates").insert(payload), "create_template");
      return;

    case "delete_template": {
      const template_id = payload?.template_id;
      if (!template_id) throw new Error("delete_template missing template_id");
      // delete template exercises then template
      await must(supabase.from("workout_template_exercises").delete().eq("template_id", template_id), "delete_template_exercises");
      await must(supabase.from("workout_templates").delete().eq("id", template_id), "delete_template");
      return;
    }

    case "insert_template_exercise":
      await must(supabase.from("workout_template_exercises").insert(payload), "insert_template_exercise");
      return;

    case "update_template_exercise":
      // upsert by primary key (id)
      await must(supabase.from("workout_template_exercises").upsert(payload, { onConflict: "id" }), "update_template_exercise");
      return;

    case "delete_set": {
      const set_id = payload?.set_id;
      if (!set_id) throw new Error("delete_set missing set_id");
      await must(supabase.from("workout_sets").delete().eq("id", set_id), "delete_set");
      return;
    }

    case "renumber_sets": {
      const ordered_set_ids: string[] = payload?.ordered_set_ids ?? [];
      if (!Array.isArray(ordered_set_ids)) throw new Error("renumber_sets ordered_set_ids must be array");
      // Renumbering requires updates; do it client-side in a loop (small N)
      for (let i = 0; i < ordered_set_ids.length; i++) {
        const id = ordered_set_ids[i];
        await must(supabase.from("workout_sets").update({ set_number: i + 1 }).eq("id", id), "renumber_sets");
      }
      return;
    }

    case "delete_exercise": {
      const exercise_id = payload?.exercise_id;
      if (!exercise_id) throw new Error("delete_exercise missing exercise_id");
      // delete sets then exercise
      await must(supabase.from("workout_sets").delete().eq("exercise_id", exercise_id), "delete_exercise_sets");
      await must(supabase.from("workout_exercises").delete().eq("id", exercise_id), "delete_exercise");
      return;
    }

    case "reorder_exercises": {
      const ordered_exercise_ids: string[] = payload?.ordered_exercise_ids ?? [];
      if (!Array.isArray(ordered_exercise_ids)) throw new Error("reorder_exercises ordered_exercise_ids must be array");
      for (let i = 0; i < ordered_exercise_ids.length; i++) {
        const id = ordered_exercise_ids[i];
        await must(supabase.from("workout_exercises").update({ sort_order: i }).eq("id", id), "reorder_exercises");
      }
      return;
    }

    case "delete_session": {
      const session_id = payload?.session_id;
      if (!session_id) throw new Error("delete_session missing session_id");

      const exRows = await must(supabase
        .from("workout_exercises")
        .select("id")
        .eq("session_id", session_id), "delete_session:list_exercises");

      const exIds = ((exRows ?? []) as any[]).map((r: any) => r.id);

      if (exIds.length > 0) {
        await must(supabase.from("workout_sets").delete().in("exercise_id", exIds), "delete_session:delete_sets");
      }

      await must(supabase.from("workout_exercises").delete().eq("session_id", session_id), "delete_session:delete_exercises");

      await must(supabase.from("workout_sessions").delete().eq("id", session_id), "delete_session");

      return;
    }

    default:
      // Exhaustiveness
      throw new Error(`Unknown op: ${op}`);
  }
}

export function startAutoSync(setStatus: (s: string) => void) {
  let stopped = false;

  async function tick() {
    if (stopped) return;

    if (!navigator.onLine) {
      setStatus("Offline/retrying");
      return;
    }

    try {
      setStatus("Syncing…");

      const items = await localdb.pendingOps.orderBy("createdAt").toArray();

      if (items.length === 0) {
        setStatus("Synced");
        return;
      }

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
          // poison-pill safe: keep going
          continue;
        }
      }

      setStatus(failed === 0 ? "Synced" : `Synced (with ${failed} retrying)`);
    } catch (e: any) {
      console.error(e);
      setStatus("Offline/retrying");
    }
  }

  tick();
  const h = window.setInterval(tick, 6000);

  return () => {
    stopped = true;
    window.clearInterval(h);
  };
}









