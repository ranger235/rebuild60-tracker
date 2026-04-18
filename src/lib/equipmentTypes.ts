export type EquipmentId =
  | "barbell"
  | "adjustable_bench"
  | "power_rack"
  | "adjustable_dumbbells"
  | "safety_squat_bar"
  | "resistance_bands"
  | "bodyweight_space"
  | "chin_up_bar"
  | "dip_station"
  | "cable_pulldown_station"
  | "leverage_squat_attachment"
  | "leg_extension_curl_attachment"
  | "roman_chair"
  | "landmine_attachment"
  | "chest_press_machine"
  | "pec_deck_machine"
  | "reverse_pec_deck_machine"
  | "leg_press_machine"
  | "preacher_station"
  | "glute_ham_bench"
  | "seated_calf_machine"
  | "t_bar_row_station";

export type EquipmentItem = {
  id: EquipmentId;
  name: string;
  aliases?: string[];
  category: "free_weight" | "rack" | "bench" | "cable" | "machine" | "bodyweight" | "accessory";
};

export type EquipmentProfile = {
  version: 1;
  available: EquipmentId[];
};

export type EquipmentRequirementGroup = EquipmentId[];
