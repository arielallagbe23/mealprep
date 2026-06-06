"use client";

import { useEffect, useState, useMemo, type FormEvent } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/components/useAuth";
import Calendar from "@/app/comptage-calories/Calendar";

// ─── Types ───────────────────────────────────────────────────────────────────

type LimitRecord = { limitCalories: number; effectiveDate: string };
type DayEntry = { calories: number; proteines: number };
type CalorieData = {
  entries: Record<string, DayEntry>;
  dailyLimit: number;
  limitHistory: LimitRecord[];
  dailyProteinGoal: number;
};
type EditState = {
  dateKey: string;
  calories: string;
  proteines: string;
} | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split("T")[0];
const PAGE_SIZE = 7;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLimitForDate(
  dateKey: string,
  history: LimitRecord[],
  def: number,
): number {
  const sorted = [...history].sort((a, b) =>
    b.effectiveDate.localeCompare(a.effectiveDate),
  );
  return sorted.find((h) => h.effectiveDate <= dateKey)?.limitCalories ?? def;
}

function fmtDate(dateKey: string) {
  const [y, m, d] = dateKey.split("-");
  return `${d}/${m}/${y}`;
}

function fmtDateLong(dateKey: string) {
  return new Date(dateKey + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const t = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * t;
    const cp1y = p1.y + (p2.y - p0.y) * t;
    const cp2x = p2.x - (p3.x - p1.x) * t;
    const cp2y = p2.y - (p3.y - p1.y) * t;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x},${p2.y}`;
  }
  return d;
}

// ─── Chart ───────────────────────────────────────────────────────────────────

function EvolutionChart({
  days,
  values,
  limits,
  lineColor,
  limitColor,
  lineLabel,
  limitLabel,
}: {
  days: string[];
  values: number[];
  limits: number[];
  lineColor: string;
  limitColor: string;
  lineLabel: string;
  limitLabel: string;
}) {
  if (days.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">
        Aucune donnée à afficher
      </p>
    );
  }

  const W = 600;
  const H = 200;
  const PAD = { top: 16, right: 16, bottom: 44, left: 52 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const hasLimit = limits.some((l) => l > 0);
  const maxVal = Math.max(...values, ...(hasLimit ? limits : []), 1);
  const xOf = (i: number) =>
    PAD.left + (i / Math.max(days.length - 1, 1)) * chartW;
  const yOf = (v: number) => PAD.top + chartH * (1 - v / maxVal);

  const valPts = days.map((_, i) => ({ x: xOf(i), y: yOf(values[i]) }));
  const valPath = smoothPath(valPts);
  const limPath = hasLimit
    ? days
        .map(
          (_, i) =>
            `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(limits[i]).toFixed(1)}`,
        )
        .join(" ")
    : "";

  const step = Math.ceil(maxVal / 4);
  const yTicks = [0, step, step * 2, step * 3, maxVal].filter(
    (v, i, a) => a.indexOf(v) === i,
  );

  const xLabels =
    days.length <= 6
      ? days
      : [
          days[0],
          ...days.filter(
            (_, i) =>
              i > 0 &&
              i < days.length - 1 &&
              i % Math.ceil(days.length / 4) === 0,
          ),
          days[days.length - 1],
        ].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {yTicks.map((v) => (
        <g key={v}>
          <line
            x1={PAD.left}
            y1={yOf(v)}
            x2={W - PAD.right}
            y2={yOf(v)}
            stroke="#374151"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          <text
            x={PAD.left - 6}
            y={yOf(v) + 4}
            textAnchor="end"
            fontSize="11"
            fill="#6b7280"
          >
            {v}
          </text>
        </g>
      ))}
      {hasLimit && (
        <path d={limPath} fill="none" stroke={limitColor} strokeWidth="2" />
      )}
      <path
        d={valPath}
        fill="none"
        stroke={lineColor}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {days.map((_, i) => (
        <circle
          key={i}
          cx={xOf(i)}
          cy={yOf(values[i])}
          r="3.5"
          fill={lineColor}
        />
      ))}
      {xLabels.map((d) => {
        const i = days.indexOf(d);
        return (
          <text
            key={d}
            x={xOf(i)}
            y={H - PAD.bottom + 16}
            textAnchor="middle"
            fontSize="9"
            fill="#6b7280"
          >
            {fmtDate(d)}
          </text>
        );
      })}
      {hasLimit && (
        <>
          <circle cx={PAD.left + 6} cy={H - 8} r="4" fill={limitColor} />
          <text x={PAD.left + 14} y={H - 4} fontSize="9" fill="#9ca3af">
            {limitLabel}
          </text>
        </>
      )}
      <circle
        cx={hasLimit ? PAD.left + 190 : PAD.left + 6}
        cy={H - 8}
        r="4"
        fill={lineColor}
      />
      <text
        x={hasLimit ? PAD.left + 198 : PAD.left + 14}
        y={H - 4}
        fontSize="9"
        fill="#9ca3af"
      >
        {lineLabel}
      </text>
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CalorieDashboard() {
  const { user } = useAuth();

  const [data, setData] = useState<CalorieData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  // Add entry form
  const [addDate, setAddDate] = useState(TODAY);
  const [addCal, setAddCal] = useState("");
  const [addProt, setAddProt] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Edit state
  const [editState, setEditState] = useState<EditState>(null);
  const [editMsg, setEditMsg] = useState("");

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

  // ── Derived data ───────────────────────────────────────────────────────────

  const entries = useMemo(
    () =>
      data
        ? Object.entries(data.entries).sort(([a], [b]) => b.localeCompare(a))
        : [],
    [data],
  );

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const pageEntries = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const todayEntry = data?.entries[TODAY] ?? { calories: 0, proteines: 0 };
  const limitToday = data
    ? getLimitForDate(TODAY, data.limitHistory, data.dailyLimit)
    : 2000;
  const protGoal = data?.dailyProteinGoal ?? 0;

  const calRemaining = limitToday - todayEntry.calories;
  const protRemaining = protGoal > 0 ? protGoal - todayEntry.proteines : null;

  const daysTracked = entries.length;
  const daysCalOk = data
    ? entries.filter(
        ([dk, e]) =>
          e.calories <= getLimitForDate(dk, data.limitHistory, data.dailyLimit),
      ).length
    : 0;
  const daysProtOk =
    data && protGoal > 0
      ? entries.filter(([, e]) => e.proteines >= protGoal).length
      : null;

  // Chart data (last 30 days)
  const chartDays = useMemo(
    () =>
      Object.keys(data?.entries ?? {})
        .sort()
        .slice(-30),
    [data],
  );
  const calValues = chartDays.map((d) => data?.entries[d]?.calories ?? 0);
  const calLimits = chartDays.map((d) =>
    data ? getLimitForDate(d, data.limitHistory, data.dailyLimit) : 2000,
  );
  const protValues = chartDays.map((d) => data?.entries[d]?.proteines ?? 0);
  const protLimits = chartDays.map(() => data?.dailyProteinGoal ?? 0);

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
    setPage(0);
  }

  async function handleEditSave(dateKey: string) {
    if (!editState) return;
    setEditMsg("");
    const newCalories = Number(editState.calories);
    const newProteines =
      editState.proteines.trim() !== ""
        ? Number(editState.proteines)
        : undefined;

    if (!Number.isFinite(newCalories) || newCalories <= 0) {
      setEditMsg("Calories invalides");
      return;
    }

    const res = await fetch("/api/calories/entry", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ dateKey, newCalories, newProteines }),
    });
    if (!res.ok) {
      setEditMsg("Erreur de sauvegarde");
      return;
    }
    setEditState(null);
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
      <main className="min-h-screen bg-gray-900 px-4 py-8 text-white">
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Header */}
          <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-green-400 mb-1">
              Suivi Calories & Protéines
            </p>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Comptage simple, jour après jour
                </h1>
                <p className="text-sm text-gray-400 mt-1">
                  Date du jour :{" "}
                  <span className="font-semibold text-white">
                    {fmtDateLong(TODAY)}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                {user?.email && (
                  <span className="text-sm text-gray-300">{user.email}</span>
                )}
                <Link
                  href="/accueil"
                  className="rounded-lg border border-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 transition"
                >
                  ← Accueil
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
            <>
              {/* ── Objectives row ── */}
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

              {/* ── Today + Global stats ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Aujourd'hui */}
                <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5 space-y-3">
                  <h2 className="font-semibold text-white">Aujourd&apos;hui</h2>

                  {/* Calories */}
                  <div>
                    <p className="text-3xl font-bold text-white">
                      {todayEntry.calories}{" "}
                      <span className="text-lg font-normal text-gray-400">
                        kcal
                      </span>
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      Limite du jour : {limitToday} kcal
                    </p>
                    {calRemaining >= 0 ? (
                      <p className="text-sm font-semibold text-green-400">
                        {calRemaining} kcal restantes avant la limite
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-red-400">
                        {Math.abs(calRemaining)} kcal au-dessus de la limite
                      </p>
                    )}
                  </div>

                  {/* Protéines */}
                  {protGoal > 0 && (
                    <div className="border-t border-gray-700 pt-3">
                      <p className="text-2xl font-bold text-white">
                        {todayEntry.proteines}{" "}
                        <span className="text-base font-normal text-gray-400">
                          g prot.
                        </span>
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        Objectif : {protGoal} g
                      </p>
                      {protRemaining !== null && protRemaining > 0 ? (
                        <p className="text-sm font-semibold text-blue-400">
                          {protRemaining} g restants avant l&apos;objectif
                        </p>
                      ) : protRemaining !== null && protRemaining <= 0 ? (
                        <p className="text-sm font-semibold text-green-400">
                          Objectif protéines atteint ✓
                        </p>
                      ) : null}

                      {/* Progress bar */}
                      <div className="mt-2 h-1.5 rounded-full bg-gray-700 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-400 transition-all"
                          style={{
                            width: `${Math.min(100, (todayEntry.proteines / protGoal) * 100).toFixed(1)}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {data.entries[TODAY] ? (
                    <p className="text-xs text-gray-500">
                      Ligne du jour : enregistrée ({fmtDateLong(TODAY)})
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500">
                      Aucune entrée pour aujourd&apos;hui
                    </p>
                  )}
                </div>

                {/* Bilan global */}
                <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5 space-y-3">
                  <h2 className="font-semibold text-white">Bilan global</h2>

                  <div className="space-y-1">
                    <p className="text-sm text-gray-300">
                      <span className="text-green-400 font-semibold">
                        Jours respectés (cal.) :
                      </span>{" "}
                      {daysCalOk}
                    </p>
                    <p className="text-sm text-gray-300">
                      <span className="text-red-400 font-semibold">
                        Jours dépassés (cal.) :
                      </span>{" "}
                      {daysTracked - daysCalOk}
                    </p>
                  </div>

                  {daysProtOk !== null && (
                    <div className="border-t border-gray-700 pt-3 space-y-1">
                      <p className="text-sm text-gray-300">
                        <span className="text-green-400 font-semibold">
                          Objectif prot. atteint :
                        </span>{" "}
                        {daysProtOk} jours
                      </p>
                      <p className="text-sm text-gray-300">
                        <span className="text-blue-400 font-semibold">
                          Objectif prot. non atteint :
                        </span>{" "}
                        {daysTracked - daysProtOk} jours
                      </p>
                    </div>
                  )}

                  <div className="border-t border-gray-700 pt-3">
                    <p className="text-sm text-gray-300">
                      Nombre de jours suivis :{" "}
                      <span className="font-semibold text-white">
                        {daysTracked}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Calendrier ── */}
              <Calendar
                entries={data.entries}
                limitHistory={data.limitHistory}
                dailyLimit={data.dailyLimit}
                dailyProteinGoal={data.dailyProteinGoal}
              />

              {/* ── Calorie chart ── */}
              {chartDays.length > 0 && (
                <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5">
                  <h2 className="font-semibold text-white mb-4">
                    Évolution calories
                  </h2>
                  <EvolutionChart
                    days={chartDays}
                    values={calValues}
                    limits={calLimits}
                    lineColor="#f97316"
                    limitColor="#4ade80"
                    lineLabel="Calories consommées"
                    limitLabel="Limite du jour (historique)"
                  />
                </div>
              )}

              {/* ── Protein chart ── */}
              {chartDays.length > 0 && (
                <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5">
                  <h2 className="font-semibold text-white mb-4">
                    Évolution protéines
                  </h2>
                  <EvolutionChart
                    days={chartDays}
                    values={protValues}
                    limits={protLimits}
                    lineColor="#60a5fa"
                    limitColor="#a78bfa"
                    lineLabel="Protéines consommées"
                    limitLabel="Objectif protéines"
                  />
                </div>
              )}

              {/* ── Historique des limites ── */}
              {data.limitHistory.length > 0 && (
                <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5">
                  <h2 className="font-semibold text-white mb-3">
                    Historique des limites
                  </h2>
                  <div className="space-y-1.5">
                    {[...data.limitHistory]
                      .sort((a, b) =>
                        b.effectiveDate.localeCompare(a.effectiveDate),
                      )
                      .map((h) => (
                        <div
                          key={h.effectiveDate}
                          className="flex justify-between text-sm text-gray-300"
                        >
                          <span>{fmtDateLong(h.effectiveDate)}</span>
                          <span className="font-semibold text-white">
                            {h.limitCalories} kcal
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* ── Table ── */}
              <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5">
                <h2 className="font-semibold text-white mb-4">
                  Table calories
                  {entries.length > 0 && (
                    <span className="text-gray-400 font-normal text-sm ml-2">
                      ({entries.length} entrées)
                    </span>
                  )}
                </h2>

                {editMsg && (
                  <p className="text-xs text-red-400 mb-2">{editMsg}</p>
                )}

                {entries.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Aucune entrée pour l&apos;instant.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-700">
                            <th className="pb-3 pr-3 font-medium">Date</th>
                            <th className="pb-3 pr-3 font-medium">Calories</th>
                            <th className="pb-3 pr-3 font-medium">Limite</th>
                            <th className="pb-3 pr-3 font-medium">Protéines</th>
                            <th className="pb-3 pr-3 font-medium">Statut</th>
                            <th className="pb-3 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                          {pageEntries.map(([dk, entry]) => {
                            const lim = getLimitForDate(
                              dk,
                              data.limitHistory,
                              data.dailyLimit,
                            );
                            const calOk = entry.calories <= lim;
                            const protOk =
                              protGoal > 0 ? entry.proteines >= protGoal : null;
                            const isEditing = editState?.dateKey === dk;
                            return (
                              <tr
                                key={dk}
                                className="hover:bg-gray-750 transition"
                              >
                                <td className="py-3 pr-3 text-gray-200 font-medium">
                                  {fmtDateLong(dk)}
                                </td>
                                <td className="py-3 pr-3">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      min="1"
                                      value={editState.calories}
                                      onChange={(e) =>
                                        setEditState({
                                          ...editState,
                                          calories: e.target.value,
                                        })
                                      }
                                      className="w-20 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-white"
                                      autoFocus
                                    />
                                  ) : (
                                    <span
                                      className={
                                        calOk
                                          ? "text-white"
                                          : "text-red-400 font-semibold"
                                      }
                                    >
                                      {entry.calories} kcal
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 pr-3 text-gray-400">
                                  {lim} kcal
                                </td>
                                <td className="py-3 pr-3">
                                  {isEditing ? (
                                    <input
                                      type="number"
                                      min="0"
                                      value={editState.proteines}
                                      onChange={(e) =>
                                        setEditState({
                                          ...editState,
                                          proteines: e.target.value,
                                        })
                                      }
                                      className="w-16 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-white"
                                    />
                                  ) : (
                                    <span
                                      className={
                                        protOk === true
                                          ? "text-green-400 font-semibold"
                                          : protOk === false
                                            ? "text-blue-300"
                                            : "text-gray-400"
                                      }
                                    >
                                      {entry.proteines > 0
                                        ? `${entry.proteines} g`
                                        : "—"}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 pr-3">
                                  <div className="flex flex-col gap-1">
                                    <span
                                      className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                                        calOk
                                          ? "bg-green-900/50 text-green-400 border border-green-800"
                                          : "bg-orange-900/50 text-orange-400 border border-orange-800"
                                      }`}
                                    >
                                      {calOk
                                        ? "Sous la limite du jour"
                                        : "Au-dessus de la limite"}
                                    </span>
                                    {protOk !== null && (
                                      <span
                                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                                          protOk
                                            ? "bg-green-900/50 text-green-400 border border-green-800"
                                            : "bg-blue-900/50 text-blue-400 border border-blue-800"
                                        }`}
                                      >
                                        {protOk
                                          ? "Objectif prot. atteint"
                                          : "Prot. insuffisantes"}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3">
                                  {isEditing ? (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleEditSave(dk)}
                                        className="rounded px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white"
                                      >
                                        Sauvegarder
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditState(null);
                                          setEditMsg("");
                                        }}
                                        className="rounded px-3 py-1.5 text-xs border border-gray-600 text-gray-300 hover:bg-gray-700"
                                      >
                                        Annuler
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() =>
                                          setEditState({
                                            dateKey: dk,
                                            calories: String(entry.calories),
                                            proteines:
                                              entry.proteines > 0
                                                ? String(entry.proteines)
                                                : "",
                                          })
                                        }
                                        className="rounded px-3 py-1.5 text-xs font-semibold border border-gray-600 text-gray-200 hover:bg-gray-700 transition"
                                      >
                                        Modifier
                                      </button>
                                      <button
                                        onClick={() => handleDeleteDate(dk)}
                                        className="rounded px-3 py-1.5 text-xs font-semibold border border-gray-600 text-gray-200 hover:bg-gray-700 transition"
                                      >
                                        Supprimer
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-4 border-t border-gray-700 mt-4">
                        <span className="text-xs text-gray-500">
                          Page {page + 1} / {totalPages}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="px-3 py-1.5 text-xs rounded-lg border border-gray-600 disabled:opacity-40 hover:bg-gray-700 transition"
                          >
                            ←
                          </button>
                          <button
                            onClick={() =>
                              setPage((p) => Math.min(totalPages - 1, p + 1))
                            }
                            disabled={page >= totalPages - 1}
                            className="px-3 py-1.5 text-xs rounded-lg border border-gray-600 disabled:opacity-40 hover:bg-gray-700 transition"
                          >
                            →
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </RequireAuth>
  );
}
