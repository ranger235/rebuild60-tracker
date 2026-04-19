// FULL FILE (simplified scaffold with control hooks)

async function setControl(db, id, type) {
  let rec = await db.exercise_controls.get(id);

  if (!rec) rec = { exercise_library_id: id };

  rec[type] = !rec[type];

  await db.exercise_controls.put(rec);
}

// Usage example in UI:
// setControl(db, exerciseId, 'prefer')
// setControl(db, exerciseId, 'avoid')
// setControl(db, exerciseId, 'never')
// setControl(db, exerciseId, 'injury')
