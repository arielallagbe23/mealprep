"use client";
import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import { DAY_MEAL_SLOTS, type DayMealKey } from "@/app/composer/constants";

type MealItem = {
  nom: string;
  caloriesPer100g: number;
  proteinesPer100g?: number;
  gramsPerPortion: number;
};

type Meal = {
  id: string;
  name: string;
  mealType?: DayMealKey | null;
  items?: MealItem[];
};

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type MealCell = { mealId: string; portions?: number };
type Cell = MealCell | { cheat: true } | undefined;
type PlanDays = Partial<Record<DayKey, Partial<Record<DayMealKey, Cell>>>>;

const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<DayKey, string> = {
  mon: "Lundi", tue: "Mardi", wed: "Mercredi", thu: "Jeudi",
  fri: "Vendredi", sat: "Samedi", sun: "Dimanche",
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function calcMeal(meal: Meal, portions = 1) {
  const items = meal.items ?? [];
  const kcal = Math.round(items.reduce((s, it) => s + (it.gramsPerPortion / 100) * it.caloriesPer100g, 0) * portions);
  const prot = r1(items.reduce((s, it) => s + (it.gramsPerPortion / 100) * (it.proteinesPer100g ?? 0), 0) * portions);
  return { kcal, prot };
}

function toISO(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function getMonday(d: Date) {
  const day = d.getDay(); // 0=dim..6=sam
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday;
}

function addDays(dateISO: string, n: number) {
  const d = new Date(dateISO + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toISO(d);
}

function fmtDateShort(dateISO: string) {
  return new Date(dateISO + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function todayDayKey(): DayKey {
  const idx = (new Date().getDay() + 6) % 7; // 0=lundi..6=dimanche
  return DAY_KEYS[idx];
}

export default function PlanningPage() {
  const [weekStart, setWeekStart] = useState(() => toISO(getMonday(new Date())));
  const [meals, setMeals] = useState<Meal[]>([]);
  const [activeSlotKeys, setActiveSlotKeys] = useState<DayMealKey[]>(DAY_MEAL_SLOTS.map((s) => s.key));
  const [dailyLimit, setDailyLimit] = useState(0);
  const [proteinGoal, setProteinGoal] = useState(0);
  const [plan, setPlan] = useState<PlanDays>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const [rMeals, rCal, rPlan] = await Promise.all([
          fetch("/api/meals", { credentials: "include" }),
          fetch("/api/calories", { credentials: "include" }),
          fetch(`/api/weekly-plan?week=${weekStart}`, { credentials: "include" }),
        ]);
        const dMeals = await rMeals.json();
        if (!rMeals.ok) throw new Error(dMeals?.error || "Erreur de chargement des repas");
        if (!alive) return;
        setMeals(Array.isArray(dMeals) ? dMeals : []);

        const dCal = await rCal.json();
        if (rCal.ok) {
          setDailyLimit(dCal.dailyLimit ?? 0);
          setProteinGoal(dCal.dailyProteinGoal ?? 0);
          if (Array.isArray(dCal.activeMealSlots) && dCal.activeMealSlots.length > 0) {
            setActiveSlotKeys(
              DAY_MEAL_SLOTS.map((s) => s.key).filter((k) => dCal.activeMealSlots.includes(k))
            );
          }
        }

        const dPlan = await rPlan.json();
        if (rPlan.ok) setPlan(dPlan.days ?? {});
      } catch (e: any) {
        if (alive) setErr(e.message || "Erreur");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [weekStart]);

  const mealsById = useMemo(() => {
    const m: Record<string, Meal> = {};
    for (const meal of meals) m[meal.id] = meal;
    return m;
  }, [meals]);

  const mealsBySlot = useMemo(() => {
    const grouped: Partial<Record<DayMealKey, Meal[]>> = {};
    for (const slot of DAY_MEAL_SLOTS) {
      grouped[slot.key] = meals.filter((m) => m.mealType === slot.key);
    }
    return grouped;
  }, [meals]);

  async function persist(nextPlan: PlanDays) {
    setPlan(nextPlan);
    setSaving(true);
    try {
      await fetch("/api/weekly-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ week: weekStart, days: nextPlan }),
      });
    } catch {
      // best-effort : le plan reste modifiable, une prochaine sauvegarde réessaiera
    } finally {
      setSaving(false);
    }
  }

  function setCell(day: DayKey, slot: DayMealKey, cell: Cell) {
    const next: PlanDays = { ...plan, [day]: { ...plan[day], [slot]: cell } };
    persist(next);
  }

  // Propose un menu complet pour la semaine : pioche un repas au hasard pour
  // chaque créneau actif, puis réajuste directement chaque jour sur
  // l'objectif calories de l'user — un seul bouton pour les deux étapes.
  // Les cheat meals sont préservés (choix délibéré, pas un tirage), tout le
  // reste est régénéré à chaque clic — libre à toi de retoucher ensuite ce
  // qui ne te plaît pas via les menus déroulants.
  function randomFillWeek() {
    const hasExisting = DAY_KEYS.some((day) =>
      activeSlotKeys.some((slotKey) => {
        const cell = plan[day]?.[slotKey];
        return cell && "mealId" in cell;
      })
    );
    if (hasExisting && !confirm("Générer un nouveau menu aléatoire ? Les repas déjà choisis (hors cheat meals) seront remplacés.")) {
      return;
    }

    const next: PlanDays = { ...plan };
    for (const day of DAY_KEYS) {
      const dayPlan = { ...(next[day] ?? {}) };
      for (const slotKey of activeSlotKeys) {
        const cell = dayPlan[slotKey];
        if (cell && "cheat" in cell) continue; // on ne retire jamais un cheat meal choisi
        const pool = mealsBySlot[slotKey]?.length ? mealsBySlot[slotKey]! : meals;
        if (!pool || pool.length === 0) continue;
        const pick = pool[Math.floor(Math.random() * pool.length)];
        dayPlan[slotKey] = { mealId: pick.id };
      }
      next[day] = reajustedDayPlan(dayPlan);
    }
    persist(next);
  }

  function clearWeek() {
    if (!confirm("Effacer toute la semaine ?")) return;
    persist({});
  }

  // Complète le % manquant pour atteindre l'objectif calories du jour, en
  // appliquant ce facteur aux repas déjà planifiés ce jour-là (même logique
  // que le "Réajustement" sur Mes repas). Fonction pure : ne modifie rien,
  // renvoie le plan du jour ajusté (ou celui d'origine si rien à faire).
  function reajustedDayPlan(dayPlan: Partial<Record<DayMealKey, Cell>>) {
    let dayKcal = 0;
    const mealCells: { slotKey: DayMealKey; cell: MealCell }[] = [];
    for (const slotKey of activeSlotKeys) {
      const cell = dayPlan[slotKey];
      if (cell && "mealId" in cell) {
        const meal = mealsById[cell.mealId];
        if (meal) {
          dayKcal += calcMeal(meal, cell.portions ?? 1).kcal;
          mealCells.push({ slotKey, cell });
        }
      }
    }
    if (dailyLimit <= 0 || dayKcal <= 0 || mealCells.length === 0) return dayPlan;
    const scale = dailyLimit / dayKcal;

    const next = { ...dayPlan };
    for (const { slotKey, cell } of mealCells) {
      next[slotKey] = { mealId: cell.mealId, portions: r2((cell.portions ?? 1) * scale) };
    }
    return next;
  }

  const shoppingListHref = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const day of DAY_KEYS) {
      const dayPlan = plan[day];
      if (!dayPlan) continue;
      for (const slotKey of activeSlotKeys) {
        const cell = dayPlan[slotKey];
        if (cell && "mealId" in cell) counts[cell.mealId] = r2((counts[cell.mealId] ?? 0) + (cell.portions ?? 1));
      }
    }
    const ids = Object.keys(counts);
    if (ids.length === 0) return null;
    const params = new URLSearchParams();
    params.set("ids", ids.join(","));
    params.set("mode", "shop");
    for (const id of ids) params.set(`p_${id}`, String(counts[id]));
    return `/shopping?${params.toString()}`;
  }, [plan, activeSlotKeys]);

  // Repas uniques de la semaine, avec accès direct à leur recette (ingrédients).
  const weekMealsList = useMemo(() => {
    const ids = new Set<string>();
    for (const day of DAY_KEYS) {
      const dayPlan = plan[day];
      if (!dayPlan) continue;
      for (const slotKey of activeSlotKeys) {
        const cell = dayPlan[slotKey];
        if (cell && "mealId" in cell) ids.add(cell.mealId);
      }
    }
    return Array.from(ids)
      .map((id) => mealsById[id])
      .filter((m): m is Meal => !!m)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [plan, activeSlotKeys, mealsById]);

  async function handleSaveWeek() {
    setSaveMsg(null);
    await persist(plan);
    setSaveMsg("✅ Semaine enregistrée");
  }

  const weekLabel = `${fmtDateShort(weekStart)} → ${fmtDateShort(addDays(weekStart, 6))}`;

  // Récap du jour : les repas d'aujourd'hui avec les quantités déjà
  // réajustées (ingrédients recalculés), pour ne pas avoir à cliquer sur
  // la recette. Affiché seulement quand la semaine consultée contient
  // aujourd'hui.
  const todayInfo = useMemo(() => {
    const todayISO = toISO(new Date());
    const weekEndISO = addDays(weekStart, 6);
    if (todayISO < weekStart || todayISO > weekEndISO) return null;

    const day = todayDayKey();
    const dayPlan = plan[day] ?? {};
    const rows = activeSlotKeys.map((slotKey) => {
      const slotLabel = DAY_MEAL_SLOTS.find((s) => s.key === slotKey)?.label ?? slotKey;
      const cell = dayPlan[slotKey];
      if (!cell) return { slotKey, slotLabel, kind: "empty" as const };
      if ("cheat" in cell) return { slotKey, slotLabel, kind: "cheat" as const };
      const meal = mealsById[cell.mealId];
      if (!meal) return { slotKey, slotLabel, kind: "empty" as const };
      const portions = cell.portions ?? 1;
      const { kcal, prot } = calcMeal(meal, portions);
      const ingredients = (meal.items ?? []).map((it) => ({
        nom: it.nom,
        grams: Math.round(it.gramsPerPortion * portions),
      }));
      return { slotKey, slotLabel, kind: "meal" as const, meal, kcal, prot, ingredients };
    });
    const totalKcal = rows.reduce((s, r) => s + (r.kind === "meal" ? r.kcal : 0), 0);
    const totalProt = r1(rows.reduce((s, r) => s + (r.kind === "meal" ? r.prot : 0), 0));
    return { dayLabel: DAY_LABELS[day], dateISO: todayISO, rows, totalKcal, totalProt };
  }, [weekStart, plan, activeSlotKeys, mealsById]);

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-900 text-white flex flex-col md:flex-row">
        <Sidebar />
        <main className="flex-1 px-4 py-6 pb-16">
          <div className="max-w-3xl mx-auto w-full space-y-5">
            <div>
              <h1 className="text-2xl font-bold mb-1">📅 Planifier ma semaine</h1>
              <p className="text-gray-400 text-sm">
                Affecte un repas existant à chaque créneau, ou marque-le "cheat meal".
              </p>
            </div>

            {/* Navigation semaine */}
            <div className="flex items-center justify-between rounded-xl bg-gray-800 border border-gray-700 px-4 py-3">
              <button
                type="button"
                onClick={() => setWeekStart((w) => addDays(w, -7))}
                className="w-9 h-9 rounded-lg bg-gray-900 border border-gray-700 hover:border-gray-600 flex items-center justify-center"
              >←</button>
              <span className="font-semibold text-sm">{weekLabel}</span>
              <button
                type="button"
                onClick={() => setWeekStart((w) => addDays(w, 7))}
                className="w-9 h-9 rounded-lg bg-gray-900 border border-gray-700 hover:border-gray-600 flex items-center justify-center"
              >→</button>
            </div>

            {/* Récap du jour */}
            {todayInfo && (
              <div className="rounded-2xl bg-linear-to-br from-emerald-950/40 via-gray-900 to-gray-900 border border-emerald-800/50 p-5 space-y-4 shadow-lg shadow-emerald-950/20">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Aujourd&apos;hui</p>
                    <h2 className="text-lg font-bold text-white">{todayInfo.dayLabel} {fmtDateShort(todayInfo.dateISO)}</h2>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <div className="inline-block rounded-full bg-emerald-500/15 border border-emerald-600/40 px-3 py-1 text-sm font-semibold text-emerald-300">
                      {todayInfo.totalKcal} kcal{dailyLimit > 0 ? ` / ${dailyLimit}` : ""}
                    </div>
                    <div className="text-xs text-gray-400">
                      {todayInfo.totalProt}g prot{proteinGoal > 0 ? ` / ${proteinGoal}g` : ""}
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {todayInfo.rows.map((row) => (
                    <div key={row.slotKey} className="rounded-xl bg-white/5 border border-white/10 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-gray-200 min-w-0 flex-1">
                          {row.slotLabel}
                        </span>
                        {row.kind === "meal" && (
                          <span className="text-xs text-emerald-300/90 font-medium whitespace-nowrap shrink-0 pt-0.5">{row.kcal} kcal · {row.prot}g prot</span>
                        )}
                      </div>
                      {row.kind === "meal" && (
                        <>
                          <p className="text-sm text-white mt-0.5">{row.meal.name}</p>
                          {row.ingredients.length > 0 && (
                            <ul className="mt-2 flex flex-wrap gap-1.5">
                              {row.ingredients.map((ing, i) => (
                                <li
                                  key={i}
                                  className="text-xs bg-gray-950/60 border border-gray-700/70 rounded-full px-2.5 py-1 text-gray-300"
                                >
                                  {ing.nom} <span className="text-gray-500">·</span> {ing.grams}g
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                      {row.kind === "cheat" && (
                        <p className="text-sm text-orange-300 mt-0.5">🎉 Cheat meal</p>
                      )}
                      {row.kind === "empty" && (
                        <p className="text-sm text-gray-500 italic mt-0.5">Aucun repas assigné</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={randomFillWeek}
                disabled={loading || meals.length === 0}
                title={dailyLimit <= 0 ? "Définis un objectif calories dans Info user pour un réajustement automatique" : undefined}
                className="py-3 rounded-xl font-semibold text-white bg-purple-600 hover:bg-purple-700 transition disabled:opacity-50"
              >
                🎲 Proposer un menu aléatoire{dailyLimit > 0 ? " (ajusté à ton objectif)" : ""}
              </button>
              <button
                type="button"
                onClick={clearWeek}
                disabled={loading}
                className="py-3 rounded-xl font-semibold text-gray-300 bg-gray-800 border border-gray-700 hover:bg-gray-700 transition disabled:opacity-50"
              >
                🧹 Effacer la semaine
              </button>
            </div>

            {shoppingListHref && (
              <a
                href={shoppingListHref}
                className="block text-center py-3 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition"
              >
                🛒 Générer la liste de courses de la semaine
              </a>
            )}

            {loading && <p className="text-gray-400 text-center py-6">Chargement…</p>}
            {err && <p className="text-rose-400">{err}</p>}

            {!loading && !err && (
              <div className="space-y-4">
                {DAY_KEYS.map((day) => {
                  const dayISO = addDays(weekStart, DAY_KEYS.indexOf(day));
                  const dayPlan = plan[day] ?? {};
                  let dayKcal = 0, dayProt = 0, cheatCount = 0;
                  for (const slotKey of activeSlotKeys) {
                    const cell = dayPlan[slotKey];
                    if (cell && "mealId" in cell) {
                      const meal = mealsById[cell.mealId];
                      if (meal) {
                        const { kcal, prot } = calcMeal(meal, cell.portions ?? 1);
                        dayKcal += kcal; dayProt += prot;
                      }
                    } else if (cell && "cheat" in cell) {
                      cheatCount += 1;
                    }
                  }
                  dayProt = r1(dayProt);

                  return (
                    <div key={day} className="rounded-xl bg-gray-800 border border-gray-700 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h2 className="font-semibold">{DAY_LABELS[day]}</h2>
                          <p className="text-xs text-gray-500">{fmtDateShort(dayISO)}</p>
                        </div>
                        <div className="text-right text-xs text-gray-400">
                          <div>{dayKcal} kcal{dailyLimit > 0 ? ` / ${dailyLimit}` : ""}</div>
                          <div>{dayProt}g prot{proteinGoal > 0 ? ` / ${proteinGoal}g` : ""}</div>
                          {cheatCount > 0 && (
                            <div className="text-orange-400 font-medium">🎉 {cheatCount} cheat meal{cheatCount > 1 ? "s" : ""}</div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {activeSlotKeys.map((slotKey) => {
                          const slotLabel = DAY_MEAL_SLOTS.find((s) => s.key === slotKey)?.label ?? slotKey;
                          const cell = dayPlan[slotKey];
                          const selectedValue = cell
                            ? ("cheat" in cell ? "__cheat__" : cell.mealId)
                            : "";
                          const options = mealsBySlot[slotKey]?.length ? mealsBySlot[slotKey]! : meals;

                          return (
                            <div key={slotKey} className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-32 shrink-0">{slotLabel}</span>
                              <select
                                value={selectedValue}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v === "") setCell(day, slotKey, undefined);
                                  else if (v === "__cheat__") setCell(day, slotKey, { cheat: true });
                                  else setCell(day, slotKey, { mealId: v });
                                }}
                                className={`flex-1 min-w-0 rounded-lg border px-2 py-1.5 text-sm ${
                                  cell && "cheat" in cell
                                    ? "bg-orange-950/40 border-orange-700 text-orange-200"
                                    : "bg-gray-900 border-gray-700 text-white"
                                }`}
                              >
                                <option value="">— Vide —</option>
                                <option value="__cheat__">🎉 Cheat meal</option>
                                {options.map((m) => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                              </select>
                              {cell && "mealId" in cell && cell.portions != null && cell.portions !== 1 && (
                                <span className="text-xs text-indigo-300 shrink-0">×{cell.portions}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!loading && !err && weekMealsList.length > 0 && (
              <div className="rounded-xl bg-gray-800 border border-gray-700 p-4 space-y-2">
                <h2 className="font-semibold">📖 Recettes de la semaine</h2>
                <ul className="space-y-1.5">
                  {weekMealsList.map((meal) => (
                    <li key={meal.id}>
                      <a
                        href={`/shopping?ids=${meal.id}&p_${meal.id}=1`}
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        {meal.name} →
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!loading && !err && (
              <button
                type="button"
                onClick={handleSaveWeek}
                disabled={saving}
                className="w-full py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 transition disabled:opacity-50"
              >
                {saving ? "Enregistrement…" : "💾 Enregistrer la semaine"}
              </button>
            )}
            {saveMsg && <p className="text-xs text-emerald-400 text-center">{saveMsg}</p>}
          </div>
        </main>
      </div>
    </RequireAuth>
  );
}
