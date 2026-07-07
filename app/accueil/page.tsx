"use client";
import { useEffect, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import {
  DAILY_CHICKEN_MAX_G,
  DAILY_WHEY_MAX_G,
  WHEY_SHAKER_KCAL,
  WHEY_SHAKER_PROTEINES,
} from "@/app/composer/constants";

const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const DAILY_KCAL_TARGET = 2450;


export default function Accueil() {
  const [poulet, setPoulet] = useState<any>(null);
  const [legumes, setLegumes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/foods?expandType=true", { credentials: "include" });
        const data = await res.json();
        if (Array.isArray(data)) {
          setPoulet(data.find((f) => f.nom?.toLowerCase().includes("poulet cru")));
          setLegumes(data.filter((f) => f.typeName === "Légumes"));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const jourIndex = new Date().getDay();
  const legumeDuJour = legumes.length ? legumes[jourIndex % legumes.length] : null;

  const pouletKcal = poulet ? Math.round((DAILY_CHICKEN_MAX_G / 100) * poulet.caloriesPer100g) : 0;
  const pouletProt = poulet ? Math.round((DAILY_CHICKEN_MAX_G / 100) * (poulet.proteinesPer100g || 0)) : 0;
  const wheyKcal = Math.round((DAILY_WHEY_MAX_G / 45) * WHEY_SHAKER_KCAL);
  const wheyProt = Math.round((DAILY_WHEY_MAX_G / 45) * WHEY_SHAKER_PROTEINES);
  const kcalRestant = DAILY_KCAL_TARGET - pouletKcal - wheyKcal;

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
        <Sidebar />
<main className="flex-1 p-6 pt-20 md:pt-10 md:p-10 max-w-2xl mx-auto w-full">          <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">{JOURS[jourIndex]}</p>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">
            Ton repas du jour
          </h2>

          {loading ? (
            <p className="text-gray-500 dark:text-gray-400">Chargement…</p>
          ) : (
            <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 p-6 space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-800 dark:text-white font-medium">
                  🍗 {poulet?.nom || "Blanc de poulet"}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {DAILY_CHICKEN_MAX_G}g · {pouletKcal} kcal · {pouletProt}g prot
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-800 dark:text-white font-medium">🥤 Clear Whey</span>
                <span className="text-gray-500 dark:text-gray-400">
                  {DAILY_WHEY_MAX_G}g · {wheyKcal} kcal · {wheyProt}g prot
                </span>
              </div>
              {legumeDuJour && (
                <div className="flex justify-between">
                  <span className="text-gray-800 dark:text-white font-medium">
                    🥦 {legumeDuJour.nom}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">à volonté</span>
                </div>
              )}
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">
                  Kcal restant à combler (accompagnements)
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                  {kcalRestant} kcal
                </span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 pt-2">
                Rappel : féculent uniquement au dîner, post-training.
              </p>
            </div>
          )}
        </main>
      </div>
    </RequireAuth>
  );
}