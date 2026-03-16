import type { NeedKey, NeedSnapshot, RecoveryBias } from "./sessionNeedsEngine";
import type { Slot } from "./slotEngine";

export type SessionBundle = {
  emphasis: string;
  slots: Slot[];
  reasons: string[];
  topNeeds: NeedKey[];
  recoveryBias: RecoveryBias;
};

export type ComposerInput = {
  needs: NeedSnapshot;
  preferredPairings?: Partial<Record<NeedKey, NeedKey[]>>;
  blockedPairings?: Array<[NeedKey, NeedKey]>;
};

const PRIMARY_SLOT_BY_NEED: Record<NeedKey, Slot> = {
  horizontalPress: "PrimaryPress",
  verticalPress: "Shoulders",
  row: "PrimaryRow",
  verticalPull: "VerticalPull",
  quadDominant: "PrimarySquat",
  hinge: "Hinge",
  biceps: "Biceps",
  triceps: "Triceps",
  delts: "Shoulders",
  calves: "Calves",
};

const NEED_LABELS: Record<NeedKey, string> = {
  horizontalPress: "Horizontal Press",
  verticalPress: "Vertical Press",
  row: "Row",
  verticalPull: "Vertical Pull",
  quadDominant: "Quad Dominant",
  hinge: "Hinge",
  biceps: "Biceps",
  triceps: "Triceps",
  delts: "Delts",
  calves: "Calves",
};

function pairAllowed(
  a: NeedKey,
  b: NeedKey,
  blockedPairings: ComposerInput["blockedPairings"]
): boolean {
  if (!blockedPairings || blockedPairings.length === 0) return true;
  return !blockedPairings.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a)
  );
}

function defaultPairingsForNeed(need: NeedKey): NeedKey[] {
  switch (need) {
    case "horizontalPress":
      return ["triceps", "delts"];
    case "verticalPress":
      return ["triceps", "horizontalPress", "delts"];
    case "row":
      return ["verticalPull", "biceps", "triceps", "delts"];
    case "verticalPull":
      return ["row", "biceps", "rearSupport" as NeedKey];
    case "quadDominant":
      return ["calves", "hinge"];
    case "hinge":
      return ["quadDominant", "calves"];
    case "biceps":
      return ["row", "verticalPull", "horizontalPress"];
    case "triceps":
      return ["horizontalPress", "row", "verticalPress"];
    case "delts":
      return ["horizontalPress", "triceps", "calves"];
    case "calves":
      return ["quadDominant", "hinge", "delts"];
    default:
      return [];
  }
}

function slotBundleForPrimary(primary: NeedKey, recoveryBias: RecoveryBias): Slot[] {
  switch (primary) {
    case "horizontalPress":
      return recoveryBias === "red"
        ? ["SecondaryPress", "Shoulders", "Triceps", "Pump"]
        : ["PrimaryPress", "SecondaryPress", "Shoulders", "Triceps", "Pump"];
    case "verticalPress":
      return recoveryBias === "red"
        ? ["Shoulders", "Triceps", "Pump"]
        : ["SecondaryPress", "Shoulders", "Triceps", "Pump"];
    case "row":
      return recoveryBias === "red"
        ? ["PrimaryRow", "RearDelts", "Biceps", "Triceps"]
        : ["PrimaryRow", "VerticalPull", "SecondaryRow", "RearDelts", "Biceps"];
    case "verticalPull":
      return recoveryBias === "red"
        ? ["VerticalPull", "RearDelts", "Biceps"]
        : ["PrimaryRow", "VerticalPull", "RearDelts", "Biceps"];
    case "quadDominant":
      return recoveryBias === "red"
        ? ["SecondaryQuad", "Hamstrings", "Calves"]
        : ["PrimarySquat", "Hinge", "SecondaryQuad", "Hamstrings", "Calves"];
    case "hinge":
      return recoveryBias === "red"
        ? ["Hamstrings", "Calves"]
        : ["Hinge", "SecondaryQuad", "Hamstrings", "Calves"];
    case "biceps":
      return ["PrimaryRow", "VerticalPull", "Biceps", "RearDelts"];
    case "triceps":
      return ["SecondaryPress", "Triceps", "Pump"];
    case "delts":
      return ["Shoulders", "Pump", "Triceps"];
    case "calves":
      return ["Calves", "SecondaryQuad", "Hamstrings"];
    default:
      return ["PrimaryPress", "SecondaryPress", "Shoulders", "Triceps"];
  }
}

function uniqueSlots(slots: Slot[]): Slot[] {
  const seen = new Set<Slot>();
  const out: Slot[] = [];
  for (const slot of slots) {
    if (!seen.has(slot)) {
      seen.add(slot);
      out.push(slot);
    }
  }
  return out;
}

export function composeAdaptiveSession(input: ComposerInput): SessionBundle {
  const ranked = input.needs.ranked;
  const recoveryBias = input.needs.recoveryBias;
  const topNeeds = ranked.slice(0, 4).map((n) => n.key);

  const primary = topNeeds[0];
  let slots = slotBundleForPrimary(primary, recoveryBias);
  const reasons: string[] = [
    `${NEED_LABELS[primary]} scored highest, so it becomes the anchor for this session.`,
  ];

  const userPairings = input.preferredPairings?.[primary] ?? [];
  const defaultPairs = defaultPairingsForNeed(primary);
  const pairCandidates = [...userPairings, ...defaultPairs];

  for (const pair of pairCandidates) {
    if (!topNeeds.includes(pair)) continue;
    if (!pairAllowed(primary, pair, input.blockedPairings)) continue;

    const pairSlot = PRIMARY_SLOT_BY_NEED[pair];
    if (pairSlot && !slots.includes(pairSlot)) {
      slots.push(pairSlot);
      reasons.push(`${NEED_LABELS[pair]} also scored well and pairs cleanly with the anchor pattern.`);
    }
  }

  if (recoveryBias === "red") {
    reasons.push("Recovery is red, so the composer trims down costly slot combinations and leans toward a lighter bundle.");
  } else if (recoveryBias === "yellow") {
    reasons.push("Recovery is fair but not plush, so the bundle stays productive without getting too greedy.");
  } else {
    reasons.push("Recovery is green, so the composer allows a fuller session bundle.");
  }

  slots = uniqueSlots(slots).slice(0, recoveryBias === "red" ? 4 : 5);

  const emphasis =
    topNeeds.length > 1
      ? `${NEED_LABELS[primary]} + ${NEED_LABELS[topNeeds[1]]}`
      : NEED_LABELS[primary];

  return {
    emphasis,
    slots,
    reasons,
    topNeeds,
    recoveryBias,
  };
}
