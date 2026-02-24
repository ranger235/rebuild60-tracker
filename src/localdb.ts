import Dexie, { type Table } from "dexie";

export type PendingOp = {
  id?: number;
  createdAt: number;
  op:
    | "upsert_daily"
    | "upsert_nutrition"
    | "insert_zone2"
    | "create_workout"
    | "insert_exercise"
    | "insert_set";
  payload: any;
  status: "queued" | "retry";
  lastError?: string;
};

export type LocalWorkoutSession = {
  id: string;          // uuid
  user_id: string;
  day_date: string;    // YYYY-MM-DD
  started_at: string;  // ISO
  title: string;
  notes?: string | null;
};

export type LocalWorkoutExercise = {
  id: string;          // uuid
  session_id: string;
  name: string;
  sort_order: number;
};

export type LocalWorkoutSet = {
  id: string;          // uuid
  exercise_id: string;
  set_number: number;
  weight_lbs?: number | null;
  reps?: number | null;
  rpe?: number | null;
  is_warmup: boolean;
};

export class RebuildDB extends Dexie {
  pendingOps!: Table<PendingOp, number>;

  // Local-first workout cache (for offline UI)
  localSessions!: Table<LocalWorkoutSession, string>;
  localExercises!: Table<LocalWorkoutExercise, string>;
  localSets!: Table<LocalWorkoutSet, string>;

  constructor() {
    super("rebuild60_local");

    this.version(1).stores({
      pendingOps: "++id, createdAt, op, status"
    });

    // v2 adds offline workout cache
    this.version(2).stores({
      pendingOps: "++id, createdAt, op, status",
      localSessions: "id, user_id, day_date, started_at",
      localExercises: "id, session_id, sort_order",
      localSets: "id, exercise_id, set_number"
    });
  }
}

export const localdb = new RebuildDB();

