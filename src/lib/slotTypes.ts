export type Slot =
  | "PrimaryPress"
  | "SecondaryPress"
  | "Shoulders"
  | "Triceps"
  | "Pump"
  | "PrimaryRow"
  | "VerticalPull"
  | "SecondaryRow"
  | "RearDelts"
  | "Biceps"
  | "PrimarySquat"
  | "Hinge"
  | "SecondaryQuad"
  | "Hamstrings"
  | "Calves";

export const ALL_SLOTS: readonly Slot[] = [
  "PrimaryPress",
  "SecondaryPress",
  "Shoulders",
  "Triceps",
  "Pump",
  "PrimaryRow",
  "VerticalPull",
  "SecondaryRow",
  "RearDelts",
  "Biceps",
  "PrimarySquat",
  "Hinge",
  "SecondaryQuad",
  "Hamstrings",
  "Calves",
] as const;
