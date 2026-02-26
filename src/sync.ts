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

async function processOp(op: PendingOp["op"], payload: any) {
  switch (op) {
    case "upsert_daily":
      await supabase.from("daily_logs").upsert(payload, { onConflict: "user_id,day_date" });
      return;

    case "upsert_nutrition":
      await supabase.from("nutrition_logs").upsert(payload, { onConflict: "user_id,day_date" });
      return;

    case "insert_zone2":
      await supabase.from("zone2_sessions").insert(payload);
      return;

    case "create_workout":
      await supabase.from("workout_sessions").insert(payload);
      return;

    case "insert_exercise":
      await supabase.from("workout_exercises").insert(payload);
      return;

    case "insert_set":
      await supabase.from("workout_sets").insert(payload);
      return;

    case "create_template":
      await supabase.from("workout_templates").insert(payload);
      return;

    case "insert_template_exercise":
      await supabase.from("workout_template_exercises").insert(payload);
      return;

    case "update_template_exercise":
      // upsert by primary key (id)
      await supabase.from("workout_template_exercises").upsert(payload, { onConflict: "id" });
      return;

    case "delete_set": {
      const set_id = payload?.set_id;
      if (!set_id) throw new Error("delete_set missing set_id");
      await supabase.from("workout_sets").delete().eq("id", set_id);
      return;
    }

    case "renumber_sets": {
      const ordered_set_ids: string[] = payload?.ordered_set_ids ?? [];
      if (!Array.isArray(ordered_set_ids)) throw new Error("renumber_sets ordered_set_ids must be array");
      // Renumbering requires updates; do it client-side in a loop (small N)
      for (let i = 0; i < ordered_set_ids.length; i++) {
        const id = ordered_set_ids[i];
        await supabase.from("workout_sets").update({ set_number: i + 1 }).eq("id", id);
      }
      return;
    }

    case "delete_exercise": {
      const exercise_id = payload?.exercise_id;
      if (!exercise_id) throw new Error("delete_exercise missing exercise_id");
      // delete sets then exercise
      await supabase.from("workout_sets").delete().eq("exercise_id", exercise_id);
      await supabase.from("workout_exercises").delete().eq("id", exercise_id);
      return;
    }

    case "reorder_exercises": {
      const ordered_exercise_ids: string[] = payload?.ordered_exercise_ids ?? [];
      if (!Array.isArray(ordered_exercise_ids)) throw new Error("reorder_exercises ordered_exercise_ids must be array");
      for (let i = 0; i < ordered_exercise_ids.length; i++) {
        const id = ordered_exercise_ids[i];
        await supabase.from("workout_exercises").update({ sort_order: i }).eq("id", id);
      }
      return;
    }

    case "delete_session": {
      const session_id = payload?.session_id;
      if (!session_id) throw new Error("delete_session missing session_id");

      const { data: exRows, error: exErr } = await supabase
        .from("workout_exercises")
        .select("id")
        .eq("session_id", session_id);

      if (exErr) throw exErr;

      const exIds = (exRows ?? []).map((r: any) => r.id);

      if (exIds.length > 0) {
        const { error: setErr } = await supabase.from("workout_sets").delete().in("exercise_id", exIds);
        if (setErr) throw setErr;
      }

      const { error: delExErr } = await supabase.from("workout_exercises").delete().eq("session_id", session_id);
      if (delExErr) throw delExErr;

      const { error: delSessErr } = await supabase.from("workout_sessions").delete().eq("id", session_id);
      if (delSessErr) throw delSessErr;

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
