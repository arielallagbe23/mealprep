export const RATIOS: Record<string, number> = {
  Féculents: 0.12,
  Protéines: 0.34,
  Légumes: 0.08,
  Sides: 0.46,
};

export const FECULENTS_ALLOWED_SLOTS: string[] = ["diner"];

export const CAPS_GRAMS: Record<string, { min?: number; max?: number }> = {
  Légumes: { min: 250, max: 500 },
  Sides: { min: 80, max: 160 },
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

export const WHEY_SHAKER_KCAL = 180;
export const WHEY_SHAKER_PROTEINES = 42;

export const DAILY_CHICKEN_MAX_G = 500;
export const DAILY_WHEY_MAX_G = 45;