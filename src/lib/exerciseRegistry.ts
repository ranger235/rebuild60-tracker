import type {
  ExerciseDefinition,
  ExerciseKey,
  MovementPattern,
  MuscleTag,
  RoleTag,
} from "./exerciseTypes";
import type { Slot } from "./slotTypes";

function normalizeAlias(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}


function uniqueSlots(slots: Slot[]): Slot[] {
  return [...new Set(slots.filter(Boolean))];
}

function inferAllowedSlots(input: ExerciseSeedInput): Slot[] {
  if (input.allowedSlots?.length) return uniqueSlots([...input.allowedSlots]);

  const patterns = new Set(input.movementPatterns);
  const roles = new Set(input.roleTags);
  const slots: Slot[] = [];

  if (patterns.has("horizontal_push")) {
    if (roles.has("anchor") || roles.has("primary")) slots.push("PrimaryPress");
    if (roles.has("primary") || roles.has("secondary")) slots.push("SecondaryPress");
    if (roles.has("accessory") || roles.has("pump")) slots.push("Pump");
  }
  if (patterns.has("vertical_push")) {
    if (roles.has("primary") || roles.has("secondary")) slots.push("SecondaryPress", "Shoulders");
    if (roles.has("accessory") || roles.has("pump")) slots.push("Shoulders", "Pump");
  }
  if (patterns.has("elbow_extension")) {
    slots.push("Triceps");
    if (roles.has("pump") || roles.has("accessory")) slots.push("Pump");
  }
  if (patterns.has("horizontal_pull")) {
    if (roles.has("anchor") || roles.has("primary")) slots.push("PrimaryRow");
    if (roles.has("primary") || roles.has("secondary") || roles.has("accessory") || roles.has("pump")) slots.push("SecondaryRow");
  }
  if (patterns.has("vertical_pull")) {
    slots.push("VerticalPull");
  }
  if (patterns.has("rear_delt") || input.primaryMuscles.includes("rear_delts")) {
    slots.push("RearDelts");
  }
  if (patterns.has("elbow_flexion")) {
    slots.push("Biceps");
  }
  if (patterns.has("squat")) {
    if (roles.has("anchor") || roles.has("primary")) slots.push("PrimarySquat");
    if (roles.has("secondary") || roles.has("accessory")) slots.push("SecondaryQuad");
  }
  if (patterns.has("lunge")) {
    slots.push("SecondaryQuad");
  }
  if (patterns.has("hinge")) {
    if (roles.has("anchor") || roles.has("primary")) slots.push("Hinge");
    if (roles.has("secondary") || roles.has("accessory")) slots.push("Hamstrings");
  }
  if (patterns.has("knee_flexion")) {
    slots.push("Hamstrings");
  }
  if (patterns.has("calves")) {
    slots.push("Calves");
  }
  if (slots.length === 0 && (roles.has("pump") || roles.has("accessory"))) {
    slots.push("Pump");
  }

  return uniqueSlots(slots);
}

function inferCluster(input: ExerciseSeedInput): string | undefined {
  if (input.family.includes("horizontal_press")) return "press_anchor";
  if (input.family.includes("vertical_press")) return input.primaryMuscles.includes("side_delts") ? "lateral_delt" : "vertical_press";
  if (input.family.includes("triceps") || input.movementPatterns.includes("elbow_extension")) return "triceps_extension";
  if (input.family.includes("biceps") || input.movementPatterns.includes("elbow_flexion")) return "biceps_curl";
  if (input.family.includes("row") || input.movementPatterns.includes("horizontal_pull")) return input.roleTags.includes("anchor") ? "row_anchor" : "row_accessory";
  if (input.movementPatterns.includes("vertical_pull")) return "vertical_pull";
  if (input.family.includes("shrug")) return "shrug";
  if (input.family.includes("serratus")) return "serratus";
  if (input.family.includes("lower_trap") || input.key.includes("y_raise") || input.key.includes("trap_3")) return "lower_trap";
  if (input.primaryMuscles.includes("rear_delts") || input.movementPatterns.includes("rear_delt")) return "rear_delt";
  if (input.movementPatterns.includes("squat") || input.movementPatterns.includes("lunge")) return input.roleTags.includes("anchor") ? "quad_anchor" : "quad_accessory";
  if (input.movementPatterns.includes("hinge")) return input.roleTags.includes("anchor") ? "hinge_anchor" : "hinge_accessory";
  if (input.movementPatterns.includes("knee_flexion")) return "hamstrings";
  if (input.movementPatterns.includes("calves")) return "calves";
  return undefined;
}

function inferPriority(input: ExerciseSeedInput): number {
  if (typeof input.priority === "number") return input.priority;
  if (input.roleTags.includes("anchor")) return 1;
  if (input.roleTags.includes("primary")) return input.compound ? 0.88 : 0.75;
  if (input.roleTags.includes("secondary")) return input.compound ? 0.76 : 0.62;
  if (input.roleTags.includes("accessory")) return 0.55;
  return 0.35;
}

function inferNoveltyCost(input: ExerciseSeedInput): number {
  if (typeof input.noveltyCost === "number") return input.noveltyCost;
  if (input.roleTags.includes("anchor")) return 0.1;
  if (input.roleTags.includes("primary")) return 0.18;
  if (input.roleTags.includes("secondary")) return 0.28;
  if (input.roleTags.includes("accessory")) return 0.42;
  return 0.55;
}

function inferSetupFriction(input: ExerciseSeedInput): number {
  if (typeof input.setupFriction === "number") return input.setupFriction;
  if (input.equipment.includes("bodyweight") || input.equipment.includes("band")) return 0.12;
  if (input.equipment.includes("machine") || input.equipment.includes("cable")) return 0.25;
  if (input.equipment.includes("barbell") && input.equipment.includes("bench")) return 0.28;
  if (input.equipment.includes("barbell")) return 0.22;
  if (input.equipment.includes("dumbbell")) return 0.18;
  return 0.2;
}

