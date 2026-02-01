"use client";

import BackButton from "@/components/BackButton";
import { RATIOS } from "../constants";

type Props = {
  dailyKcal: string;
  setDailyKcal: (v: string) => void;
  breakfastKcal: string;
  setBreakfastKcal: (v: string) => void;
  surplusKcal: number;
  mealType: "dejeuner" | "diner";
  setMealType: (v: "dejeuner" | "diner") => void;
  mealTargetKcal: number;
  loading: boolean;
  err: string;
  onAutoQuantities: () => void;
  typeBadge: (type: string) => JSX.Element;
};

export default function ParamsCard({
  dailyKcal,
  setDailyKcal,
  breakfastKcal,
  setBreakfastKcal,
  surplusKcal,
  mealType,
  setMealType,
  mealTargetKcal,
  loading,
  err,
  onAutoQuantities,
  typeBadge,
}: Props) {
  return (
    <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-4 shadow-sm">
      <BackButton label="Retour" fallbackHref="/accueil" className="mb-3 w-fit" />

      <h1 className="text-xl md:text-2xl font-bold text-center text-white">
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

        <label className="text-sm text-gray-700 dark:text-gray-300">
          Petit déjeuner (kcal)
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="ex: 300"
            value={breakfastKcal}
            onChange={(e) => setBreakfastKcal(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <label className="text-sm text-gray-700 dark:text-gray-300">
          Surplus calorique
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="ex: 150"
            value={surplusKcal}
            readOnly
            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <span className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700">
          Restant après petit-déj :{" "}
          <b>{Math.max(0, (Number(dailyKcal) || 0) - (Number(breakfastKcal) || 0))}</b> kcal
        </span>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMealType("dejeuner")}
            className={`flex-1 py-3 rounded-lg font-semibold text-sm md:text-base ${
              mealType === "dejeuner"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            }`}
          >
            Déjeuner (60%)
          </button>
          <button
            type="button"
            onClick={() => setMealType("diner")}
            className={`flex-1 py-3 rounded-lg font-semibold text-sm md:text-base ${
              mealType === "diner"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            }`}
          >
            Dîner (40%)
          </button>
        </div>
      </div>

      <div className="text-sm text-gray-700 dark:text-gray-200 flex flex-wrap gap-2">
        <span className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700">
          Cible repas : <b>{mealTargetKcal}</b> kcal (±5%)
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
