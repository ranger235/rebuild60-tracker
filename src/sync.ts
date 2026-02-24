import { supabase } from "./supabase";
import { localdb } from "./localdb";

// Queue record shape (Dexie table usually called localQueue)
type QueueItem = {
  id: string;
  op: string;
  payload: any;
  created_at: string;
};

export async function enqueue(op: string, payload: any) {
  const item: QueueItem = {
    id: crypto.randomUUID(),
    op,
    payload,
    created_at: new Date().toISOString()
  };

  // localQueue must exist in localdb.ts (from earlier builds)
  // If your queue table name differs, tell me and I’ll adjust.
  const anyDb = localdb as any;
  if (!anyDb.localQueue) throw new Error("localQueue table not found in localdb. (Check localdb.ts)");
  await anyDb.localQueue.add(item);
}

async function processItem(item: QueueItem) {
  const { op, payload } = item;

  // NOTE: we let Supabase errors throw; caller handles retry.
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

    // ✅ NEW: delete a session and all child rows
    case "delete_session": {
      const session_id = payload?.session_id;
      if (!session_id) throw new Error("delete_session missing session_id");

      // Delete sets -> exercises -> session.
      // We must discover exercise ids first.
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

      const anyDb = localdb as any;
      const q = anyDb.localQueue;
      if (!q) throw new Error("localQueue table not found in localdb.");

      const items: QueueItem[] = await q.orderBy("created_at").toArray();

      if (items.length === 0) {
        setStatus("Synced");
        return;
      }

      // Process in order; stop on first failure
      for (const item of items) {
        await processItem(item);
        await q.delete(item.id);
      }

      setStatus("Synced");
    } catch (e: any) {
      console.error(e);
      setStatus("Offline/retrying");
    }
  }

  // run now and every 6 seconds
  tick();
  const h = window.setInterval(tick, 6000);

  return () => {
    stopped = true;
    window.clearInterval(h);
  };
}