const EXERCISE_META_OVERRIDES: Partial<Record<ExerciseKey, Pick<ExerciseDefinition, "priority" | "noveltyCost" | "setupFriction" | "allowedSlots" | "cluster">>> = {
  chest_supported_row: { priority: 0.74, noveltyCost: 0.3, setupFriction: 0.72, allowedSlots: ["PrimaryRow", "SecondaryRow"], cluster: "row_anchor" },
  barbell_row: { priority: 1.0, noveltyCost: 0.1, setupFriction: 0.2, allowedSlots: ["PrimaryRow", "SecondaryRow"], cluster: "row_anchor" },
  underhand_barbell_row: { priority: 0.84, noveltyCost: 0.24, setupFriction: 0.22, allowedSlots: ["PrimaryRow", "SecondaryRow"], cluster: "row_anchor" },
  one_arm_dumbbell_row: { priority: 0.86, noveltyCost: 0.16, setupFriction: 0.18, allowedSlots: ["SecondaryRow"], cluster: "row_anchor" },
  incline_dumbbell_row: { priority: 0.8, noveltyCost: 0.22, setupFriction: 0.42, allowedSlots: ["SecondaryRow"], cluster: "row_accessory" },
  lat_focus_row: { priority: 0.74, noveltyCost: 0.28, setupFriction: 0.18, allowedSlots: ["SecondaryRow"], cluster: "row_accessory" },
  seal_row: { priority: 0.72, noveltyCost: 0.35, setupFriction: 0.78, allowedSlots: ["SecondaryRow"], cluster: "row_accessory" },
  seated_cable_row: { priority: 0.82, noveltyCost: 0.18, setupFriction: 0.24, allowedSlots: ["SecondaryRow"], cluster: "row_anchor" },
  t_bar_row: { priority: 0.78, noveltyCost: 0.24, setupFriction: 0.62, allowedSlots: ["SecondaryRow"], cluster: "row_anchor" },
  band_row: { priority: 0.58, noveltyCost: 0.32, setupFriction: 0.08, allowedSlots: ["SecondaryRow"], cluster: "row_accessory" },
  scapular_row: { priority: 0.32, noveltyCost: 0.62, setupFriction: 0.14, allowedSlots: ["SecondaryRow", "Pump"], cluster: "scap_control" },
  pull_up: { priority: 0.95, noveltyCost: 0.12, setupFriction: 0.12, allowedSlots: ["VerticalPull"], cluster: "vertical_pull" },
  weighted_pull_up: { priority: 0.92, noveltyCost: 0.18, setupFriction: 0.2, allowedSlots: ["VerticalPull"], cluster: "vertical_pull" },
  chin_up: { priority: 0.94, noveltyCost: 0.12, setupFriction: 0.12, allowedSlots: ["VerticalPull"], cluster: "vertical_pull" },
  weighted_chin_up: { priority: 0.9, noveltyCost: 0.18, setupFriction: 0.2, allowedSlots: ["VerticalPull"], cluster: "vertical_pull" },
  lat_pulldown: { priority: 0.9, noveltyCost: 0.12, setupFriction: 0.18, allowedSlots: ["VerticalPull"], cluster: "vertical_pull" },
  assisted_pull_up: { priority: 0.7, noveltyCost: 0.2, setupFriction: 0.16, allowedSlots: ["VerticalPull"], cluster: "vertical_pull" },
  band_assisted_chin_up: { priority: 0.68, noveltyCost: 0.28, setupFriction: 0.16, allowedSlots: ["VerticalPull"], cluster: "vertical_pull" },
  straight_arm_pulldown: { priority: 0.46, noveltyCost: 0.52, setupFriction: 0.22, allowedSlots: ["VerticalPull", "Pump"], cluster: "lat_isolation" },
  dumbbell_pullover: { priority: 0.42, noveltyCost: 0.46, setupFriction: 0.2, allowedSlots: ["VerticalPull", "Pump"], cluster: "lat_isolation" },
  barbell_shrug: { priority: 0.28, noveltyCost: 0.58, setupFriction: 0.18, allowedSlots: ["Pump"], cluster: "shrug" },
  dumbbell_shrug: { priority: 0.3, noveltyCost: 0.5, setupFriction: 0.12, allowedSlots: ["Pump"], cluster: "shrug" },
  behind_back_shrug: { priority: 0.22, noveltyCost: 0.72, setupFriction: 0.44, allowedSlots: ["Pump"], cluster: "shrug" },
  band_shrug: { priority: 0.24, noveltyCost: 0.65, setupFriction: 0.08, allowedSlots: ["Pump"], cluster: "shrug" },
  face_pull: { priority: 0.5, noveltyCost: 0.34, setupFriction: 0.18, allowedSlots: ["RearDelts", "Pump"] , cluster: "rear_delt"},
  band_pull_apart: { priority: 0.42, noveltyCost: 0.36, setupFriction: 0.08, allowedSlots: ["RearDelts", "Pump"], cluster: "rear_delt" },
  rear_delt_fly: { priority: 0.52, noveltyCost: 0.3, setupFriction: 0.14, allowedSlots: ["RearDelts", "Pump"], cluster: "rear_delt" },
  incline_rear_delt_raise: { priority: 0.42, noveltyCost: 0.46, setupFriction: 0.22, allowedSlots: ["RearDelts", "Pump"], cluster: "rear_delt" },
  rear_delt_row: { priority: 0.4, noveltyCost: 0.48, setupFriction: 0.18, allowedSlots: ["RearDelts", "Pump"], cluster: "rear_delt" },
  prone_y_raise: { priority: 0.24, noveltyCost: 0.76, setupFriction: 0.2, allowedSlots: ["RearDelts", "Pump"], cluster: "lower_trap" },
  trap_3_raise: { priority: 0.22, noveltyCost: 0.8, setupFriction: 0.18, allowedSlots: ["RearDelts", "Pump"], cluster: "lower_trap" },
  serratus_pushdown: { priority: 0.2, noveltyCost: 0.82, setupFriction: 0.16, allowedSlots: ["Pump"], cluster: "serratus" },
  scapular_push_up: { priority: 0.18, noveltyCost: 0.72, setupFriction: 0.08, allowedSlots: ["Pump"], cluster: "serratus" },
  wall_slide: { priority: 0.16, noveltyCost: 0.84, setupFriction: 0.08, allowedSlots: ["Pump"], cluster: "serratus" },
  scapular_pull_up: { priority: 0.2, noveltyCost: 0.76, setupFriction: 0.1, allowedSlots: ["VerticalPull", "Pump"], cluster: "serratus" },
  bench_press: { priority: 1.0, noveltyCost: 0.08, setupFriction: 0.18, allowedSlots: ["PrimaryPress", "SecondaryPress"], cluster: "press_anchor" },
  incline_bench_press: { priority: 0.92, noveltyCost: 0.12, setupFriction: 0.2, allowedSlots: ["PrimaryPress", "SecondaryPress"], cluster: "press_anchor" },
  dumbbell_bench_press: { priority: 0.86, noveltyCost: 0.14, setupFriction: 0.12, allowedSlots: ["PrimaryPress", "SecondaryPress"], cluster: "press_anchor" },
  close_grip_bench_press: { priority: 0.78, noveltyCost: 0.24, setupFriction: 0.22, allowedSlots: ["SecondaryPress", "Triceps"], cluster: "press_anchor" },
  paused_bench_press: { priority: 0.82, noveltyCost: 0.22, setupFriction: 0.18, allowedSlots: ["PrimaryPress", "SecondaryPress"], cluster: "press_anchor" },
  feet_up_bench_press: { priority: 0.68, noveltyCost: 0.34, setupFriction: 0.18, allowedSlots: ["SecondaryPress"], cluster: "press_anchor" },
  larsen_press: { priority: 0.66, noveltyCost: 0.38, setupFriction: 0.18, allowedSlots: ["SecondaryPress"], cluster: "press_anchor" },
  incline_dumbbell_press: { priority: 0.8, noveltyCost: 0.18, setupFriction: 0.12, allowedSlots: ["SecondaryPress"], cluster: "press_anchor" },
  overhead_press: { priority: 0.92, noveltyCost: 0.14, setupFriction: 0.18, allowedSlots: ["SecondaryPress", "Shoulders"], cluster: "vertical_press" },
  shoulder_press: { priority: 0.7, noveltyCost: 0.22, setupFriction: 0.16, allowedSlots: ["Shoulders", "SecondaryPress"], cluster: "vertical_press" },
  seated_dumbbell_press: { priority: 0.76, noveltyCost: 0.2, setupFriction: 0.14, allowedSlots: ["Shoulders", "SecondaryPress"], cluster: "vertical_press" },
  arnold_press: { priority: 0.62, noveltyCost: 0.34, setupFriction: 0.16, allowedSlots: ["Shoulders"], cluster: "vertical_press" },
  lateral_raise: { priority: 0.58, noveltyCost: 0.2, setupFriction: 0.1, allowedSlots: ["Shoulders", "Pump"], cluster: "lateral_delt" },
  leaning_lateral_raise: { priority: 0.56, noveltyCost: 0.36, setupFriction: 0.12, allowedSlots: ["Shoulders", "Pump"], cluster: "lateral_delt" },
  cable_lateral_raise: { priority: 0.54, noveltyCost: 0.32, setupFriction: 0.2, allowedSlots: ["Shoulders", "Pump"], cluster: "lateral_delt" },
  front_raise: { priority: 0.24, noveltyCost: 0.68, setupFriction: 0.1, allowedSlots: ["Shoulders", "Pump"], cluster: "front_delt" },
  dip: { priority: 0.66, noveltyCost: 0.22, setupFriction: 0.16, allowedSlots: ["Triceps", "Pump"], cluster: "triceps_press" },
  triceps_pressdown: { priority: 0.62, noveltyCost: 0.2, setupFriction: 0.14, allowedSlots: ["Triceps", "Pump"], cluster: "triceps_extension" },
  overhead_triceps_extension: { priority: 0.56, noveltyCost: 0.28, setupFriction: 0.12, allowedSlots: ["Triceps", "Pump"], cluster: "triceps_extension" },
  skullcrusher: { priority: 0.54, noveltyCost: 0.26, setupFriction: 0.12, allowedSlots: ["Triceps", "Pump"], cluster: "triceps_extension" },
  push_up: { priority: 0.44, noveltyCost: 0.18, setupFriction: 0.06, allowedSlots: ["Pump"], cluster: "pushup" },
  weighted_push_up: { priority: 0.52, noveltyCost: 0.26, setupFriction: 0.12, allowedSlots: ["Pump"], cluster: "pushup" },
  band_resisted_push_up: { priority: 0.5, noveltyCost: 0.28, setupFriction: 0.12, allowedSlots: ["Pump"], cluster: "pushup" },
  close_grip_push_up: { priority: 0.46, noveltyCost: 0.26, setupFriction: 0.08, allowedSlots: ["Triceps", "Pump"], cluster: "pushup" },
  pec_deck: { priority: 0.34, noveltyCost: 0.44, setupFriction: 0.1, allowedSlots: ["Pump"], cluster: "chest_iso" },
  hammer_curl: { priority: 0.64, noveltyCost: 0.18, setupFriction: 0.08, allowedSlots: ["Biceps"], cluster: "biceps_curl" },
  curl: { priority: 0.6, noveltyCost: 0.16, setupFriction: 0.08, allowedSlots: ["Biceps"], cluster: "biceps_curl" },
  incline_dumbbell_curl: { priority: 0.56, noveltyCost: 0.24, setupFriction: 0.14, allowedSlots: ["Biceps"], cluster: "biceps_curl" },
  preacher_curl: { priority: 0.46, noveltyCost: 0.32, setupFriction: 0.22, allowedSlots: ["Biceps"], cluster: "biceps_curl" },
  ssb_squat: { priority: 1.0, noveltyCost: 0.08, setupFriction: 0.18, allowedSlots: ["PrimarySquat"], cluster: "quad_anchor" },
  squat: { priority: 0.96, noveltyCost: 0.08, setupFriction: 0.16, allowedSlots: ["PrimarySquat"], cluster: "quad_anchor" },
  high_bar_squat: { priority: 0.9, noveltyCost: 0.18, setupFriction: 0.18, allowedSlots: ["PrimarySquat"], cluster: "quad_anchor" },
  box_squat: { priority: 0.78, noveltyCost: 0.28, setupFriction: 0.28, allowedSlots: ["PrimarySquat", "SecondaryQuad"], cluster: "quad_anchor" },
  leverage_squat: { priority: 0.82, noveltyCost: 0.18, setupFriction: 0.2, allowedSlots: ["PrimarySquat", "SecondaryQuad"], cluster: "quad_anchor" },
  goblet_squat: { priority: 0.62, noveltyCost: 0.22, setupFriction: 0.08, allowedSlots: ["SecondaryQuad"], cluster: "quad_accessory" },
  heel_elevated_squat: { priority: 0.58, noveltyCost: 0.34, setupFriction: 0.1, allowedSlots: ["SecondaryQuad"], cluster: "quad_accessory" },
  split_squat: { priority: 0.7, noveltyCost: 0.18, setupFriction: 0.12, allowedSlots: ["SecondaryQuad"], cluster: "quad_accessory" },
  bulgarian_split_squat: { priority: 0.66, noveltyCost: 0.28, setupFriction: 0.16, allowedSlots: ["SecondaryQuad"], cluster: "quad_accessory" },
  step_up: { priority: 0.54, noveltyCost: 0.36, setupFriction: 0.14, allowedSlots: ["SecondaryQuad"], cluster: "quad_accessory" },
  leg_extension: { priority: 0.58, noveltyCost: 0.18, setupFriction: 0.12, allowedSlots: ["SecondaryQuad"], cluster: "quad_accessory" },
  romanian_deadlift: { priority: 1.0, noveltyCost: 0.08, setupFriction: 0.16, allowedSlots: ["Hinge", "Hamstrings"], cluster: "hinge_anchor" },
  deadlift: { priority: 0.96, noveltyCost: 0.12, setupFriction: 0.22, allowedSlots: ["Hinge"], cluster: "hinge_anchor" },
  stiff_leg_deadlift: { priority: 0.84, noveltyCost: 0.2, setupFriction: 0.18, allowedSlots: ["Hinge", "Hamstrings"], cluster: "hinge_anchor" },
  good_morning: { priority: 0.72, noveltyCost: 0.28, setupFriction: 0.22, allowedSlots: ["Hinge", "Hamstrings"], cluster: "hinge_accessory" },
  hip_thrust: { priority: 0.74, noveltyCost: 0.22, setupFriction: 0.26, allowedSlots: ["Hinge", "Hamstrings"], cluster: "hinge_accessory" },
  glute_bridge: { priority: 0.52, noveltyCost: 0.3, setupFriction: 0.12, allowedSlots: ["Hamstrings"], cluster: "hinge_accessory" },
  back_extension: { priority: 0.56, noveltyCost: 0.24, setupFriction: 0.16, allowedSlots: ["Hinge", "Hamstrings"], cluster: "hinge_accessory" },
  band_pull_through: { priority: 0.46, noveltyCost: 0.34, setupFriction: 0.08, allowedSlots: ["Hamstrings"], cluster: "hinge_accessory" },
  hamstring_curl: { priority: 0.68, noveltyCost: 0.18, setupFriction: 0.14, allowedSlots: ["Hamstrings"], cluster: "hamstrings" },
  seated_leg_curl: { priority: 0.62, noveltyCost: 0.22, setupFriction: 0.16, allowedSlots: ["Hamstrings"], cluster: "hamstrings" },
  lying_leg_curl: { priority: 0.64, noveltyCost: 0.2, setupFriction: 0.14, allowedSlots: ["Hamstrings"], cluster: "hamstrings" },
  band_leg_curl: { priority: 0.48, noveltyCost: 0.3, setupFriction: 0.08, allowedSlots: ["Hamstrings"], cluster: "hamstrings" },
  glute_ham_raise: { priority: 0.46, noveltyCost: 0.42, setupFriction: 0.5, allowedSlots: ["Hamstrings"], cluster: "hamstrings" },
  calf_raise: { priority: 0.68, noveltyCost: 0.12, setupFriction: 0.08, allowedSlots: ["Calves"], cluster: "calves" },
  single_leg_calf_raise: { priority: 0.58, noveltyCost: 0.22, setupFriction: 0.06, allowedSlots: ["Calves"], cluster: "calves" },
  seated_calf_raise: { priority: 0.52, noveltyCost: 0.26, setupFriction: 0.14, allowedSlots: ["Calves"], cluster: "calves" },
  leg_press_calf_raise: { priority: 0.38, noveltyCost: 0.3, setupFriction: 0.2, allowedSlots: ["Calves"], cluster: "calves" },
};


