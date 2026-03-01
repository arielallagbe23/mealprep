"use client";

import { useEffect, useState } from "react";
import type { SelectedItem, Totals } from "../types";

type Props = {
  selectedList: SelectedItem[];
  nbRepas: number;
  setNbRepas: (updater: (n: number) => number) => void;
  updateFoodGrams: (id: string, delta: number) => void;
  totals: Totals;
  mealTargetKcal: number;
  dailyKcal: string;
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
  dailyKcal,
  onSaveMeal,
  success,
}: Props) {
  const todayISO = () => {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };
  const [logDate, setLogDate] = useState<string>(todayISO());
  const [snackKcal, setSnackKcal] = useState<string>("");
  const [entries, setEntries] = useState<
    { id: string; date: string; mealKcal: number; dayKcal: number; label?: string }[]
  >([]);
  const [uid, setUid] = useState<string | null>(null);
  const [loadingLog, setLoadingLog] = useState(false);
  const [logErr, setLogErr] = useState<string | null>(null);
  const [countSuccess, setCountSuccess] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/users/me", { credentials: "include" });
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || "Non autorisé");
        if (alive) setUid(d.uid);
      } catch (e: any) {
        if (alive) setLogErr(e.message || "Erreur");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!uid || !logDate) return;
    (async () => {
      try {
        setLoadingLog(true);
        setLogErr(null);
        const r = await fetch(
          `/api/calorie-log?userId=${encodeURIComponent(uid)}&date=${encodeURIComponent(
            logDate
          )}`,
          { credentials: "include" }
        );
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || "Erreur chargement");
        if (alive) setEntries(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (alive) setLogErr(e.message || "Erreur");
      } finally {
        if (alive) setLoadingLog(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [uid, logDate]);

  const handleCount = async () => {
    const mealKcal = Math.round(totals.total * nbRepas);
    const dateKey = todayISO();
    if (mealKcal <= 0) return;
    try {
      setLoadingLog(true);
      setLogErr(null);
      setCountSuccess(null);
      const res = await fetch("/api/calorie-auth/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          dateKey,
          calories: mealKcal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur d'enregistrement");
      setCountSuccess("Ajouté au comptage calories");
    } catch (e: any) {
      setLogErr(e.message || "Erreur");
    } finally {
      setLoadingLog(false);
    }
  };

  const handleAddSnack = async () => {
    const kcal = Number(snackKcal) || 0;
    const dayKcal = Number(dailyKcal) || 0;
    if (!uid || !logDate || kcal <= 0 || dayKcal <= 0) return;
    try {
      setLogErr(null);
      const res = await fetch("/api/calorie-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          userId: uid,
          date: logDate,
          mealKcal: kcal,
          dayKcal,
          label: "Collation",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur d'enregistrement");
      const r = await fetch(
        `/api/calorie-log?userId=${encodeURIComponent(uid)}&date=${encodeURIComponent(
          logDate
        )}`,
        { credentials: "include" }
      );
      const list = await r.json();
      if (r.ok) setEntries(Array.isArray(list) ? list : []);
      setSnackKcal("");
    } catch (e: any) {
      setLogErr(e.message || "Erreur");
    }
  };

  const handleDelete = async (id: string) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/calorie-log/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Suppression impossible");
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e: any) {
      setLogErr(e.message || "Erreur");
    }
  };

  const dayTarget = Number(entries[0]?.dayKcal || dailyKcal) || 0;
  const totalConsumed = entries.reduce((s, e) => s + (Number(e.mealKcal) || 0), 0);
  const chartMax = Math.max(dayTarget, totalConsumed, 1);

  const buildPolyline = (points: { x: number; y: number }[]) =>
    points.map((p) => `${p.x},${p.y}`).join(" ");

  const buildChart = () => {
    const width = 320;
    const height = 120;
    const pad = 12;
    const usableW = width - pad * 2;
    const usableH = height - pad * 2;

    const n = Math.max(entries.length, 2);
    const stepX = usableW / (n - 1);

    let acc = 0;
    const consumedPoints = entries.map((e, i) => {
      acc += Number(e.mealKcal) || 0;
      const x = pad + stepX * i;
      const y = pad + usableH * (1 - acc / chartMax);
      return { x, y };
    });

    const consumedPolyline =
      consumedPoints.length > 1
        ? buildPolyline(consumedPoints)
        : buildPolyline([
            { x: pad, y: pad + usableH },
            { x: pad + usableW, y: pad + usableH },
          ]);

    const targetY = pad + usableH * (1 - dayTarget / chartMax);
    const targetPolyline = buildPolyline([
      { x: pad, y: targetY },
      { x: pad + usableW, y: targetY },
    ]);

    return {
      width,
      height,
      consumedPolyline,
      targetPolyline,
    };
  };

  const chart = buildChart();

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 space-y-4 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          Ton repas
        </h3>

        <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
          <span>Nombre de repas :</span>
          <span className="font-semibold">{nbRepas}</span>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setNbRepas((n) => Math.max(1, n - 1))}
              className="px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 font-bold active:scale-95 transition"
            >
              –
            </button>
            <button
              type="button"
              onClick={() => setNbRepas((n) => n + 1)}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-bold active:scale-95 transition"
            >
              +
            </button>
          </div>
        </div>

        {selectedList.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Clique sur ⚡ Auto-quantités pour générer une proposition.
          </p>
        ) : (
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
            {selectedList.map((f) => {
              const gramsTotal = f.grams * nbRepas;
              const kcalTotal = f.kcal * nbRepas;
              return (
                <li key={f.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {f.nom} — {gramsTotal} g
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateFoodGrams(f.id, -5)}
                        className="px-2 py-1 rounded bg-rose-600 text-white text-xs hover:bg-rose-700 active:scale-95 transition"
                      >
                        –
                      </button>
                      <button
                        type="button"
                        onClick={() => updateFoodGrams(f.id, 5)}
                        className="px-2 py-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-700 active:scale-95 transition"
                      >
                        +
                      </button>
                    </div>
                    <span className="font-medium min-w-[72px] text-right">
                      {kcalTotal} kcal
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-3 flex justify-between text-sm font-semibold text-gray-800 dark:text-gray-100">
          <span>Total</span>
          <span>
            {totals.total * nbRepas} / {mealTargetKcal * nbRepas} kcal
          </span>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/40 px-3 py-3">
        <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Comptage calories
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm text-gray-800 dark:text-gray-100">
          <div className="rounded-md bg-blue-100 dark:bg-blue-500 px-2 py-1 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-100">Total</div>
            <div className="font-semibold">{totals.total * nbRepas}</div>
          </div>
          <div className="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-1 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">Cible</div>
            <div className="font-semibold">{mealTargetKcal * nbRepas}</div>
          </div>
          <div className="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-1 text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">Restant</div>
            <div className="font-semibold">
              {Math.max(0, mealTargetKcal * nbRepas - totals.total * nbRepas)}
            </div>
          </div>
        </div>
      </div>



      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          disabled={
            loadingLog ||
            totals.total * nbRepas <= 0
          }
          className={`w-full py-3 rounded-xl font-semibold text-white ${
            loadingLog || totals.total * nbRepas <= 0
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-orange-600 hover:bg-orange-700"
          }`}
          onClick={handleCount}
        >
          {loadingLog ? "Ajout en cours..." : "Ajouter au comptage calorie"}
        </button>

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
          <div className="mb-3 rounded-lg border border-emerald-700 bg-emerald-900/40 text-emerald-200 px-3 py-2">
            {success}
          </div>
        )}

        {countSuccess && (
          <div className="rounded-lg border border-emerald-700 bg-emerald-900/40 px-3 py-2 text-emerald-200">
            {countSuccess}
          </div>
        )}

        {logErr && (
          <div className="rounded-lg border border-rose-700 bg-rose-900/40 px-3 py-2 text-rose-200">
            {logErr}
          </div>
        )}

        <a
          href="/meals"
          className="block w-full text-center py-3 mb-20 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700"
        >
          📚 Mes repas enregistrés
        </a>
      </div>
    </div>
  );
}
