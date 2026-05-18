"use client";

import type { ReactElement } from "react";
import BackButton from "@/components/BackButton";
import {
  DAY_MEAL_SLOTS,
  RATIOS,
  WHEY_SHAKER_KCAL,
  WHEY_SHAKER_PROTEINES,
  type DayMealKey,
} from "../constants";

type Props = {
  dailyKcal: string;
  setDailyKcal: (v: string) => void;
  mealBudgetKcal: number;
  surplusKcal: number;
  activeMeals: Record<DayMealKey, boolean>;
  composingMeal: DayMealKey;
  onToggleMeal: (key: DayMealKey) => void;
  onSelectMeal: (key: DayMealKey) => void;
  mealDistribution: Record<DayMealKey, number>;
  mealTargetKcal: number;
  loading: boolean;
  err: string;
  onAutoQuantities: () => void;
  typeBadge: (type: string) => ReactElement;
  wheyActive: boolean;
  onToggleWhey: () => void;
};

export default function ParamsCard({
  dailyKcal,
  setDailyKcal,
  mealBudgetKcal,
  surplusKcal,
  activeMeals,
  composingMeal,
  onToggleMeal,
  onSelectMeal,
  mealDistribution,
  mealTargetKcal,
  loading,
  err,
  onAutoQuantities,
  typeBadge,
  wheyActive,
  onToggleWhey,
}: Props) {
  const currentMealLabel =
    DAY_MEAL_SLOTS.find((slot) => slot.key === composingMeal)?.label || "Repas";
  const dailyBase = Number(dailyKcal) || 0;
  const shakerPct =
    wheyActive && dailyBase > 0 ? Math.round((WHEY_SHAKER_KCAL / dailyBase) * 1000) / 10 : 0;

  return (
    <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-4 shadow-sm">
      <BackButton label="Retour" fallbackHref="/accueil" className="mb-3 w-fit" />

      <h1 className="text-xl md:text-2xl font-bold text-center text-gray-900 dark:text-gray-100">
        🍽️ Composer un repas
      </h1>

      <div className="grid grid-cols-1 gap-3">
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Apport journalier (kcal)
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="ex: 2200"
            value={dailyKcal}
            onChange={(e) => setDailyKcal(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <div className={`rounded-lg border px-3 py-2 text-xs ${wheyActive ? "border-amber-300/50 dark:border-amber-700/70 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200" : "border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400"}`}>
          {wheyActive
            ? <>Shaker whey ON: <span className="font-semibold">{WHEY_SHAKER_KCAL} kcal / {WHEY_SHAKER_PROTEINES}g protéines</span> · budget repas: <span className="font-semibold">{mealBudgetKcal} kcal</span></>
            : <>Shaker whey OFF · budget repas: <span className="font-semibold">{mealBudgetKcal} kcal</span> (+{WHEY_SHAKER_KCAL} kcal remis)</>
          }
        </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 space-y-2">
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Repas de la journée
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Active les repas que tu manges, la répartition % est recalculée automatiquement.
            Le shaker whey est ajouté automatiquement.
          </div>

          <div className="space-y-2">
            {DAY_MEAL_SLOTS.map((slot) => {
              const active = !!activeMeals[slot.key];
              const selected = composingMeal === slot.key;
              const pct = Math.round((mealDistribution[slot.key] || 0) * 1000) / 10;

              return (
                <div
                  key={slot.key}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                    selected
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                  }`}
                >
                  <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => onToggleMeal(slot.key)}
                      className="accent-blue-600"
                    />
                    <span>{slot.label}</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded ${
                        active
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {pct}%
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectMeal(slot.key)}
                      disabled={!active}
                      className={`px-3 py-1.5 rounded text-xs font-semibold ${
                        selected
                          ? "bg-blue-600 text-white"
                          : active
                          ? "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-100"
                          : "bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed"
                      }`}
                    >
                      Composer
                    </button>
                  </div>
                </div>
              );
            })}

            <div
              className={`flex items-center justify-between rounded-lg border px-3 py-2 cursor-pointer ${wheyActive ? "border-emerald-400/60 dark:border-emerald-700/60 bg-emerald-50/70 dark:bg-emerald-950/20" : "border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800"}`}
              onClick={onToggleWhey}
            >
              <label className={`flex items-center gap-2 text-sm cursor-pointer ${wheyActive ? "text-emerald-900 dark:text-emerald-200" : "text-gray-500 dark:text-gray-400"}`}>
                <input type="checkbox" checked={wheyActive} onChange={onToggleWhey} className="accent-emerald-500" />
                <span>🥤 Shaker whey</span>
                {wheyActive && <span className="text-xs text-emerald-600 dark:text-emerald-400">+{WHEY_SHAKER_PROTEINES}g protéines</span>}
              </label>
              <div className="flex items-center gap-2">
                {wheyActive && (
                  <span className="text-xs font-semibold px-2 py-1 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {shakerPct}%
                  </span>
                )}
                <span className={`text-xs font-semibold px-2 py-1 rounded ${wheyActive ? "bg-emerald-200/80 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200" : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"}`}>
                  {wheyActive ? `${WHEY_SHAKER_KCAL} kcal` : "OFF"}
                </span>
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400">
            Repas actif: <span className="font-semibold">{currentMealLabel}</span>
          </div>
        </div>
      </div>

      <div className="text-sm text-gray-700 dark:text-gray-200 flex flex-wrap gap-2">
        <span className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700">
          Cible {currentMealLabel.toLowerCase()} : <b>{mealTargetKcal}</b> kcal
        </span>
        <span className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700">
          Écart actuel : <b>{surplusKcal}</b> kcal
        </span>
        {Object.keys(RATIOS).map((t) => (
          <span key={t}>{typeBadge(t)}</span>
        ))}
      </div>

      <button
        type="button"
        disabled={mealTargetKcal <= 0 || loading || !!err}
        onClick={onAutoQuantities}
        className={`w-full py-3 rounded-lg font-semibold text-white ${
          mealTargetKcal <= 0 || loading || !!err
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-purple-600 hover:bg-purple-700 active:scale-95 transition"
        }`}
      >
        ⚡ Auto-quantités
      </button>
    </div>
  );
}