type ExerciseSeedInput = {
  key: ExerciseKey;
  canonicalName: string;
  aliases?: string[];
  movementPatterns: MovementPattern[];
  primaryMuscles: MuscleTag[];
  secondaryMuscles?: MuscleTag[];
  equipment: ExerciseDefinition["equipment"];
  roleTags: RoleTag[];
  family: string;
  fatigue: ExerciseDefinition["fatigue"];
  compound: boolean;
  unilateral?: boolean;
  priority?: number;
  noveltyCost?: number;
  setupFriction?: number;
  allowedSlots?: Slot[];
  cluster?: string;
};

function seedExercise(input: ExerciseSeedInput): ExerciseDefinition {
  const aliases = new Set<string>([
    input.key,
    input.canonicalName,
    ...(input.aliases ?? []),
  ].map(normalizeAlias).filter(Boolean));

  const inferredAllowedSlots = inferAllowedSlots(input);
  const override = EXERCISE_META_OVERRIDES[input.key] ?? {};

  return {
    id: input.key,
    key: input.key,
    canonicalName: input.canonicalName,
    aliases: [...aliases],
    movementPatterns: [...input.movementPatterns],
    primaryMuscles: [...input.primaryMuscles],
    secondaryMuscles: [...(input.secondaryMuscles ?? [])],
    equipment: [...input.equipment],
    roleTags: [...input.roleTags],
    family: input.family,
    fatigue: input.fatigue,
    compound: input.compound,
    unilateral: input.unilateral,
    active: true,
    priority: override.priority ?? inferPriority(input),
    noveltyCost: override.noveltyCost ?? inferNoveltyCost(input),
    setupFriction: override.setupFriction ?? inferSetupFriction(input),
    allowedSlots: uniqueSlots([...(override.allowedSlots ?? inferredAllowedSlots)]),
    cluster: override.cluster ?? inferCluster(input),
  };
}

