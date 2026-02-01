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
