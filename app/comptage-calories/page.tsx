"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/components/useAuth";

// ─── Types ───────────────────────────────────────────────────────────────────

type LimitRecord = { limitCalories: number; effectiveDate: string };
type DayEntry = { calories: number; proteines: number };
type CalorieData = {
  entries: Record<string, DayEntry>;
  dailyLimit: number;
  limitHistory: LimitRecord[];
  dailyProteinGoal: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split("T")[0];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateLong(dateKey: string) {
  return new Date(dateKey + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ComptageCalories() {
  const { user } = useAuth();

  const [data, setData] = useState<CalorieData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add entry form
  const [addDate, setAddDate] = useState(TODAY);
  const [addCal, setAddCal] = useState("");
  const [addProt, setAddProt] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Calorie limit form
  const [limitVal, setLimitVal] = useState("");
  const [limitDate, setLimitDate] = useState(TODAY);
  const [limitMsg, setLimitMsg] = useState("");
  const [limitLoading, setLimitLoading] = useState(false);

  // Protein goal form
  const [protGoalVal, setProtGoalVal] = useState("");
  const [protGoalMsg, setProtGoalMsg] = useState("");
  const [protGoalLoading, setProtGoalLoading] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────

  async function loadData() {
    try {
      setError("");
      const res = await fetch("/api/calories", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        setError("Connexion requise");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Erreur ${res.status}`);
      }
      const d: CalorieData = await res.json();
      setData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const protGoal = data?.dailyProteinGoal ?? 0;

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleAddEntry(e: FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    setAddMsg("");
    try {
      const body: Record<string, unknown> = {
        dateKey: addDate,
        calories: Number(addCal),
      };
      if (addProt.trim() !== "") body.proteines = Number(addProt);

      const res = await fetch("/api/calories/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      setAddMsg(
        `Ajouté. Total ${fmtDateLong(addDate)} : ${json.calories} kcal${json.proteines ? ` · ${json.proteines} g prot.` : ""}`,
      );
      setAddCal("");
      setAddProt("");
      await loadData();
    } catch (err: unknown) {
      setAddMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleDeleteDate(dateKey: string) {
    if (!confirm(`Supprimer l'entrée du ${fmtDateLong(dateKey)} ?`)) return;
    await fetch(`/api/calories/entry?dateKey=${dateKey}`, {
      method: "DELETE",
      credentials: "include",
    });
    await loadData();
  }

  async function handleLimitUpdate(e: FormEvent) {
    e.preventDefault();
    setLimitLoading(true);
    setLimitMsg("");
    try {
      const res = await fetch("/api/calories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          limitCalories: Number(limitVal),
          effectiveDate: limitDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      setLimitMsg(
        `Limite enregistrée : ${json.dailyLimit} kcal à partir du ${fmtDateLong(limitDate)}`,
      );
      setLimitVal("");
      await loadData();
    } catch (err: unknown) {
      setLimitMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLimitLoading(false);
    }
  }

  async function handleProtGoalUpdate(e: FormEvent) {
    e.preventDefault();
    setProtGoalLoading(true);
    setProtGoalMsg("");
    try {
      const res = await fetch("/api/calories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dailyProteinGoal: Number(protGoalVal) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      setProtGoalMsg(`Objectif enregistré : ${json.dailyProteinGoal} g / jour`);
      setProtGoalVal("");
      await loadData();
    } catch (err: unknown) {
      setProtGoalMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setProtGoalLoading(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-900 flex flex-col md:flex-row">
        <Sidebar />
        <main className="flex-1 px-4 py-8 text-white">
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Header */}
          <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-green-400 mb-1">
              Comptage Calories & Protéines
            </p>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Objectifs & ajout manuel
                </h1>
                <p className="text-sm text-gray-400 mt-1">
                  Date du jour :{" "}
                  <span className="font-semibold text-white">
                    {fmtDateLong(TODAY)}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {user?.email && (
                  <span className="text-sm text-gray-300 truncate max-w-full">{user.email}</span>
                )}
                <Link
                  href="/performance"
                  className="rounded-lg border border-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 transition whitespace-nowrap"
                >
                  ← Retour
                </Link>
              </div>
            </div>
          </div>

          {loading && (
            <p className="text-gray-400 text-sm text-center py-8">
              Chargement…
            </p>
          )}

          {error && (
            <div className="rounded-xl border border-red-700 bg-red-900/30 p-4 text-red-300 text-sm">
              {error}
            </div>
          )}

          {data && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Objectif quotidien (calories + protéines) */}
              <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5 space-y-4">
                <h2 className="font-semibold text-white">
                  Objectif quotidien
                </h2>

                {/* Calorie limit */}
                <form onSubmit={handleLimitUpdate} className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Date d&apos;effet
                    </label>
                    <input
                      type="date"
                      value={limitDate}
                      onChange={(e) => setLimitDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Limite calories / jour
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={limitVal}
                      onChange={(e) => setLimitVal(e.target.value)}
                      placeholder={`Actuelle : ${data.dailyLimit} kcal`}
                      required
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={limitLoading}
                    className="w-full rounded-lg bg-green-500 hover:bg-green-600 disabled:bg-gray-600 px-4 py-2 text-sm font-semibold text-gray-900 transition"
                  >
                    {limitLoading
                      ? "Enregistrement…"
                      : "Enregistrer la limite"}
                  </button>
                  {limitMsg && (
                    <p className="text-xs text-gray-400">{limitMsg}</p>
                  )}
                </form>

                <div className="border-t border-gray-700 pt-4">
                  {/* Protein goal */}
                  <form onSubmit={handleProtGoalUpdate} className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Objectif protéines / jour (g)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={protGoalVal}
                        onChange={(e) => setProtGoalVal(e.target.value)}
                        placeholder={
                          protGoal > 0 ? `Actuel : ${protGoal} g` : "Ex: 150"
                        }
                        required
                        className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={protGoalLoading}
                      className="w-full rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 px-4 py-2 text-sm font-semibold text-white transition"
                    >
                      {protGoalLoading
                        ? "Enregistrement…"
                        : "Enregistrer l'objectif protéines"}
                    </button>
                    {protGoalMsg && (
                      <p className="text-xs text-gray-400">{protGoalMsg}</p>
                    )}
                  </form>
                </div>

                <p className="text-xs text-gray-500">
                  Chaque changement est ajouté à l&apos;historique des
                  limites.
                </p>
              </div>

              {/* Ajout repas */}
              <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5 space-y-4">
                <h2 className="font-semibold text-white">
                  Ajout repas{" "}
                  <span className="text-gray-400 font-normal text-sm">
                    (cumul par jour)
                  </span>
                </h2>

                <form onSubmit={handleAddEntry} className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={addDate}
                      onChange={(e) => setAddDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Calories (kcal)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={addCal}
                      onChange={(e) => setAddCal(e.target.value)}
                      placeholder="Ex: 650"
                      required
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Protéines (g){" "}
                      <span className="text-gray-600">— optionnel</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={addProt}
                      onChange={(e) => setAddProt(e.target.value)}
                      placeholder="Ex: 45"
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={addLoading}
                      className="flex-1 rounded-lg bg-green-500 hover:bg-green-600 disabled:bg-gray-600 px-4 py-2 text-sm font-semibold text-gray-900 transition"
                    >
                      {addLoading ? "…" : "Ajouter ce repas"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDate(addDate)}
                      className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition"
                    >
                      Supprimer la date
                    </button>
                  </div>
                </form>

                {addMsg && <p className="text-xs text-gray-400">{addMsg}</p>}
                <p className="text-xs text-gray-500">
                  Chaque ajout augmente le total de la date sélectionnée.
                </p>
              </div>
            </div>
          )}
        </div>
        </main>
      </div>
    </RequireAuth>
  );
}
