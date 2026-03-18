import type { ActiveBlockPlan } from "./blockPlan";
import type { Slot } from "./slotEngine";

export type ComposerBlockBias = {
  blockType: string;
  waveProfile: string;
  progressionBonus: number;
  anchorBonus: number;
  noveltyPenalty: number;
  balanceBonus: number;
  fatiguePenalty: number;
  accessoryVolumeShift: number;
  noveltyBudgetPerWeek: number;
  minAnchorExposure: number;
  minPrimaryAccessoryExposure: number;
  forcedCarryPatterns: string[];
  notes: string[];
};

const ANCHOR_SLOTS: Slot[] = ["PrimaryPress", "PrimaryRow", "PrimarySquat", "Hinge", "VerticalPull"];
const ACCESSORY_SLOTS: Slot[] = [
  "SecondaryPress",
  "Shoulders",
  "Triceps",
  "Pump",
  "SecondaryRow",
  "RearDelts",
  "Biceps",
  "SecondaryQuad",
  "Hamstrings",
  "Calves",
];

export function deriveComposerBlockBias(plan?: ActiveBlockPlan | null): ComposerBlockBias {
  const directives = plan?.directives;
  const rotationRules = plan?.rotationRules;

  const progressionPressure = clamp01(directives?.progressionPressure ?? 0.5);
  const volumePressure = clamp01(directives?.volumePressure ?? 0.5);
  const noveltyAllowance = clamp01(directives?.noveltyAllowance ?? 0.5);
  const anchorStrictness = clamp01(directives?.anchorStrictness ?? 0.5);
  const balanceCorrectionPressure = clamp01(directives?.balanceCorrectionPressure ?? 0.5);
  const fatigueCaution = clamp01(directives?.fatigueCaution ?? 0.5);

  const notes: string[] = [];
  if (anchorStrictness >= 0.7) notes.push("Block wants stable anchors, not random lift churn.");
  if (progressionPressure >= 0.7) notes.push("Block is leaning on progression pressure when a live path exists.");
  if (noveltyAllowance <= 0.35) notes.push("Novelty budget is tight, so repeats should win unless there is a good reason to rotate.");
  if (balanceCorrectionPressure >= 0.7) notes.push("Lagging patterns get extra scoring pressure in this block.");
  if (fatigueCaution >= 0.7) notes.push("Fatigue caution is elevated, so the engine should keep the lid on heroics.");

  return {
    blockType: plan?.blockType ?? "unscoped",
    waveProfile: plan?.waveProfile ?? "stabilize",
    progressionBonus: 4 + progressionPressure * 10,
    anchorBonus: 4 + anchorStrictness * 12,
    noveltyPenalty: 4 + (1 - noveltyAllowance) * 12,
    balanceBonus: 2 + balanceCorrectionPressure * 12,
    fatiguePenalty: 2 + fatigueCaution * 12,
    accessoryVolumeShift:
      volumePressure >= 0.67 ? 1 : fatigueCaution >= 0.75 || volumePressure <= 0.33 ? -1 : 0,
    noveltyBudgetPerWeek: Math.max(0, rotationRules?.noveltyBudgetPerWeek ?? (noveltyAllowance <= 0.35 ? 1 : 2)),
    minAnchorExposure: Math.max(1, rotationRules?.minAnchorExposure ?? (anchorStrictness >= 0.7 ? 5 : 3)),
    minPrimaryAccessoryExposure: Math.max(1, rotationRules?.minPrimaryAccessoryExposure ?? 3),
    forcedCarryPatterns: Array.isArray(rotationRules?.forcedCarryPatterns) ? rotationRules!.forcedCarryPatterns : [],
    notes,
  };
}

export function isAnchorSlot(slot: Slot): boolean {
  return ANCHOR_SLOTS.includes(slot);
}

export function isAccessorySlot(slot: Slot): boolean {
  return ACCESSORY_SLOTS.includes(slot);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}
