export const RATIOS: Record<string, number> = {
  Féculents: 0.325,
  Protéines: 0.475,
  Légumes: 0.05,
  Sides: 0.15,
};

export const CAPS_GRAMS: Record<string, { min?: number; max?: number }> = {
  Légumes: { min: 200, max: 450 },
  Sides: { min: 0, max: 25 },
};

export const DAY_MEAL_SLOTS = [
  { key: "petit_dejeuner", label: "Petit déjeuner", ratio: 0.15 },
  { key: "dejeuner", label: "Déjeuner", ratio: 0.25 },
  { key: "collation_apres_midi", label: "Collation après-midi", ratio: 0.1 },
  { key: "diner", label: "Dîner", ratio: 0.4 },
  { key: "collation_soir", label: "Collation soir", ratio: 0.1 },
] as const;

export type DayMealKey = (typeof DAY_MEAL_SLOTS)[number]["key"];

export const DINNER_MAX_RATIO = 0.5;
