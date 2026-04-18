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
};

function seedExercise(input: ExerciseSeedInput): ExerciseDefinition {
  const aliases = new Set<string>([
    input.key,
    input.canonicalName,
    ...(input.aliases ?? []),
  ].map(normalizeAlias).filter(Boolean));

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
  VerticalPull: { patterns: ["vertical_pull"], anyRoles: ["anchor", "primary", "secondary"] },
  SecondaryRow: { patterns: ["horizontal_pull"], anyRoles: ["secondary", "accessory", "primary"] },
  RearDelts: { patterns: ["rear_delt"], anyRoles: ["accessory", "pump"] },
  Biceps: { patterns: ["elbow_flexion"], anyRoles: ["accessory", "pump"] },
  PrimarySquat: { patterns: ["squat"], anyRoles: ["anchor", "primary"], excludeKeys: ["leg_extension", "leg_press_calf_raise"] },
  Hinge: { patterns: ["hinge", "knee_flexion"], anyRoles: ["anchor", "primary", "secondary"] },
  SecondaryQuad: { patterns: ["squat", "lunge"], anyRoles: ["secondary", "accessory"], excludeKeys: ["ssb_squat", "squat", "leg_press_calf_raise"] },
  Hamstrings: { patterns: ["hinge", "knee_flexion"], anyRoles: ["secondary", "accessory", "primary"] },
  Calves: { patterns: ["calves"], anyRoles: ["accessory", "pump"] },
};

const SLOT_ORDER: Record<Slot, ExerciseKey[]> = {
  PrimaryPress: ["bench_press", "incline_bench_press", "dumbbell_bench_press", "chest_press"],
  SecondaryPress: ["incline_bench_press", "overhead_press", "dumbbell_bench_press", "shoulder_press"],
  Shoulders: ["overhead_press", "shoulder_press", "lateral_raise", "rear_delt_fly"],
  Triceps: ["dip", "triceps_pressdown", "overhead_triceps_extension", "skullcrusher"],
  Pump: ["lateral_raise", "triceps_pressdown", "push_up", "pec_deck"],
  PrimaryRow: ["barbell_row", "chest_supported_row", "seated_cable_row", "t_bar_row"],
  VerticalPull: ["pull_up", "chin_up", "lat_pulldown", "assisted_pull_up"],
  SecondaryRow: ["chest_supported_row", "seated_cable_row", "barbell_row", "one_arm_dumbbell_row"],
  RearDelts: ["face_pull", "rear_delt_fly", "reverse_pec_deck", "band_pull_apart"],
  Biceps: ["hammer_curl", "curl", "incline_dumbbell_curl", "preacher_curl"],
  PrimarySquat: ["ssb_squat", "squat"],
  Hinge: ["romanian_deadlift", "deadlift", "good_morning", "hamstring_curl"],
  SecondaryQuad: ["leg_extension", "split_squat"],
  Hamstrings: ["hamstring_curl", "romanian_deadlift", "glute_ham_raise", "seated_leg_curl"],
  Calves: ["calf_raise", "seated_calf_raise", "leg_press_calf_raise"],
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
  const matched = EXERCISES.filter((exercise) => matchesSlotRule(exercise, rule));
  const matchedByKey = new Map(matched.map((exercise) => [exercise.key, exercise]));

  const ordered = orderedKeys
    .map((key) => matchedByKey.get(key) ?? null)
    .filter((exercise): exercise is ExerciseDefinition => !!exercise);

  const fallback = matched
    .filter((exercise) => !orderedKeys.includes(exercise.key))
    .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));

  return [...ordered, ...fallback];
}

export function getExerciseKeysForSlot(slot: Slot): ExerciseKey[] {
  return orderedUniqueKeys(getExercisesForSlot(slot).map((exercise) => exercise.key));
}
