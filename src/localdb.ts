import Dexie from "dexie";

export const db = new Dexie("rebuild60");

db.version(3).stores({
  exercise_controls: "exercise_library_id"
});
