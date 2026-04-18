export type ExerciseId = string;
export type ExerciseKey = string;

export type MovementPattern =
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "squat"
  | "hinge"
  | "knee_flexion"
  | "knee_extension"
  | "split_squat"
  | "elbow_flexion"
  | "elbow_extension"
  | "rear_delt"
  | "lateral_delt"
  | "chest_isolation"
  | "calves";

export type MuscleTag =
  | "chest"
  | "front_delts"
  | "side_delts"
  | "rear_delts"
  | "triceps"
  | "upper_back"
  | "lats"
  | "biceps"
  | "quads"
  | "glutes"
  | "hamstrings"
  | "calves";

export type EquipmentTag =
  | "barbell"
  | "dumbbell"
  | "bench"
  | "rack"
  | "machine"
  | "cable"
  | "bodyweight"
  | "band"
  | "ssb";

export type RoleTag =
  | "anchor"
  | "primary"
  | "secondary"
  | "accessory"
  | "pump";

export type ExerciseDefinition = {
  id: ExerciseId;
  key: ExerciseKey;
  canonicalName: string;
  aliases: string[];
  movementPatterns: MovementPattern[];
  primaryMuscles: MuscleTag[];
  secondaryMuscles: MuscleTag[];
  equipment: EquipmentTag[];
  roleTags: RoleTag[];
  family?: string;
  fatigue?: "low" | "medium" | "high";
  compound?: boolean;
  unilateral?: boolean;
  active?: boolean;
};
