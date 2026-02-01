"use client";

import type { Food, SelectedMap } from "../types";

type Props = {
  grouped: Record<string, Food[]>;
  selected: SelectedMap;
  loading: boolean;
  err: string;
  onAddFood: (id: string) => void;
  onRemoveFood: (id: string) => void;
};

export default function FoodsList({
  grouped,
  selected,
  loading,
  err,
  onAddFood,
  onRemoveFood,
}: Props) {
  if (loading) {
    return (
      <div className="text-center text-sm text-gray-500 dark:text-gray-400">
        Chargement des aliments...
      </div>
    );
  }

  if (err) {
    return (
      <div className="text-center text-sm text-red-700 bg-red-100 dark:bg-red-200 dark:text-red-900 px-3 py-2 rounded-lg">
        {err}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([type, items]) => (
        <div
          key={type}
          className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800 shadow-sm"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-300">
            {type}
          </h2>
          <ul className="space-y-2">
            {items.map((item) => {
              const isSel = !!selected[item.id];
              const grams = selected[item.id]?.grams ?? 0;
              const kcal = Math.round((grams / 100) * (item.caloriesPer100g || 0));
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-gray-800 dark:text-gray-100 truncate">
                      {item.nom}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.caloriesPer100g} kcal/100g
                    </p>
                  </div>

                  {!isSel ? (
                    <button
                      onClick={() => onAddFood(item.id)}
                      className="ml-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition"
                    >
                      ➕ Ajouter
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-800 dark:text-gray-100 min-w-[70px] text-right">
                        {grams} g
                      </span>
                      <span className="text-xs text-gray-700 dark:text-gray-200 min-w-[64px] text-right">
                        {kcal} kcal
                      </span>
                      <button
                        onClick={() => onRemoveFood(item.id)}
                        className="px-3 py-2 rounded-lg bg-rose-600 text-white text-sm hover:bg-rose-700 active:scale-95 transition"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
