
// src/lib/exerciseBuilder.ts

// Centralized helper to define exercises safely in one place

export type ExerciseDefinition = {
  key: string
  name: string
  aliases?: string[]
  equipment?: string[]
  focus: 'push' | 'pull' | 'lower' | 'full'
  muscles: string[]
  role: 'compound' | 'accessory'
  slots: string[]
}

export function buildExercise(def: ExerciseDefinition) {
  return {
    key: def.key,
    name: def.name,
    aliases: def.aliases || [],
    equipment: def.equipment || [],
    focus: def.focus,
    muscles: def.muscles,
    role: def.role,
    slots: def.slots,
  }
}

// Example usage (for future additions):
// const myExercise = buildExercise({
//   key: 'example_lift',
//   name: 'Example Lift',
//   equipment: ['dumbbell'],
//   focus: 'push',
//   muscles: ['chest'],
//   role: 'accessory',
//   slots: ['horizontal_push']
// })

