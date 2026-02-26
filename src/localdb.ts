import Dexie, { Table } from "dexie";

export type LocalQueueItem = {
  id: string;
  op: string;
  payload: any;
  created_at: string;
};

export type LocalWorkoutSession = {
  id: string;
  user_id: string;
  day_date: string; // YYYY-MM-DD
  started_at: string; // ISO
  title: string;
  notes: string | null;

  // NEW
  exclude_from_analytics: boolean;
};

export type LocalWorkoutExercise = {
  id: string;
  session_id: string;
  name: string;
  sort_order: number;
};

export type LoadType = "weight" | "band" | "bodyweight";

export type LocalWorkoutSet = {
  id: string;
  exercise_id: string;
  set_number: number;

  // existing-ish
  weight_lbs: number | null;
  reps: number | null;
  rpe: number | null;
  is_warmup: boolean;

  // band support
  load_type: LoadType;
  band_level: number | null; // 1..5
  band_est_lbs: number | null; // est resistance
};

export type LocalWorkoutTemplate = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string; // ISO
};

export type LocalWorkoutTemplateExercise = {
  id: string;
  template_id: string;
  name: string;
  sort_order: number;
};

class LocalDB extends Dexie {
  localQueue!: Table<LocalQueueItem, string>;

  localSessions!: Table<LocalWorkoutSession, string>;
  localExercises!: Table<LocalWorkoutExercise, string>;
  localSets!: Table<LocalWorkoutSet, string>;

  localTemplates!: Table<LocalWorkoutTemplate, string>;
  localTemplateExercises!: Table<LocalWorkoutTemplateExercise, string>;

  constructor() {
    super("rebuild60");

    // If your version is already higher than 4, bump it by +1 and keep the upgrade() logic.
    this.version(5).stores({
      localQueue: "id, created_at, op",

      localSessions: "id, user_id, day_date, started_at",
      localExercises: "id, session_id, sort_order, name",
      localSets: "id, exercise_id, set_number",

      localTemplates: "id, user_id, created_at, name",
      localTemplateExercises: "id, template_id, sort_order, name"
    });

    this.version(5).upgrade(async (tx) => {
      const sessions = tx.table("localSessions");
      await sessions.toCollection().modify((s: any) => {
        if (s.exclude_from_analytics == null) s.exclude_from_analytics = false;
      });

      const sets = tx.table("localSets");
      await sets.toCollection().modify((s: any) => {
        if (s.load_type == null) s.load_type = "weight";
        if (s.band_level == null) s.band_level = null;
        if (s.band_est_lbs == null) s.band_est_lbs = null;
      });
    });
  }
}

export const localdb = new LocalDB();
  }
}

export const localdb = new RebuildDB();
