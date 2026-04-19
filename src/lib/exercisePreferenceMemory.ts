export type PrefMem = {
  user_id: string;
  exercise_library_id: string;
  recommended_count: number;
  accepted_count: number;
  removed_count: number;
  manually_added_count: number;
  completed_count: number;
  swapped_in_count: number;
  swapped_out_count: number;
  updated_at: string;
};

export function emptyPref(user_id: string, exercise_library_id: string): PrefMem {
  return {
    user_id,
    exercise_library_id,
    recommended_count: 0,
    accepted_count: 0,
    removed_count: 0,
    manually_added_count: 0,
    completed_count: 0,
    swapped_in_count: 0,
    swapped_out_count: 0,
    updated_at: new Date().toISOString(),
  };
}
