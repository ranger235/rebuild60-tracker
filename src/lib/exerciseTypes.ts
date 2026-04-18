export type ExerciseId = string;
export type ExerciseKey = string;

export type MovementPattern =
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "rear_delt"
  | "elbow_flexion"
  | "elbow_extension"
  | "squat"
  | "hinge"
  | "lunge"
  | "knee_flexion"
  | "calves"
  | "other";

export type EquipmentTag =
  | "barbell"
  | "dumbbell"
  | "bench"
  | "rack"
  | "cable"
  | "machine"
  | "bodyweight"
  | "band"
  | "ssb"
  | "other";

export type MuscleTag =
  | "chest"
  | "front_delts"
  | "side_delts"
  | "rear_delts"
  | "triceps"
  | "lats"
  | "upper_back"
  | "biceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "other";

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
  family: string;
  fatigue: "low" | "medium" | "high";
  compound: boolean;
  unilateral?: boolean;
  active?: boolean;
};
