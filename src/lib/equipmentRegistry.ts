import type { EquipmentId, EquipmentItem, EquipmentProfile } from "./equipmentTypes";

export const EQUIPMENT_ITEMS: EquipmentItem[] = [
  { id: "barbell", name: "Barbell", category: "free_weight", aliases: ["olympic barbell"] },
  { id: "adjustable_bench", name: "Adjustable Bench", category: "bench", aliases: ["bench"] },
  { id: "power_rack", name: "Power Rack", category: "rack", aliases: ["rack", "squat rack"] },
  { id: "adjustable_dumbbells", name: "Adjustable Dumbbells", category: "free_weight", aliases: ["dumbbells", "dbs"] },
  { id: "safety_squat_bar", name: "Safety Squat Bar", category: "free_weight", aliases: ["ssb", "safety squat bar"] },
  { id: "resistance_bands", name: "Resistance Bands", category: "accessory", aliases: ["bands"] },
  { id: "bodyweight_space", name: "Bodyweight Training Space", category: "bodyweight", aliases: ["bodyweight"] },
  { id: "chin_up_bar", name: "Chin-Up Bar", category: "bodyweight", aliases: ["pull-up bar", "chin up bar"] },
  { id: "dip_station", name: "Dip Station", category: "bodyweight", aliases: ["dip bars"] },
  { id: "cable_pulldown_station", name: "Cable / Pulldown Station", category: "cable", aliases: ["lat tower", "cable station", "pulldown"] },
  { id: "leverage_squat_attachment", name: "Leverage Squat Attachment", category: "machine", aliases: ["leverage squat"] },
  { id: "leg_extension_curl_attachment", name: "Leg Extension / Curl Attachment", category: "machine", aliases: ["leg ext curl", "leg extension", "ham curl"] },
  { id: "roman_chair", name: "Roman Chair", category: "accessory", aliases: ["back extension", "hyperextension"] },
  { id: "landmine_attachment", name: "Landmine Attachment", category: "accessory", aliases: ["landmine"] },
  { id: "chest_press_machine", name: "Chest Press Machine", category: "machine" },
  { id: "pec_deck_machine", name: "Pec Deck", category: "machine" },
  { id: "reverse_pec_deck_machine", name: "Reverse Pec Deck", category: "machine" },
  { id: "leg_press_machine", name: "Leg Press", category: "machine" },
  { id: "preacher_station", name: "Preacher Station", category: "machine" },
  { id: "glute_ham_bench", name: "Glute Ham Bench", category: "machine" },
  { id: "seated_calf_machine", name: "Seated Calf Machine", category: "machine" },
  { id: "t_bar_row_station", name: "T-Bar Row Station", category: "machine" },
];

const ITEM_BY_ID = new Map<EquipmentId, EquipmentItem>(EQUIPMENT_ITEMS.map((item) => [item.id, item]));

// Default profile tuned to the user's currently known home gym + observed app usage.
export const DEFAULT_EQUIPMENT_PROFILE: EquipmentProfile = {
  version: 1,
  available: [
    "barbell",
    "adjustable_bench",
    "power_rack",
    "adjustable_dumbbells",
    "safety_squat_bar",
    "resistance_bands",
    "bodyweight_space",
    "chin_up_bar",
    "dip_station",
    "cable_pulldown_station",
    "leverage_squat_attachment",
    "leg_extension_curl_attachment",
    "roman_chair",
  ],
};

export function getEquipmentById(id: string): EquipmentItem | null {
  return ITEM_BY_ID.get(String(id || "").trim() as EquipmentId) ?? null;
}

export function normalizeEquipmentProfile(raw: unknown): EquipmentProfile {
  const available = Array.isArray((raw as any)?.available)
    ? (raw as any).available
        .map((item: unknown) => String(item || "").trim() as EquipmentId)
        .filter((item: EquipmentId) => ITEM_BY_ID.has(item))
    : DEFAULT_EQUIPMENT_PROFILE.available;

  return {
    version: 1,
    available: [...new Set(available)],
  };
}
