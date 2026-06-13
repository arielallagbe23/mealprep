"use client";

import Link from "next/link";
import { useState } from "react";
import type { SelectedItem, Totals } from "../types";

type Props = {
  selectedList: SelectedItem[];
  nbRepas: number;
  setNbRepas: (updater: (n: number) => number) => void;
  updateFoodGrams: (id: string, delta: number) => void;
  totals: Totals;
  mealTargetKcal: number;
  mealTargetProteines: number;
  onSaveMeal: () => void;
  success: string | null;
};

export default function MealSummary({
  selectedList,
  nbRepas,
  setNbRepas,
  updateFoodGrams,
  totals,
  mealTargetKcal,
  mealTargetProteines,
  onSaveMeal,
  success,
}: Props) {
  const [logging, setLogging] = useState(false);
  const [logSuccess, setLogSuccess] = useState<string | null>(null);
  const [logErr, setLogErr] = useState<string | null>(null);

  const kcalTotal = totals.total * nbRepas;
  const kcalCible = mealTargetKcal * nbRepas;
  const protTotal = Math.round(totals.proteines * nbRepas * 10) / 10;
  const protCible = Math.round(mealTargetProteines * nbRepas * 10) / 10;
  const protPct = protCible > 0 ? Math.min(100, Math.round((protTotal / protCible) * 100)) : 0;
  const kcalRemaining = Math.max(0, kcalCible - kcalTotal);

  async function handleLogCalories() {
    if (kcalTotal <= 0) return;
    const dateKey = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 10);
    setLogging(true);
    setLogSuccess(null);
    setLogErr(null);
    try {
      const res = await fetch("/api/calorie-auth/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dateKey, calories: kcalTotal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur");
      setLogSuccess(`✅ ${kcalTotal} kcal ajoutées au comptage`);
    } catch (e: any) {
      setLogErr(e.message || "Erreur");
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="space-y-3">

      {/* Résumé du repas */}
      <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 space-y-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          Ton repas
        </h3>

        {/* Nb portions */}
        <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
          <span>Nombre de repas</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setNbRepas((n) => Math.max(1, n - 1))}
              className="w-11 h-11 rounded-full bg-rose-600 text-white text-2xl font-bold hover:bg-rose-700 active:scale-90 transition flex items-center justify-center"
            >
              –
            </button>
            <span className="font-bold text-xl w-6 text-center">{nbRepas}</span>
            <button
              type="button"
              onClick={() => setNbRepas((n) => n + 1)}
              className="w-11 h-11 rounded-full bg-blue-600 text-white text-2xl font-bold hover:bg-blue-700 active:scale-90 transition flex items-center justify-center"
            >
              +
            </button>
          </div>
        </div>

        {/* Liste aliments */}
        {selectedList.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Clique sur ⚡ Auto-quantités pour générer une proposition.
          </p>
        ) : (
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
            {selectedList.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">{f.nom}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateFoodGrams(f.id, -5)}
                    className="w-10 h-10 rounded-full bg-rose-600 text-white text-xl font-bold hover:bg-rose-700 active:scale-90 transition flex items-center justify-center"
                  >
                    –
                  </button>
                  <div className="text-center min-w-[60px]">
                    <div className="font-semibold">{f.grams * nbRepas} g</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{f.kcal * nbRepas} kcal</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateFoodGrams(f.id, 5)}
                    className="w-10 h-10 rounded-full bg-blue-600 text-white text-xl font-bold hover:bg-blue-700 active:scale-90 transition flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Totaux */}
        <div className="mt-3 flex justify-between text-sm font-semibold text-gray-800 dark:text-gray-100">
          <span>Total</span>
          <span>{kcalTotal} / {kcalCible} kcal</span>
        </div>
      </div>

      {/* Jauge protéines */}
      {protCible > 0 && (
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 space-y-2 shadow-sm">
          <div className="flex justify-between text-sm font-semibold text-gray-800 dark:text-gray-100">
            <span>Protéines</span>
            <span className={protPct >= 100 ? "text-emerald-500" : protPct >= 80 ? "text-amber-400" : "text-rose-400"}>
              {protTotal} / {protCible} g
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                protPct >= 100
                  ? "bg-emerald-500"
                  : protPct >= 80
                  ? "bg-amber-400"
                  : "bg-rose-500"
              }`}
              style={{ width: `${protPct}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 text-right">
            {protPct >= 100 ? "Objectif atteint ✅" : `${protPct}% — encore ${Math.round((protCible - protTotal) * 10) / 10} g`}
          </div>
        </div>
      )}

      {/* Stats nutritionnelles */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 px-3 py-3">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
          Bilan nutritionnel
        </div>
        <div className="grid grid-cols-4 gap-2 text-sm text-gray-800 dark:text-gray-100">
          <div className="rounded-md bg-blue-100 dark:bg-blue-500 px-2 py-1 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-100">Calories</div>
            <div className="font-semibold">{kcalTotal}</div>
          </div>
          <div className="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-1 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">Cible</div>
            <div className="font-semibold">{kcalCible}</div>
          </div>
          <div className="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-1 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">Restant</div>
            <div className="font-semibold">{kcalRemaining}</div>
          </div>
          <div className="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-1 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">Protéines</div>
            <div className="font-semibold">{protTotal} g</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 gap-2">
        <button
          disabled={selectedList.length === 0 || kcalTotal <= 0 || logging}
          className={`w-full py-3 rounded-xl font-semibold text-white ${
            selectedList.length === 0 || kcalTotal <= 0 || logging
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-orange-600 hover:bg-orange-700"
          }`}
          onClick={handleLogCalories}
        >
          {logging ? "Ajout en cours…" : `📊 Ajouter ${kcalTotal} kcal au comptage`}
        </button>

        {logSuccess && (
          <div className="rounded-lg border border-emerald-700 bg-emerald-900/40 text-emerald-200 px-3 py-2 text-sm">
            {logSuccess}
          </div>
        )}
        {logErr && (
          <div className="rounded-lg border border-rose-700 bg-rose-900/40 text-rose-200 px-3 py-2 text-sm">
            {logErr}
          </div>
        )}

        <button
          disabled={mealTargetKcal <= 0 || selectedList.length === 0}
          className={`w-full py-3 rounded-xl font-semibold text-white ${
            mealTargetKcal <= 0 || selectedList.length === 0
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700"
          }`}
          onClick={onSaveMeal}
        >
          💾 Enregistrer ce repas
        </button>

        {success && (
          <div className="rounded-lg border border-emerald-700 bg-emerald-900/40 text-emerald-200 px-3 py-2 text-sm">
            {success}
          </div>
        )}

        <Link
          href="/meals"
          className="block w-full text-center py-3 mb-20 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700"
        >
          📚 Mes repas enregistrés
        </Link>
      </div>
    </div>
  );
}
