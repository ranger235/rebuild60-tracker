import Dexie, { type Table } from "dexie";

/**
 * Local-first DB:
 * - pendingOps: offline sync queue (authoritative)
 * - localSessions/localExercises/localSets: offline workout cache
 * - localTemplates/localTemplateExercises: offline template cache
 */

export type PendingOpName =
  | "upsert_daily"
  | "upsert_nutrition"
  | "insert_zone2"
  | "create_workout"
  | "insert_exercise"
  | "insert_set"
  | "create_template"
  | "insert_template_exercise"
  | "update_template_exercise"
  | "delete_session"
  | "delete_set"
  | "renumber_sets"
  | "delete_exercise"
  | "reorder_exercises";

export type PendingOp = {
  id?: number; // Dexie autoincrement
  createdAt: number;
  op: PendingOpName;
  payload: any;
  status: "queued" | "retry";
  lastError?: string;
};

export type LocalSetting = {
  key: string; // e.g. 'analytics_start_date'
  user_id: string; // scope per user
  value: string; // stored as string (ISO date)
  updatedAt: number;
};

export type LocalExerciseAlias = {
  user_id: string;
  alias_raw: string;
  alias_norm: string;
  canonical_name: string;
  canonical_norm: string;
  updatedAt: number;
};

export type ExerciseTags = {
  muscle_groups?: string[]; // e.g. ["chest","triceps"]
  movement?: string | null; // e.g. "press"
  is_compound?: boolean;
};

export type LocalWorkoutSession = {
  id: string; // uuid
  user_id: string;
  day_date: string; // YYYY-MM-DD
  started_at: string; // ISO
  title: string;
  notes?: string | null;
  exclude_from_analytics?: boolean;
};

export type LocalWorkoutExercise = ExerciseTags & {
  id: string; // uuid
  session_id: string;
  name: string;
  sort_order: number;
};

export type LoadType = "weight" | "band" | "bodyweight";

export type LocalWorkoutSet = {
  id: string; // uuid
  exercise_id: string;
  set_number: number;

  load_type?: LoadType; // default weight
  weight_lbs?: number | null;

  band_level?: number | null; // 1..5
  band_mode?: "assist" | "resist" | null;
  band_config?: "single" | "doubled" | null;
  band_est_lbs?: number | null;

  reps?: number | null;
  rpe?: number | null;
  is_warmup: boolean;
};

// Templates (local-first)
export type LocalWorkoutTemplate = {
  id: string; // uuid
  user_id: string;
  name: string;
  description?: string | null;
  created_at: string; // ISO
};

export type LocalWorkoutTemplateExercise = ExerciseTags & {
  id: string; // uuid
  template_id: string;
  name: string;
  sort_order: number;
};

export class RebuildDB extends Dexie {
  pendingOps!: Table<PendingOp, number>;

  localSettings!: Table<LocalSetting, [string, string]>; // [user_id, key]
  localExerciseAliases!: Table<LocalExerciseAlias, [string, string]>; // [user_id, alias_norm]

  localSessions!: Table<LocalWorkoutSession, string>;
  localExercises!: Table<LocalWorkoutExercise, string>;
  localSets!: Table<LocalWorkoutSet, string>;

  localTemplates!: Table<LocalWorkoutTemplate, string>;
  localTemplateExercises!: Table<LocalWorkoutTemplateExercise, string>;

  constructor() {
    super("rebuild60_local");

    // v1: only pending ops
    this.version(1).stores({
      pendingOps: "++id, createdAt, op, status"
    });

    // v2: add offline caches
    this.version(2).stores({
      pendingOps: "++id, createdAt, op, status",
      localSessions: "id, user_id, day_date, started_at",
      localExercises: "id, session_id, sort_order",
      localSets: "id, exercise_id, set_number",
      localTemplates: "id, user_id, created_at",
      localTemplateExercises: "id, template_id, sort_order"
    });

    // v3: per-user settings
    this.version(3).stores({
      pendingOps: "++id, createdAt, op, status",
      localSettings: "[user_id+key], user_id, key, updatedAt",
      localSessions: "id, user_id, day_date, started_at",
      localExercises: "id, session_id, sort_order",
      localSets: "id, exercise_id, set_number",
      localTemplates: "id, user_id, created_at",
      localTemplateExercises: "id, template_id, sort_order"
    });

    // v4: exercise aliases (normalize names for analytics + clean entry)
    this.version(4).stores({
      pendingOps: "++id, createdAt, op, status",
      localSettings: "[user_id+key], user_id, key, updatedAt",
      localExerciseAliases: "[user_id+alias_norm], user_id, alias_norm, updatedAt",
      localSessions: "id, user_id, day_date, started_at",
      localExercises: "id, session_id, sort_order",
      localSets: "id, exercise_id, set_number",
      localTemplates: "id, user_id, created_at",
      localTemplateExercises: "id, template_id, sort_order"
    });
  }
}

export const localdb = new RebuildDB();


