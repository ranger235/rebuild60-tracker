import { supabase } from "./supabase";
import { localdb, type PendingOp } from "./localdb";

export async function enqueue(op: PendingOp["op"], payload: any) {
  await localdb.pendingOps.add({
    createdAt: Date.now(),
    op,
    payload,
    status: "queued"
  });
}

async function runOp(item: PendingOp) {
  switch (item.op) {
    case "upsert_daily": {
      const { error } = await supabase.from("daily_checkins").upsert(item.payload);
      if (error) throw error;
      return;
    }
    case "upsert_nutrition": {
      const { error } = await supabase.from("nutrition_logs").upsert(item.payload);
      if (error) throw error;
      return;
    }
    case "insert_zone2": {
      const { error } = await supabase.from("cardio_sessions").insert(item.payload);
      if (error) throw error;
      return;
    }
    case "create_workout": {
      const { error } = await supabase.from("workout_sessions").insert(item.payload);
      if (error) throw error;
      return;
    }
  }
}

export async function syncOnce(setStatus?: (s: string) => void) {
  const ops = await localdb.pendingOps.orderBy("createdAt").toArray();
  if (ops.length === 0) {
    setStatus?.("Synced");
    return;
  }

  for (const item of ops) {
    try {
      setStatus?.("Syncing…");
      await runOp(item);
      await localdb.pendingOps.delete(item.id!);
    } catch (e: any) {
      await localdb.pendingOps.update(item.id!, {
        status: "retry",
        lastError: e?.message ?? String(e)
      });
      setStatus?.("Offline / retrying");
      // Stop early if network is down; remaining ops will retry next run
      break;
    }
  }
}

export function startAutoSync(setStatus?: (s: string) => void) {
  // Try now, then every 10s; also on online event
  syncOnce(setStatus);
  const t = window.setInterval(() => syncOnce(setStatus), 10000);
  window.addEventListener("online", () => syncOnce(setStatus));
  return () => window.clearInterval(t);
}
