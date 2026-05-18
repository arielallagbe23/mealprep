"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";

type LimitRecord = { limitCalories: number; effectiveDate: string };
type CalorieData = {
  entries: Record<string, number>;
  dailyLimit: number;
  limitHistory: LimitRecord[];
};
type EditState = { dateKey: string; calories: string } | null;

const PAGE_SIZE = 6;
const TODAY = new Date().toISOString().split("T")[0];

function getLimitForDate(dateKey: string, history: LimitRecord[], defaultLimit: number): number {
  const sorted = [...history].sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  return sorted.find((h) => h.effectiveDate <= dateKey)?.limitCalories ?? defaultLimit;
}

function fmtDate(dateKey: string) {
  return new Date(dateKey + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function CalorieChart({ entries, limitHistory, dailyLimit }: Pick<CalorieData, "entries" | "limitHistory" | "dailyLimit">) {
  const days = useMemo(() => {
    const sorted = Object.keys(entries).sort();
    return sorted.slice(-30);
  }, [entries]);

  if (days.length === 0) return null;

  const W = 600;
  const H = 200;
  const PAD = { top: 16, right: 16, bottom: 40, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const values = days.map((d) => entries[d] ?? 0);
  const limits = days.map((d) => getLimitForDate(d, limitHistory, dailyLimit));
  const maxVal = Math.max(...values, ...limits, 500);
  const minVal = 0;

  const xOf = (i: number) => PAD.left + (i / Math.max(days.length - 1, 1)) * chartW;
  const yOf = (v: number) => PAD.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH;

  const calPath = days.map((d, i) => `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(entries[d] ?? 0)}`).join(" ");
  const limPath = days.map((d, i) => `${i === 0 ? "M" : "L"}${xOf(i)},${yOf(limits[i])}`).join(" ");

  const yTicks = [0, Math.round(maxVal / 2), maxVal];
  const xLabels = days.length <= 7
    ? days
    : days.filter((_, i) => i === 0 || i === days.length - 1 || i % Math.floor(days.length / 4) === 0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* Grid lines */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD.left} y1={yOf(v)} x2={W - PAD.right} y2={yOf(v)} stroke="#e5e7eb" strokeWidth="1" />
          <text x={PAD.left - 6} y={yOf(v) + 4} textAnchor="end" fontSize="10" fill="#9ca3af">{v}</text>
        </g>
      ))}
      {/* Limit line */}
      <path d={limPath} fill="none" stroke="#f97316" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* Calories line */}
      <path d={calPath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
      {/* Dots */}
      {days.map((d, i) => (
        <circle key={d} cx={xOf(i)} cy={yOf(entries[d] ?? 0)} r="3"
          fill={(entries[d] ?? 0) <= limits[i] ? "#3b82f6" : "#ef4444"} />
      ))}
      {/* X labels */}
      {xLabels.map((d) => {
        const i = days.indexOf(d);
        return (
          <text key={d} x={xOf(i)} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="9" fill="#6b7280">
            {d.slice(5)}
          </text>
        );
      })}
      {/* Legend */}
      <circle cx={PAD.left + 8} cy={H - 6} r="4" fill="#3b82f6" />
      <text x={PAD.left + 16} y={H - 2} fontSize="9" fill="#6b7280">Consommé</text>
      <line x1={PAD.left + 80} y1={H - 6} x2={PAD.left + 96} y2={H - 6} stroke="#f97316" strokeWidth="1.5" strokeDasharray="4 3" />
      <text x={PAD.left + 100} y={H - 2} fontSize="9" fill="#6b7280">Limite</text>
    </svg>
  );
}

