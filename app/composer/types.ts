export type Food = {
  id: string;
  nom: string;
  typeName?: string;
  caloriesPer100g?: number;
};

export type SelectedMap = Record<string, { grams: number }>;

export type SelectedItem = Food & {
  grams: number;
  kcal: number;
};

export type Totals = {
  perType: Record<string, number>;
  total: number;
};
