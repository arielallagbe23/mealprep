export type Food = {
  id: string;
  nom: string;
  typeName?: string;
  caloriesPer100g?: number;
  proteinesPer100g?: number;  // ✅ ajout
};

export type FoodType = {
  id: string;
  nomtype?: string;
};

export type SelectedMap = Record<string, { grams: number }>;

export type SelectedItem = Food & {
  grams: number;
  kcal: number;
  proteines: number;  // ✅ ajout
};

export type Totals = {
  perType: Record<string, number>;
  total: number;
  proteines: number;  // ✅ ajout
};