export default function CalorieDashboard() {
  const [data, setData] = useState<CalorieData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  // Add entry form
  const [addDate, setAddDate] = useState(TODAY);
  const [addCal, setAddCal] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Inline edit
  const [editState, setEditState] = useState<EditState>(null);
  const [editMsg, setEditMsg] = useState("");

  // Limit form
  const [limitVal, setLimitVal] = useState("");
  const [limitDate, setLimitDate] = useState(TODAY);
  const [limitMsg, setLimitMsg] = useState("");
  const [limitLoading, setLimitLoading] = useState(false);

  async function loadData() {
    try {
      const res = await fetch("/api/calories", { credentials: "include", cache: "no-store" });
      if (res.status === 401) { setError("Connexion requise"); setLoading(false); return; }
      if (!res.ok) throw new Error();
      const d: CalorieData = await res.json();
      setData(d);
    } catch {
      setError("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const entries = data ? Object.entries(data.entries).sort(([a], [b]) => b.localeCompare(a)) : [];
  const totalPages = Math.ceil(entries.length / PAGE_SIZE);
  const pageEntries = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const todayCalories = data?.entries[TODAY] ?? 0;
  const limitToday = data ? getLimitForDate(TODAY, data.limitHistory, data.dailyLimit) : 2000;
  const remaining = limitToday - todayCalories;

  const daysTracked = entries.length;
  const daysRespected = data
    ? entries.filter(([dk, cal]) => cal <= getLimitForDate(dk, data.limitHistory, data.dailyLimit)).length
    : 0;
  const daysExceeded = daysTracked - daysRespected;

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    setAddMsg("");
    try {
      const res = await fetch("/api/calories/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dateKey: addDate, calories: Number(addCal) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      setAddMsg(`Ajouté. Total ${addDate} : ${json.calories} kcal`);
      setAddCal("");
      await loadData();
    } catch (err: unknown) {
      setAddMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleDelete(dateKey: string) {
    if (!confirm(`Supprimer l'entrée du ${fmtDate(dateKey)} ?`)) return;
    await fetch(`/api/calories/entry?dateKey=${dateKey}`, { method: "DELETE", credentials: "include" });
    await loadData();
    setPage(0);
  }

  async function handleEditSave(dateKey: string) {
    if (!editState) return;
    setEditMsg("");
    const newCalories = Number(editState.calories);
    if (!Number.isFinite(newCalories) || newCalories <= 0) { setEditMsg("Valeur invalide"); return; }
    const res = await fetch("/api/calories/entry", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ dateKey, newCalories }),
    });
    if (!res.ok) { setEditMsg("Erreur de sauvegarde"); return; }
    setEditState(null);
    await loadData();
  }

  async function handleLimitUpdate(e: React.FormEvent) {
    e.preventDefault();
    setLimitLoading(true);
    setLimitMsg("");
    try {
      const res = await fetch("/api/calories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ limitCalories: Number(limitVal), effectiveDate: limitDate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      setLimitMsg(`Limite mise à jour : ${json.dailyLimit} kcal à partir du ${fmtDate(limitDate)}`);
      setLimitVal("");
      await loadData();
    } catch (err: unknown) {
      setLimitMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLimitLoading(false);
    }
  }

  return (
    <RequireAuth>
      <main className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 py-8">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Comptage Calories</h1>
            <Link href="/accueil" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              ← Accueil
            </Link>
          </div>

          {loading && <p className="text-gray-500 dark:text-gray-400">Chargement…</p>}
          {error && <p className="text-red-500">{error}</p>}

          {data && (
            <>
              {/* Stats bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Aujourd'hui" value={`${todayCalories} kcal`}
                  sub={remaining >= 0 ? `${remaining} restantes` : `${Math.abs(remaining)} dépassées`}
                  accent={remaining >= 0 ? "blue" : "red"} />
                <StatCard label="Limite du jour" value={`${limitToday} kcal`} sub={`par défaut : ${data.dailyLimit}`} accent="orange" />
                <StatCard label="Jours suivis" value={String(daysTracked)} sub={`${daysRespected} respectés`} accent="green" />
                <StatCard label="Dépassements" value={String(daysExceeded)}
                  sub={daysTracked > 0 ? `${Math.round((daysExceeded / daysTracked) * 100)}% des jours` : "—"}
                  accent="red" />
              </div>

              {/* Chart */}
              {Object.keys(data.entries).length > 0 && (
                <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                    Évolution (30 derniers jours)
                  </p>
                  <CalorieChart entries={data.entries} limitHistory={data.limitHistory} dailyLimit={data.dailyLimit} />
                </div>
              )}

              {/* Add entry */}
              <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Ajouter un repas</p>
                <form onSubmit={handleAddEntry} className="flex flex-wrap gap-2 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Date</label>
                    <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)}
                      className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Calories (kcal)</label>
                    <input type="number" min="1" value={addCal} onChange={(e) => setAddCal(e.target.value)}
                      placeholder="Ex. 650" required
                      className="w-32 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100" />
                  </div>
                  <button type="submit" disabled={addLoading}
                    className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 px-4 py-2 text-sm font-semibold text-white transition">
                    {addLoading ? "…" : "Ajouter"}
                  </button>
                </form>
                {addMsg && <p className="text-xs text-gray-600 dark:text-gray-300">{addMsg}</p>}
              </div>

              {/* Entries table */}
              <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Historique ({entries.length} entrées)
                </p>
                {editMsg && <p className="text-xs text-red-500">{editMsg}</p>}
                {entries.length === 0
                  ? <p className="text-sm text-gray-400">Aucune entrée.</p>
                  : (
                    <>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                            <th className="pb-2 font-medium">Date</th>
                            <th className="pb-2 font-medium">Calories</th>
                            <th className="pb-2 font-medium">Limite</th>
                            <th className="pb-2 font-medium">Statut</th>
                            <th className="pb-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {pageEntries.map(([dk, cal]) => {
                            const lim = getLimitForDate(dk, data.limitHistory, data.dailyLimit);
                            const ok = cal <= lim;
                            const isEditing = editState?.dateKey === dk;
                            return (
                              <tr key={dk} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                                <td className="py-2 pr-4 text-gray-700 dark:text-gray-200">{fmtDate(dk)}</td>
                                <td className="py-2 pr-4">
                                  {isEditing ? (
                                    <input type="number" min="1" value={editState.calories}
                                      onChange={(e) => setEditState({ dateKey: dk, calories: e.target.value })}
                                      className="w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm"
                                      autoFocus />
                                  ) : (
                                    <span className={ok ? "text-gray-800 dark:text-gray-100" : "text-red-500 font-semibold"}>
                                      {cal} kcal
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 pr-4 text-gray-500 dark:text-gray-400">{lim} kcal</td>
                                <td className="py-2 pr-4">
                                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
                                    ok ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                       : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                  }`}>
                                    {ok ? "Respecté" : "Dépassé"}
                                  </span>
                                </td>
                                <td className="py-2 flex gap-2 justify-end">
                                  {isEditing ? (
                                    <>
                                      <button onClick={() => handleEditSave(dk)}
                                        className="text-xs text-green-600 hover:underline font-medium">Sauv.</button>
                                      <button onClick={() => { setEditState(null); setEditMsg(""); }}
                                        className="text-xs text-gray-400 hover:underline">Annuler</button>
                                    </>
                                  ) : (
                                    <>
                                      <button onClick={() => setEditState({ dateKey: dk, calories: String(cal) })}
                                        className="text-xs text-blue-500 hover:underline">Modifier</button>
                                      <button onClick={() => handleDelete(dk)}
                                        className="text-xs text-red-400 hover:underline">Suppr.</button>
                                    </>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="flex gap-2 items-center justify-center pt-2">
                          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                            className="px-3 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">
                            ←
                          </button>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {page + 1} / {totalPages}
                          </span>
                          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                            className="px-3 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700">
                            →
                          </button>
                        </div>
                      )}
                    </>
                  )}
              </div>

              {/* Daily limit update */}
              <div className="rounded-2xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Modifier la limite journalière
                </p>
                <form onSubmit={handleLimitUpdate} className="flex flex-wrap gap-2 items-end">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Nouvelle limite (kcal)</label>
                    <input type="number" min="1" value={limitVal} onChange={(e) => setLimitVal(e.target.value)}
                      placeholder={`Actuelle : ${data.dailyLimit}`} required
                      className="w-36 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Date d&apos;effet</label>
                    <input type="date" value={limitDate} onChange={(e) => setLimitDate(e.target.value)}
                      className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100" />
                  </div>
                  <button type="submit" disabled={limitLoading}
                    className="rounded-lg bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 px-4 py-2 text-sm font-semibold text-white transition">
                    {limitLoading ? "…" : "Mettre à jour"}
                  </button>
                </form>
                {limitMsg && <p className="text-xs text-gray-600 dark:text-gray-300">{limitMsg}</p>}

                {/* Limit history */}
                {data.limitHistory.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Historique des limites</p>
                    <div className="space-y-1">
                      {[...data.limitHistory]
                        .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))
                        .map((h) => (
                          <div key={h.effectiveDate} className="flex justify-between text-xs text-gray-600 dark:text-gray-300">
                            <span>{fmtDate(h.effectiveDate)}</span>
                            <span className="font-semibold">{h.limitCalories} kcal</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </RequireAuth>
  );
}

function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub: string;
  accent: "blue" | "red" | "green" | "orange";
}) {
  const colors = {
    blue: "text-blue-600 dark:text-blue-400",
    red: "text-red-500 dark:text-red-400",
    green: "text-green-600 dark:text-green-400",
    orange: "text-orange-500 dark:text-orange-400",
  };
  return (
    <div className="rounded-xl bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 p-3 space-y-1">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-lg font-bold ${colors[accent]}`}>{value}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>
    </div>
  );
}
