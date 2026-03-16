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
  | "Calves"

export type SessionBlueprint = {
  focus: "Push" | "Pull" | "Lower"
  slots: Slot[]
}

export const PUSH_BLUEPRINT: SessionBlueprint = {
  focus: "Push",
  slots: [
    "PrimaryPress",
    "SecondaryPress",
    "Shoulders",
    "Triceps",
    "Pump"
  ]
}

export const PULL_BLUEPRINT: SessionBlueprint = {
  focus: "Pull",
  slots: [
    "PrimaryRow",
    "VerticalPull",
    "SecondaryRow",
    "RearDelts",
    "Biceps"
  ]
}

export const LOWER_BLUEPRINT: SessionBlueprint = {
  focus: "Lower",
  slots: [
    "PrimarySquat",
    "Hinge",
    "SecondaryQuad",
    "Hamstrings",
    "Calves"
  ]
}

export function blueprintForFocus(focus: string): SessionBlueprint {
  if (focus === "Push") return PUSH_BLUEPRINT
  if (focus === "Pull") return PULL_BLUEPRINT
  return LOWER_BLUEPRINT
}
