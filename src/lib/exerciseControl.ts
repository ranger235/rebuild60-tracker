export type ExerciseControlRec = {
  user_id: string;
  exercise_library_id: string;
  prefer: boolean;
  avoid: boolean;
  never: boolean;
  injury: boolean;
  updated_at: string;
};

export function emptyExerciseControl(user_id: string, exercise_library_id: string): ExerciseControlRec {
  return {
    user_id,
    exercise_library_id,
    prefer: false,
    avoid: false,
    never: false,
    injury: false,
    updated_at: new Date().toISOString(),
  };
}