const EXERCISES: ExerciseDefinition[] = [
  seedExercise({
    key: "bench_press",
    canonicalName: "Bench Press",
    aliases: ["bench", "barbell bench press"],
    movementPatterns: ["horizontal_push"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts", "triceps"],
    equipment: ["barbell", "bench", "rack"],
    roleTags: ["anchor", "primary"],
    family: "horizontal_press",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "incline_bench_press",
    canonicalName: "Incline Bench Press",
    aliases: ["incline bench", "incline barbell bench press"],
    movementPatterns: ["horizontal_push", "vertical_push"],
    primaryMuscles: ["chest", "front_delts"],
    secondaryMuscles: ["triceps"],
    equipment: ["barbell", "bench", "rack"],
    roleTags: ["primary", "secondary"],
    family: "horizontal_press",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "dumbbell_bench_press",
    canonicalName: "DB Bench Press",
    aliases: ["db bench press", "dumbbell bench", "flat dumbbell press"],
    movementPatterns: ["horizontal_push"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts", "triceps"],
    equipment: ["dumbbell", "bench"],
    roleTags: ["primary", "secondary"],
    family: "horizontal_press",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "chest_press",
    canonicalName: "Chest Press",
    aliases: ["machine chest press"],
    movementPatterns: ["horizontal_push"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts", "triceps"],
    equipment: ["machine"],
    roleTags: ["primary", "secondary"],
    family: "horizontal_press",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "overhead_press",
    canonicalName: "Overhead Press",
    aliases: ["ohp", "standing overhead press"],
    movementPatterns: ["vertical_push"],
    primaryMuscles: ["front_delts", "triceps"],
    secondaryMuscles: ["chest"],
    equipment: ["barbell", "rack"],
    roleTags: ["primary", "secondary"],
    family: "vertical_press",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "shoulder_press",
    canonicalName: "Shoulder Press",
    aliases: ["machine shoulder press", "db shoulder press"],
    movementPatterns: ["vertical_push"],
    primaryMuscles: ["front_delts"],
    secondaryMuscles: ["triceps"],
    equipment: ["machine", "dumbbell"],
    roleTags: ["secondary", "accessory"],
    family: "vertical_press",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "lateral_raise",
    canonicalName: "Lateral Raise",
    aliases: ["db lateral raise", "side lateral raise"],
    movementPatterns: ["vertical_push"],
    primaryMuscles: ["side_delts"],
    secondaryMuscles: [],
    equipment: ["dumbbell", "cable", "band"],
    roleTags: ["accessory", "pump"],
    family: "side_delt_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "rear_delt_fly",
    canonicalName: "Rear Delt Fly",
    aliases: ["rear delt raise", "reverse fly"],
    movementPatterns: ["rear_delt"],
    primaryMuscles: ["rear_delts"],
    secondaryMuscles: ["upper_back"],
    equipment: ["dumbbell", "machine", "cable"],
    roleTags: ["accessory", "pump"],
    family: "rear_delt_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "dip",
    canonicalName: "Dip",
    aliases: ["weighted dip", "bodyweight dip"],
    movementPatterns: ["vertical_push"],
    primaryMuscles: ["chest", "triceps"],
    secondaryMuscles: ["front_delts"],
    equipment: ["bodyweight", "other"],
    roleTags: ["secondary", "accessory"],
    family: "dip_pattern",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "triceps_pressdown",
    canonicalName: "Triceps Pressdown",
    aliases: ["pressdown", "cable pressdown"],
    movementPatterns: ["elbow_extension"],
    primaryMuscles: ["triceps"],
    equipment: ["cable", "band"],
    roleTags: ["accessory", "pump"],
    family: "triceps_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "overhead_triceps_extension",
    canonicalName: "Overhead Triceps Extension",
    aliases: ["overhead extension", "triceps extension"],
    movementPatterns: ["elbow_extension"],
    primaryMuscles: ["triceps"],
    equipment: ["dumbbell", "cable", "band"],
    roleTags: ["accessory"],
    family: "triceps_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "skullcrusher",
    canonicalName: "Skullcrusher",
    aliases: ["lying triceps extension", "skull crusher"],
    movementPatterns: ["elbow_extension"],
    primaryMuscles: ["triceps"],
    equipment: ["barbell", "dumbbell", "bench"],
    roleTags: ["accessory"],
    family: "triceps_isolation",
    fatigue: "medium",
    compound: false,
  }),
  seedExercise({
    key: "push_up",
    canonicalName: "Push-Up",
    aliases: ["pushup", "push ups", "pushups"],
    movementPatterns: ["horizontal_push"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts", "triceps"],
    equipment: ["bodyweight"],
    roleTags: ["pump", "accessory"],
    family: "horizontal_press",
    fatigue: "low",
    compound: true,
  }),
  seedExercise({
    key: "pec_deck",
    canonicalName: "Pec Deck",
    aliases: ["pec fly", "machine fly"],
    movementPatterns: ["horizontal_push"],
    primaryMuscles: ["chest"],
    equipment: ["machine"],
    roleTags: ["pump", "accessory"],
    family: "chest_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "barbell_row",
    canonicalName: "Barbell Row",
    aliases: ["bent over row", "bb row"],
    movementPatterns: ["horizontal_pull"],
    primaryMuscles: ["upper_back", "lats"],
    secondaryMuscles: ["biceps"],
    equipment: ["barbell"],
    roleTags: ["anchor", "primary"],
    family: "row_pattern",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "chest_supported_row",
    canonicalName: "Chest Supported Row",
    aliases: ["supported row", "chest-supported row"],
    movementPatterns: ["horizontal_pull"],
    primaryMuscles: ["upper_back", "lats"],
    secondaryMuscles: ["biceps"],
    equipment: ["bench", "dumbbell", "machine"],
    roleTags: ["anchor", "primary", "secondary"],
    family: "row_pattern",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "seated_cable_row",
    canonicalName: "Seated Cable Row",
    aliases: ["cable row", "seated row"],
    movementPatterns: ["horizontal_pull"],
    primaryMuscles: ["upper_back", "lats"],
    secondaryMuscles: ["biceps"],
    equipment: ["cable"],
    roleTags: ["anchor", "primary", "secondary"],
    family: "row_pattern",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "t_bar_row",
    canonicalName: "T-Bar Row",
    aliases: ["tbar row"],
    movementPatterns: ["horizontal_pull"],
    primaryMuscles: ["upper_back", "lats"],
    secondaryMuscles: ["biceps"],
    equipment: ["barbell", "machine", "other"],
    roleTags: ["anchor", "primary"],
    family: "row_pattern",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "pull_up",
    canonicalName: "Pull-Up",
    aliases: ["pullup", "pull up"],
    movementPatterns: ["vertical_pull"],
    primaryMuscles: ["lats", "upper_back"],
    secondaryMuscles: ["biceps"],
    equipment: ["bodyweight", "other"],
    roleTags: ["anchor", "primary"],
    family: "vertical_pull_pattern",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "chin_up",
    canonicalName: "Chin-Up",
    aliases: ["chinup", "chin up"],
    movementPatterns: ["vertical_pull"],
    primaryMuscles: ["lats", "biceps"],
    secondaryMuscles: ["upper_back"],
    equipment: ["bodyweight", "other"],
    roleTags: ["anchor", "primary"],
    family: "vertical_pull_pattern",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "lat_pulldown",
    canonicalName: "Lat Pulldown",
    aliases: ["pulldown", "lat pull down", "lat pull"],
    movementPatterns: ["vertical_pull"],
    primaryMuscles: ["lats"],
    secondaryMuscles: ["upper_back", "biceps"],
    equipment: ["cable", "machine", "band"],
    roleTags: ["anchor", "primary", "secondary"],
    family: "vertical_pull_pattern",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "assisted_pull_up",
    canonicalName: "Assisted Pull-Up",
    aliases: ["band assisted pull up", "assisted pullup"],
    movementPatterns: ["vertical_pull"],
    primaryMuscles: ["lats", "upper_back"],
    secondaryMuscles: ["biceps"],
    equipment: ["machine", "band", "bodyweight"],
    roleTags: ["primary", "secondary"],
    family: "vertical_pull_pattern",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "one_arm_dumbbell_row",
    canonicalName: "One-Arm DB Row",
    aliases: ["one arm row", "single arm dumbbell row"],
    movementPatterns: ["horizontal_pull"],
    primaryMuscles: ["lats", "upper_back"],
    secondaryMuscles: ["biceps"],
    equipment: ["dumbbell", "bench"],
    roleTags: ["secondary", "accessory"],
    family: "row_pattern",
    fatigue: "medium",
    compound: true,
    unilateral: true,
  }),
  seedExercise({
    key: "face_pull",
    canonicalName: "Face Pull",
    aliases: ["rope face pull"],
    movementPatterns: ["rear_delt"],
    primaryMuscles: ["rear_delts", "upper_back"],
    equipment: ["cable", "band"],
    roleTags: ["accessory", "pump"],
    family: "rear_delt_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "reverse_pec_deck",
    canonicalName: "Reverse Pec Deck",
    aliases: ["reverse fly machine"],
    movementPatterns: ["rear_delt"],
    primaryMuscles: ["rear_delts"],
    secondaryMuscles: ["upper_back"],
    equipment: ["machine"],
    roleTags: ["accessory", "pump"],
    family: "rear_delt_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "band_pull_apart",
    canonicalName: "Band Pull-Apart",
    aliases: ["band pull apart", "pull apart"],
    movementPatterns: ["rear_delt"],
    primaryMuscles: ["rear_delts", "upper_back"],
    equipment: ["band"],
    roleTags: ["accessory", "pump"],
    family: "rear_delt_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "hammer_curl",
    canonicalName: "Hammer Curl",
    aliases: ["db hammer curl"],
    movementPatterns: ["elbow_flexion"],
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["upper_back"],
    equipment: ["dumbbell", "cable", "band"],
    roleTags: ["accessory", "pump"],
    family: "biceps_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "curl",
    canonicalName: "Curl",
    aliases: ["barbell curl", "biceps curl"],
    movementPatterns: ["elbow_flexion"],
    primaryMuscles: ["biceps"],
    equipment: ["barbell", "dumbbell", "cable", "band"],
    roleTags: ["accessory", "pump"],
    family: "biceps_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "incline_dumbbell_curl",
    canonicalName: "Incline DB Curl",
    aliases: ["incline curl", "incline dumbbell biceps curl"],
    movementPatterns: ["elbow_flexion"],
    primaryMuscles: ["biceps"],
    equipment: ["dumbbell", "bench"],
    roleTags: ["accessory"],
    family: "biceps_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "preacher_curl",
    canonicalName: "Preacher Curl",
    aliases: ["preacher curl machine"],
    movementPatterns: ["elbow_flexion"],
    primaryMuscles: ["biceps"],
    equipment: ["barbell", "dumbbell", "machine"],
    roleTags: ["accessory"],
    family: "biceps_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "ssb_squat",
    canonicalName: "SSB Squat",
    aliases: ["safety squat bar squat", "safety squat"],
    movementPatterns: ["squat"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["ssb", "rack"],
    roleTags: ["anchor", "primary"],
    family: "squat_pattern",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "squat",
    canonicalName: "Squat",
    aliases: ["barbell squat", "back squat"],
    movementPatterns: ["squat"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["barbell", "rack"],
    roleTags: ["anchor", "primary"],
    family: "squat_pattern",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "romanian_deadlift",
    canonicalName: "Romanian Deadlift",
    aliases: ["rdl"],
    movementPatterns: ["hinge"],
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["upper_back"],
    equipment: ["barbell", "dumbbell"],
    roleTags: ["anchor", "primary"],
    family: "hinge_pattern",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "deadlift",
    canonicalName: "Deadlift",
    aliases: ["conventional deadlift"],
    movementPatterns: ["hinge"],
    primaryMuscles: ["hamstrings", "glutes", "upper_back"],
    equipment: ["barbell"],
    roleTags: ["anchor", "primary"],
    family: "hinge_pattern",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "good_morning",
    canonicalName: "Good Morning",
    aliases: ["barbell good morning"],
    movementPatterns: ["hinge"],
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["upper_back"],
    equipment: ["barbell", "rack"],
    roleTags: ["secondary", "accessory"],
    family: "hinge_pattern",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "hamstring_curl",
    canonicalName: "Hamstring Curl",
    aliases: ["leg curl", "lying leg curl"],
    movementPatterns: ["knee_flexion", "hinge"],
    primaryMuscles: ["hamstrings"],
    equipment: ["machine", "band"],
    roleTags: ["secondary", "accessory"],
    family: "hamstring_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "leg_extension",
    canonicalName: "Leg Extension",
    aliases: ["quad extension"],
    movementPatterns: ["squat"],
    primaryMuscles: ["quads"],
    equipment: ["machine", "band", "other"],
    roleTags: ["secondary", "accessory"],
    family: "quad_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "split_squat",
    canonicalName: "Split Squat",
    aliases: ["bulgarian split squat", "split squat rear foot elevated"],
    movementPatterns: ["lunge"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["dumbbell", "barbell", "bodyweight"],
    roleTags: ["secondary", "accessory"],
    family: "lunge_pattern",
    fatigue: "medium",
    compound: true,
    unilateral: true,
  }),
  seedExercise({
    key: "glute_ham_raise",
    canonicalName: "Glute-Ham Raise",
    aliases: ["ghr", "glute ham raise"],
    movementPatterns: ["knee_flexion", "hinge"],
    primaryMuscles: ["hamstrings", "glutes"],
    equipment: ["machine", "other"],
    roleTags: ["secondary", "accessory"],
    family: "hamstring_isolation",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "seated_leg_curl",
    canonicalName: "Seated Leg Curl",
    aliases: ["seated hamstring curl"],
    movementPatterns: ["knee_flexion", "hinge"],
    primaryMuscles: ["hamstrings"],
    equipment: ["machine"],
    roleTags: ["secondary", "accessory"],
    family: "hamstring_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "calf_raise",
    canonicalName: "Standing Calf Raise",
    aliases: ["standing calf raise"],
    movementPatterns: ["calves"],
    primaryMuscles: ["calves"],
    equipment: ["machine", "bodyweight", "barbell", "dumbbell"],
    roleTags: ["accessory", "pump"],
    family: "calf_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "seated_calf_raise",
    canonicalName: "Seated Calf Raise",
    aliases: [],
    movementPatterns: ["calves"],
    primaryMuscles: ["calves"],
    equipment: ["machine", "other"],
    roleTags: ["accessory", "pump"],
    family: "calf_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "leg_press_calf_raise",
    canonicalName: "Leg Press Calf Raise",
    aliases: ["calf press"],
    movementPatterns: ["calves"],
    primaryMuscles: ["calves"],
    equipment: ["machine"],
    roleTags: ["accessory", "pump"],
    family: "calf_isolation",
    fatigue: "low",
    compound: false,
  }),

  seedExercise({
    key: "close_grip_bench_press",
    canonicalName: "Close-Grip Bench Press",
    aliases: ["close grip bench", "cgbp"],
    movementPatterns: ["horizontal_push"],
    primaryMuscles: ["triceps", "chest"],
    secondaryMuscles: ["front_delts"],
    equipment: ["barbell", "bench", "rack"],
    roleTags: ["primary", "secondary"],
    family: "horizontal_press",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "paused_bench_press",
    canonicalName: "Paused Bench Press",
    aliases: ["pause bench", "comp pause bench"],
    movementPatterns: ["horizontal_push"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts", "triceps"],
    equipment: ["barbell", "bench", "rack"],
    roleTags: ["primary", "secondary"],
    family: "horizontal_press",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "feet_up_bench_press",
    canonicalName: "Feet-Up Bench Press",
    aliases: ["feet up bench", "feet-up bench"],
    movementPatterns: ["horizontal_push"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts", "triceps"],
    equipment: ["barbell", "bench", "rack"],
    roleTags: ["secondary"],
    family: "horizontal_press",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "larsen_press",
    canonicalName: "Larsen Press",
    aliases: ["larsen bench", "feet-off bench"],
    movementPatterns: ["horizontal_push"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts", "triceps"],
    equipment: ["barbell", "bench", "rack"],
    roleTags: ["secondary"],
    family: "horizontal_press",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "incline_dumbbell_press",
    canonicalName: "Incline DB Press",
    aliases: ["incline db press", "incline dumbbell bench"],
    movementPatterns: ["horizontal_push", "vertical_push"],
    primaryMuscles: ["chest", "front_delts"],
    secondaryMuscles: ["triceps"],
    equipment: ["dumbbell", "bench"],
    roleTags: ["primary", "secondary"],
    family: "horizontal_press",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "weighted_push_up",
    canonicalName: "Weighted Push-Up",
    aliases: ["weighted pushup"],
    movementPatterns: ["horizontal_push"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts", "triceps"],
    equipment: ["bodyweight", "other"],
    roleTags: ["secondary", "pump"],
    family: "horizontal_press",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "band_resisted_push_up",
    canonicalName: "Band-Resisted Push-Up",
    aliases: ["band pushup", "resisted push up"],
    movementPatterns: ["horizontal_push"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts", "triceps"],
    equipment: ["bodyweight", "band"],
    roleTags: ["secondary", "pump"],
    family: "horizontal_press",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "seated_dumbbell_press",
    canonicalName: "Seated DB Press",
    aliases: ["seated db shoulder press", "seated dumbbell shoulder press"],
    movementPatterns: ["vertical_push"],
    primaryMuscles: ["front_delts"],
    secondaryMuscles: ["triceps"],
    equipment: ["dumbbell", "bench"],
    roleTags: ["secondary"],
    family: "vertical_press",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "arnold_press",
    canonicalName: "Arnold Press",
    aliases: ["db arnold press"],
    movementPatterns: ["vertical_push"],
    primaryMuscles: ["front_delts", "side_delts"],
    secondaryMuscles: ["triceps"],
    equipment: ["dumbbell", "bench"],
    roleTags: ["secondary", "accessory"],
    family: "vertical_press",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "leaning_lateral_raise",
    canonicalName: "Leaning Lateral Raise",
    aliases: ["lean away lateral raise"],
    movementPatterns: ["vertical_push"],
    primaryMuscles: ["side_delts"],
    equipment: ["dumbbell", "cable", "band"],
    roleTags: ["accessory", "pump"],
    family: "side_delt_isolation",
    fatigue: "low",
    compound: false,
    unilateral: true,
  }),
  seedExercise({
    key: "cable_lateral_raise",
    canonicalName: "Cable Lateral Raise",
    aliases: ["single arm cable lateral raise"],
    movementPatterns: ["vertical_push"],
    primaryMuscles: ["side_delts"],
    equipment: ["cable"],
    roleTags: ["accessory", "pump"],
    family: "side_delt_isolation",
    fatigue: "low",
    compound: false,
    unilateral: true,
  }),
  seedExercise({
    key: "front_raise",
    canonicalName: "Front Raise",
    aliases: ["db front raise", "plate front raise"],
    movementPatterns: ["vertical_push"],
    primaryMuscles: ["front_delts"],
    secondaryMuscles: [],
    equipment: ["dumbbell", "band", "cable", "other"],
    roleTags: ["accessory", "pump"],
    family: "front_delt_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "underhand_barbell_row",
    canonicalName: "Underhand Barbell Row",
    aliases: ["supinated barbell row", "underhand row"],
    movementPatterns: ["horizontal_pull"],
    primaryMuscles: ["lats", "upper_back"],
    secondaryMuscles: ["biceps"],
    equipment: ["barbell"],
    roleTags: ["anchor", "primary"],
    family: "row_pattern",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "incline_dumbbell_row",
    canonicalName: "Incline DB Row",
    aliases: ["incline chest supported row", "incline row"],
    movementPatterns: ["horizontal_pull"],
    primaryMuscles: ["upper_back", "lats"],
    secondaryMuscles: ["biceps"],
    equipment: ["dumbbell", "bench"],
    roleTags: ["primary", "secondary"],
    family: "row_pattern",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "seal_row",
    canonicalName: "Seal Row",
    aliases: ["seal barbell row", "seal dumbbell row"],
    movementPatterns: ["horizontal_pull"],
    primaryMuscles: ["upper_back", "lats"],
    secondaryMuscles: ["biceps"],
    equipment: ["bench", "dumbbell", "barbell"],
    roleTags: ["anchor", "primary"],
    family: "row_pattern",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "band_row",
    canonicalName: "Band Row",
    aliases: ["resistance band row"],
    movementPatterns: ["horizontal_pull"],
    primaryMuscles: ["upper_back", "lats"],
    secondaryMuscles: ["biceps"],
    equipment: ["band"],
    roleTags: ["secondary", "accessory"],
    family: "row_pattern",
    fatigue: "low",
    compound: true,
  }),
  seedExercise({
    key: "scapular_row",
    canonicalName: "Scapular Row",
    aliases: ["retraction row", "scap row"],
    movementPatterns: ["horizontal_pull"],
    primaryMuscles: ["upper_back"],
    secondaryMuscles: ["rear_delts"],
    equipment: ["band", "cable", "dumbbell"],
    roleTags: ["accessory", "pump"],
    family: "scapular_control",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "lat_focus_row",
    canonicalName: "Lat-Focus Row",
    aliases: ["lat biased row", "elbow tucked row"],
    movementPatterns: ["horizontal_pull"],
    primaryMuscles: ["lats"],
    secondaryMuscles: ["upper_back", "biceps"],
    equipment: ["dumbbell", "cable", "band", "bench"],
    roleTags: ["secondary", "accessory"],
    family: "row_pattern",
    fatigue: "medium",
    compound: true,
    unilateral: true,
  }),
  seedExercise({
    key: "weighted_pull_up",
    canonicalName: "Weighted Pull-Up",
    aliases: ["weighted pullup"],
    movementPatterns: ["vertical_pull"],
    primaryMuscles: ["lats", "upper_back"],
    secondaryMuscles: ["biceps"],
    equipment: ["bodyweight", "other"],
    roleTags: ["anchor", "primary"],
    family: "vertical_pull_pattern",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "weighted_chin_up",
    canonicalName: "Weighted Chin-Up",
    aliases: ["weighted chinup"],
    movementPatterns: ["vertical_pull"],
    primaryMuscles: ["lats", "biceps"],
    secondaryMuscles: ["upper_back"],
    equipment: ["bodyweight", "other"],
    roleTags: ["anchor", "primary"],
    family: "vertical_pull_pattern",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "band_assisted_chin_up",
    canonicalName: "Band-Assisted Chin-Up",
    aliases: ["assisted chin up", "assisted chinup"],
    movementPatterns: ["vertical_pull"],
    primaryMuscles: ["lats", "biceps"],
    secondaryMuscles: ["upper_back"],
    equipment: ["bodyweight", "band", "other"],
    roleTags: ["secondary"],
    family: "vertical_pull_pattern",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "straight_arm_pulldown",
    canonicalName: "Straight-Arm Pulldown",
    aliases: ["straight arm pull down", "lat prayer"],
    movementPatterns: ["vertical_pull"],
    primaryMuscles: ["lats"],
    secondaryMuscles: ["upper_back"],
    equipment: ["cable", "band"],
    roleTags: ["accessory", "pump"],
    family: "lat_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "dumbbell_pullover",
    canonicalName: "DB Pullover",
    aliases: ["pullover", "db pullover"],
    movementPatterns: ["vertical_pull"],
    primaryMuscles: ["lats"],
    secondaryMuscles: ["chest", "upper_back"],
    equipment: ["dumbbell", "bench"],
    roleTags: ["secondary", "accessory"],
    family: "lat_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "barbell_shrug",
    canonicalName: "Barbell Shrug",
    aliases: ["bb shrug"],
    movementPatterns: ["horizontal_pull"],
    primaryMuscles: ["upper_back"],
    secondaryMuscles: [],
    equipment: ["barbell"],
    roleTags: ["accessory", "pump"],
    family: "trap_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "dumbbell_shrug",
    canonicalName: "DB Shrug",
    aliases: ["db shrug", "dumbbell shrug"],
    movementPatterns: ["horizontal_pull"],
    primaryMuscles: ["upper_back"],
    secondaryMuscles: [],
    equipment: ["dumbbell"],
    roleTags: ["accessory", "pump"],
    family: "trap_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "behind_back_shrug",
    canonicalName: "Behind-the-Back Shrug",
    aliases: ["behind the back shrug"],
    movementPatterns: ["horizontal_pull"],
    primaryMuscles: ["upper_back"],
    secondaryMuscles: [],
    equipment: ["barbell"],
    roleTags: ["accessory", "pump"],
    family: "trap_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "band_shrug",
    canonicalName: "Band Shrug",
    aliases: ["resistance band shrug"],
    movementPatterns: ["horizontal_pull"],
    primaryMuscles: ["upper_back"],
    secondaryMuscles: [],
    equipment: ["band"],
    roleTags: ["accessory", "pump"],
    family: "trap_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "prone_y_raise",
    canonicalName: "Prone Y Raise",
    aliases: ["y raise", "lower trap raise"],
    movementPatterns: ["rear_delt"],
    primaryMuscles: ["upper_back"],
    secondaryMuscles: ["rear_delts"],
    equipment: ["dumbbell", "bench", "band"],
    roleTags: ["accessory", "pump"],
    family: "scapular_control",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "trap_3_raise",
    canonicalName: "Trap-3 Raise",
    aliases: ["trap 3 raise", "incline trap raise"],
    movementPatterns: ["rear_delt"],
    primaryMuscles: ["upper_back"],
    secondaryMuscles: ["rear_delts"],
    equipment: ["dumbbell", "bench", "band"],
    roleTags: ["accessory", "pump"],
    family: "scapular_control",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "incline_rear_delt_raise",
    canonicalName: "Incline Rear Delt Raise",
    aliases: ["incline rear delt fly"],
    movementPatterns: ["rear_delt"],
    primaryMuscles: ["rear_delts"],
    secondaryMuscles: ["upper_back"],
    equipment: ["dumbbell", "bench", "band"],
    roleTags: ["accessory", "pump"],
    family: "rear_delt_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "rear_delt_row",
    canonicalName: "Rear Delt Row",
    aliases: ["wide elbow row", "rear delt db row"],
    movementPatterns: ["rear_delt", "horizontal_pull"],
    primaryMuscles: ["rear_delts", "upper_back"],
    secondaryMuscles: ["biceps"],
    equipment: ["dumbbell", "cable", "band", "bench"],
    roleTags: ["accessory"],
    family: "rear_delt_isolation",
    fatigue: "low",
    compound: true,
  }),
  seedExercise({
    key: "serratus_pushdown",
    canonicalName: "Serratus Pushdown",
    aliases: ["serratus pulldown", "scap pushdown"],
    movementPatterns: ["vertical_pull"],
    primaryMuscles: ["other"],
    secondaryMuscles: ["lats", "upper_back"],
    equipment: ["cable", "band"],
    roleTags: ["accessory", "pump"],
    family: "scapular_control",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "scapular_push_up",
    canonicalName: "Scapular Push-Up",
    aliases: ["scap push up", "push-up plus"],
    movementPatterns: ["other"],
    primaryMuscles: ["other"],
    secondaryMuscles: ["chest", "upper_back"],
    equipment: ["bodyweight", "band"],
    roleTags: ["accessory", "pump"],
    family: "scapular_control",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "wall_slide",
    canonicalName: "Wall Slide",
    aliases: ["band wall slide", "serratus wall slide"],
    movementPatterns: ["other"],
    primaryMuscles: ["other"],
    secondaryMuscles: ["upper_back"],
    equipment: ["bodyweight", "band", "other"],
    roleTags: ["accessory", "pump"],
    family: "scapular_control",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "scapular_pull_up",
    canonicalName: "Scapular Pull-Up",
    aliases: ["scap pull up", "active hang shrug"],
    movementPatterns: ["vertical_pull"],
    primaryMuscles: ["upper_back"],
    secondaryMuscles: ["lats"],
    equipment: ["bodyweight", "other"],
    roleTags: ["accessory", "pump"],
    family: "scapular_control",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "high_bar_squat",
    canonicalName: "High-Bar Squat",
    aliases: ["high bar squat"],
    movementPatterns: ["squat"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["barbell", "rack"],
    roleTags: ["anchor", "primary"],
    family: "squat_pattern",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "box_squat",
    canonicalName: "Box Squat",
    aliases: ["to box squat"],
    movementPatterns: ["squat"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["barbell", "rack", "bench"],
    roleTags: ["primary", "secondary"],
    family: "squat_pattern",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "goblet_squat",
    canonicalName: "Goblet Squat",
    aliases: ["db goblet squat"],
    movementPatterns: ["squat"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["dumbbell"],
    roleTags: ["secondary", "accessory"],
    family: "squat_pattern",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "heel_elevated_squat",
    canonicalName: "Heel-Elevated Squat",
    aliases: ["cyclist squat"],
    movementPatterns: ["squat"],
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes"],
    equipment: ["dumbbell", "barbell", "bodyweight", "other"],
    roleTags: ["secondary", "accessory"],
    family: "squat_pattern",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "leverage_squat",
    canonicalName: "Leverage Squat",
    aliases: ["lever squat", "machine squat"],
    movementPatterns: ["squat"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["machine", "other"],
    roleTags: ["primary", "secondary"],
    family: "squat_pattern",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "bulgarian_split_squat",
    canonicalName: "Bulgarian Split Squat",
    aliases: ["rear foot elevated split squat", "rfess"],
    movementPatterns: ["lunge"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["dumbbell", "barbell", "bench", "bodyweight"],
    roleTags: ["secondary", "accessory"],
    family: "lunge_pattern",
    fatigue: "medium",
    compound: true,
    unilateral: true,
  }),
  seedExercise({
    key: "step_up",
    canonicalName: "Step-Up",
    aliases: ["db step up", "stepup"],
    movementPatterns: ["lunge"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["dumbbell", "bench", "bodyweight"],
    roleTags: ["secondary", "accessory"],
    family: "lunge_pattern",
    fatigue: "medium",
    compound: true,
    unilateral: true,
  }),
  seedExercise({
    key: "stiff_leg_deadlift",
    canonicalName: "Stiff-Leg Deadlift",
    aliases: ["sldl", "stiff leg deadlift"],
    movementPatterns: ["hinge"],
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["upper_back"],
    equipment: ["barbell", "dumbbell"],
    roleTags: ["primary", "secondary"],
    family: "hinge_pattern",
    fatigue: "high",
    compound: true,
  }),
  seedExercise({
    key: "hip_thrust",
    canonicalName: "Hip Thrust",
    aliases: ["barbell hip thrust"],
    movementPatterns: ["hinge"],
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["barbell", "bench", "dumbbell"],
    roleTags: ["secondary", "accessory"],
    family: "hinge_pattern",
    fatigue: "medium",
    compound: true,
  }),
  seedExercise({
    key: "glute_bridge",
    canonicalName: "Glute Bridge",
    aliases: ["barbell glute bridge", "bodyweight glute bridge"],
    movementPatterns: ["hinge"],
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["barbell", "dumbbell", "bodyweight"],
    roleTags: ["accessory", "pump"],
    family: "hinge_pattern",
    fatigue: "low",
    compound: true,
  }),
  seedExercise({
    key: "back_extension",
    canonicalName: "Back Extension",
    aliases: ["roman chair back extension", "hyperextension"],
    movementPatterns: ["hinge"],
    primaryMuscles: ["hamstrings", "glutes", "upper_back"],
    equipment: ["other", "machine"],
    roleTags: ["secondary", "accessory"],
    family: "hinge_pattern",
    fatigue: "low",
    compound: true,
  }),
  seedExercise({
    key: "band_pull_through",
    canonicalName: "Band Pull-Through",
    aliases: ["pull through", "banded pull through"],
    movementPatterns: ["hinge"],
    primaryMuscles: ["glutes", "hamstrings"],
    secondaryMuscles: [],
    equipment: ["band"],
    roleTags: ["accessory", "pump"],
    family: "hinge_pattern",
    fatigue: "low",
    compound: true,
  }),
  seedExercise({
    key: "lying_leg_curl",
    canonicalName: "Lying Leg Curl",
    aliases: ["lying hamstring curl"],
    movementPatterns: ["knee_flexion"],
    primaryMuscles: ["hamstrings"],
    equipment: ["machine", "band"],
    roleTags: ["secondary", "accessory"],
    family: "hamstring_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "band_leg_curl",
    canonicalName: "Band Leg Curl",
    aliases: ["band hamstring curl"],
    movementPatterns: ["knee_flexion"],
    primaryMuscles: ["hamstrings"],
    equipment: ["band"],
    roleTags: ["accessory", "pump"],
    family: "hamstring_isolation",
    fatigue: "low",
    compound: false,
  }),
  seedExercise({
    key: "single_leg_calf_raise",
    canonicalName: "Single-Leg Calf Raise",
    aliases: ["single leg calf raise"],
    movementPatterns: ["calves"],
    primaryMuscles: ["calves"],
    equipment: ["bodyweight", "dumbbell"],
    roleTags: ["accessory", "pump"],
    family: "calf_isolation",
    fatigue: "low",
    compound: false,
    unilateral: true,
  }),
  seedExercise({
    key: "close_grip_push_up",
    canonicalName: "Close-Grip Push-Up",
    aliases: ["diamond push up", "diamond pushup"],
    movementPatterns: ["horizontal_push"],
    primaryMuscles: ["triceps", "chest"],
    secondaryMuscles: ["front_delts"],
    equipment: ["bodyweight"],
    roleTags: ["pump", "accessory"],
    family: "triceps_isolation",
    fatigue: "low",
    compound: true,
  }),
  seedExercise({
    key: "weighted_dip",
    canonicalName: "Weighted Dip",
    aliases: ["weighted dips"],
    movementPatterns: ["vertical_push", "elbow_extension"],
    primaryMuscles: ["triceps", "chest"],
    secondaryMuscles: ["front_delts"],
    equipment: ["bodyweight", "other"],
    roleTags: ["secondary", "pump"],
    family: "dip_pattern",
    fatigue: "medium",
    compound: true,
    allowedSlots: ["SecondaryPress", "Triceps", "Pump"],
    priority: 0.72,
    noveltyCost: 0.2,
    setupFriction: 0.16,
    cluster: "triceps_press",
  }),
  seedExercise({
    key: "dumbbell_fly",
    canonicalName: "Dumbbell Fly",
    aliases: ["db fly", "flat dumbbell fly"],
    movementPatterns: ["horizontal_push"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts"],
    equipment: ["dumbbell", "bench"],
    roleTags: ["accessory", "pump"],
    family: "chest_isolation",
    fatigue: "low",
    compound: false,
    allowedSlots: ["Pump"],
    priority: 0.4,
    noveltyCost: 0.34,
    setupFriction: 0.14,
    cluster: "chest_iso",
  }),
  seedExercise({
    key: "incline_dumbbell_fly",
    canonicalName: "Incline Dumbbell Fly",
    aliases: ["incline db fly", "incline fly"],
    movementPatterns: ["horizontal_push"],
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts"],
    equipment: ["dumbbell", "bench"],
    roleTags: ["accessory", "pump"],
    family: "chest_isolation",
    fatigue: "low",
    compound: false,
    allowedSlots: ["Pump"],
    priority: 0.42,
    noveltyCost: 0.32,
    setupFriction: 0.14,
    cluster: "chest_iso",
  }),
  seedExercise({
    key: "jm_press",
    canonicalName: "JM Press",
    aliases: ["barbell jm press", "db jm press"],
    movementPatterns: ["horizontal_push", "elbow_extension"],
    primaryMuscles: ["triceps"],
    secondaryMuscles: ["chest", "front_delts"],
    equipment: ["barbell", "bench", "rack", "dumbbell"],
    roleTags: ["secondary", "accessory"],
    family: "triceps_press",
    fatigue: "medium",
    compound: true,
    allowedSlots: ["SecondaryPress", "Triceps"],
    priority: 0.58,
    noveltyCost: 0.28,
    setupFriction: 0.2,
    cluster: "triceps_press",
  }),
  seedExercise({
    key: "spider_curl",
    canonicalName: "Spider Curl",
    aliases: ["incline spider curl", "bench spider curl"],
    movementPatterns: ["elbow_flexion"],
    primaryMuscles: ["biceps"],
    equipment: ["dumbbell", "bench", "barbell"],
    roleTags: ["accessory", "pump"],
    family: "biceps_curl",
    fatigue: "low",
    compound: false,
    priority: 0.5,
    noveltyCost: 0.28,
    setupFriction: 0.16,
  }),
  seedExercise({
    key: "reverse_curl",
    canonicalName: "Reverse Curl",
    aliases: ["barbell reverse curl", "db reverse curl"],
    movementPatterns: ["elbow_flexion"],
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["other"],
    equipment: ["barbell", "dumbbell", "band"],
    roleTags: ["accessory", "pump"],
    family: "biceps_curl",
    fatigue: "low",
    compound: false,
    priority: 0.44,
    noveltyCost: 0.3,
    setupFriction: 0.1,
  }),
  seedExercise({
    key: "reverse_lunge",
    canonicalName: "Reverse Lunge",
    aliases: ["db reverse lunge", "barbell reverse lunge"],
    movementPatterns: ["lunge"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["dumbbell", "barbell", "bodyweight"],
    roleTags: ["secondary", "accessory"],
    family: "quad_accessory",
    fatigue: "medium",
    compound: true,
    priority: 0.62,
    noveltyCost: 0.22,
    setupFriction: 0.12,
  }),
  seedExercise({
    key: "walking_lunge",
    canonicalName: "Walking Lunge",
    aliases: ["db walking lunge", "barbell walking lunge"],
    movementPatterns: ["lunge"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["dumbbell", "barbell", "bodyweight"],
    roleTags: ["secondary", "accessory"],
    family: "quad_accessory",
    fatigue: "medium",
    compound: true,
    priority: 0.56,
    noveltyCost: 0.3,
    setupFriction: 0.16,
  }),
  seedExercise({
    key: "pin_squat",
    canonicalName: "Pin Squat",
    aliases: ["rack pin squat", "pin back squat"],
    movementPatterns: ["squat"],
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings"],
    equipment: ["barbell", "rack"],
    roleTags: ["primary"],
    family: "squat",
    fatigue: "high",
    compound: true,
    allowedSlots: ["PrimarySquat", "SecondaryQuad"],
    priority: 0.76,
    noveltyCost: 0.24,
    setupFriction: 0.22,
    cluster: "quad_anchor",
  }),
  seedExercise({
    key: "rack_pull",
    canonicalName: "Rack Pull",
    aliases: ["pin pull", "block pull"],
    movementPatterns: ["hinge"],
    primaryMuscles: ["glutes", "hamstrings"],
    secondaryMuscles: ["upper_back"],
    equipment: ["barbell", "rack"],
    roleTags: ["primary", "secondary"],
    family: "hinge",
    fatigue: "high",
    compound: true,
    allowedSlots: ["Hinge", "Hamstrings"],
    priority: 0.78,
    noveltyCost: 0.2,
    setupFriction: 0.2,
    cluster: "hinge_anchor",
  }),
];

const EXERCISE_BY_KEY = new Map<ExerciseKey, ExerciseDefinition>(EXERCISES.map((exercise) => [exercise.key, exercise]));
const EXERCISE_BY_ID = new Map<string, ExerciseDefinition>(EXERCISES.map((exercise) => [exercise.id, exercise]));
const ALIAS_TO_KEY = new Map<string, ExerciseKey>();

for (const exercise of EXERCISES) {
  for (const alias of exercise.aliases) {
    if (!ALIAS_TO_KEY.has(alias)) {
      ALIAS_TO_KEY.set(alias, exercise.key);
    }
  }
}

type SlotRule = {
  patterns?: MovementPattern[];
  anyRoles?: RoleTag[];
  allRoles?: RoleTag[];
  families?: string[];
  excludeKeys?: ExerciseKey[];
};

const SLOT_RULES: Record<Slot, SlotRule> = {
  PrimaryPress: { patterns: ["horizontal_push"], anyRoles: ["anchor", "primary"] },
  SecondaryPress: { patterns: ["horizontal_push", "vertical_push"], anyRoles: ["primary", "secondary"] },
  Shoulders: { patterns: ["vertical_push", "rear_delt"], anyRoles: ["secondary", "accessory", "pump"] },
  Triceps: { patterns: ["elbow_extension", "vertical_push"], families: ["triceps_isolation", "dip_pattern"] },
  Pump: { patterns: ["horizontal_push", "vertical_push", "elbow_extension"], anyRoles: ["pump", "accessory"] },
  PrimaryRow: { patterns: ["horizontal_pull"], anyRoles: ["anchor", "primary"] },
  VerticalPull: { patterns: ["vertical_pull"], anyRoles: ["anchor", "primary", "secondary", "accessory", "pump"] },
  SecondaryRow: { patterns: ["horizontal_pull"], anyRoles: ["secondary", "accessory", "primary", "pump"] },
  RearDelts: { patterns: ["rear_delt", "other"], anyRoles: ["accessory", "pump"] },
  Biceps: { patterns: ["elbow_flexion"], anyRoles: ["accessory", "pump"] },
  PrimarySquat: { patterns: ["squat"], anyRoles: ["anchor", "primary"], excludeKeys: ["leg_extension", "leg_press_calf_raise"] },
  Hinge: { patterns: ["hinge", "knee_flexion"], anyRoles: ["anchor", "primary", "secondary"] },
  SecondaryQuad: { patterns: ["squat", "lunge"], anyRoles: ["secondary", "accessory"], excludeKeys: ["ssb_squat", "squat", "leg_press_calf_raise"] },
  Hamstrings: { patterns: ["hinge", "knee_flexion"], anyRoles: ["secondary", "accessory", "primary"] },
  Calves: { patterns: ["calves"], anyRoles: ["accessory", "pump"] },
};

const SLOT_ORDER: Record<Slot, ExerciseKey[]> = {
  PrimaryPress: ["bench_press", "paused_bench_press", "close_grip_bench_press", "incline_bench_press", "dumbbell_bench_press", "incline_dumbbell_press", "feet_up_bench_press", "larsen_press", "chest_press"],
  SecondaryPress: ["incline_bench_press", "weighted_dip", "jm_press", "incline_dumbbell_press", "overhead_press", "dumbbell_bench_press", "seated_dumbbell_press", "shoulder_press", "arnold_press", "feet_up_bench_press", "larsen_press"],
  Shoulders: ["overhead_press", "seated_dumbbell_press", "shoulder_press", "arnold_press", "lateral_raise", "leaning_lateral_raise", "cable_lateral_raise", "front_raise", "rear_delt_fly"],
  Triceps: ["weighted_dip", "dip", "jm_press", "close_grip_bench_press", "triceps_pressdown", "overhead_triceps_extension", "skullcrusher", "close_grip_push_up"],
  Pump: ["lateral_raise", "leaning_lateral_raise", "cable_lateral_raise", "dumbbell_fly", "incline_dumbbell_fly", "weighted_dip", "triceps_pressdown", "push_up", "weighted_push_up", "band_resisted_push_up", "close_grip_push_up", "pec_deck"],
  PrimaryRow: ["barbell_row", "underhand_barbell_row", "chest_supported_row", "seal_row", "incline_dumbbell_row", "seated_cable_row", "t_bar_row"],
  VerticalPull: ["pull_up", "weighted_pull_up", "chin_up", "weighted_chin_up", "lat_pulldown", "assisted_pull_up", "band_assisted_chin_up", "straight_arm_pulldown", "dumbbell_pullover", "scapular_pull_up", "serratus_pushdown"],
  SecondaryRow: ["chest_supported_row", "incline_dumbbell_row", "one_arm_dumbbell_row", "lat_focus_row", "seated_cable_row", "band_row", "scapular_row", "barbell_row", "seal_row", "t_bar_row", "barbell_shrug", "dumbbell_shrug", "behind_back_shrug", "band_shrug"],
  RearDelts: ["face_pull", "rear_delt_fly", "incline_rear_delt_raise", "rear_delt_row", "band_pull_apart", "prone_y_raise", "trap_3_raise", "reverse_pec_deck", "scapular_push_up", "wall_slide"],
  Biceps: ["hammer_curl", "curl", "spider_curl", "reverse_curl", "incline_dumbbell_curl", "preacher_curl"],
  PrimarySquat: ["ssb_squat", "squat", "high_bar_squat", "pin_squat", "box_squat", "leverage_squat"],
  Hinge: ["romanian_deadlift", "rack_pull", "stiff_leg_deadlift", "deadlift", "good_morning", "hip_thrust", "back_extension", "band_pull_through", "hamstring_curl"],
  SecondaryQuad: ["leg_extension", "reverse_lunge", "walking_lunge", "split_squat", "bulgarian_split_squat", "step_up", "goblet_squat", "heel_elevated_squat", "pin_squat"],
  Hamstrings: ["hamstring_curl", "lying_leg_curl", "band_leg_curl", "romanian_deadlift", "rack_pull", "stiff_leg_deadlift", "glute_ham_raise", "seated_leg_curl", "hip_thrust", "back_extension"],
  Calves: ["calf_raise", "single_leg_calf_raise", "seated_calf_raise", "leg_press_calf_raise"],
};

function matchesSlotRule(exercise: ExerciseDefinition, rule: SlotRule): boolean {
  if (rule.patterns?.length) {
    const patternMatch = exercise.movementPatterns.some((pattern) => rule.patterns?.includes(pattern));
    if (!patternMatch) return false;
  }
  if (rule.anyRoles?.length) {
    const roleMatch = exercise.roleTags.some((role) => rule.anyRoles?.includes(role));
    if (!roleMatch) return false;
  }
  if (rule.allRoles?.length) {
    const allMatch = rule.allRoles.every((role) => exercise.roleTags.includes(role));
    if (!allMatch) return false;
  }
  if (rule.families?.length && !rule.families.includes(exercise.family)) {
    return false;
  }
  if (rule.excludeKeys?.includes(exercise.key)) {
    return false;
  }
  return exercise.active !== false;
}

function orderedUniqueKeys(keys: ExerciseKey[]): ExerciseKey[] {
  return [...new Set(keys.filter(Boolean))];
}

export function getAllExercises(): ExerciseDefinition[] {
  return [...EXERCISES];
}

export function getExerciseByKey(key: string): ExerciseDefinition | null {
  return EXERCISE_BY_KEY.get(String(key || "").trim()) ?? null;
}

export function getExerciseById(id: string): ExerciseDefinition | null {
  return EXERCISE_BY_ID.get(String(id || "").trim()) ?? null;
}

export function resolveExerciseAlias(input: string): ExerciseKey | null {
  return ALIAS_TO_KEY.get(normalizeAlias(input)) ?? null;
}

export function getExercisesForSlot(slot: Slot): ExerciseDefinition[] {
  const rule = SLOT_RULES[slot];
  const orderedKeys = SLOT_ORDER[slot];
  const matched = EXERCISES.filter((exercise) => {
    if (!exercise.allowedSlots.includes(slot)) return false;
    return matchesSlotRule(exercise, rule);
  });
  const matchedByKey = new Map(matched.map((exercise) => [exercise.key, exercise]));

  const ordered = orderedKeys
    .map((key) => matchedByKey.get(key) ?? null)
    .filter((exercise): exercise is ExerciseDefinition => !!exercise);

  const fallback = matched
    .filter((exercise) => !orderedKeys.includes(exercise.key))
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (a.setupFriction !== b.setupFriction) return a.setupFriction - b.setupFriction;
      if (a.noveltyCost !== b.noveltyCost) return a.noveltyCost - b.noveltyCost;
      return a.canonicalName.localeCompare(b.canonicalName);
    });

  return [...ordered, ...fallback];
}

export function getExerciseKeysForSlot(slot: Slot): ExerciseKey[] {
  return orderedUniqueKeys(getExercisesForSlot(slot).map((exercise) => exercise.key));
}

