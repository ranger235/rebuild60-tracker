// Phase 3F.1 — Slot‑derived session titles
// Replace existing title builder logic so titles reflect the ACTUAL slots used

import { Slot } from "./slotEngine"

export type SessionTitleInput = {
  slots: Slot[]
  bias: string
}

// Map slots to training lanes
function slotToLane(slot: Slot): string {
  switch (slot) {
    case "PrimaryPress":
    case "SecondaryPress":
      return "Press"
    case "Shoulders":
      return "Shoulders"
    case "Triceps":
      return "Triceps"
    case "Pump":
      return "Accessory"
    case "PrimaryRow":
    case "SecondaryRow":
      return "Row"
    case "VerticalPull":
      return "Vertical Pull"
    case "RearDelts":
      return "Rear Delts"
    case "Biceps":
      return "Biceps"
    case "PrimarySquat":
    case "SecondaryQuad":
      return "Quad Dominant"
    case "Hinge":
      return "Posterior Chain"
    case "Hamstrings":
      return "Hamstrings"
    case "Calves":
      return "Calves"
    default:
      return "Mixed"
  }
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

export function buildSessionTitle(input: SessionTitleInput): string {
  const lanes = unique(input.slots.map(slotToLane))

  // prioritize first two meaningful lanes
  const core = lanes.filter(l => l !== "Accessory").slice(0, 2)

  if (core.length === 0) {
    return "Mixed Session"
  }

  if (core.length === 1) {
    return `${core[0]} Session`
  }

  return `${core[0]} + ${core[1]} Session`
}
