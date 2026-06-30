"use client";
import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import BackButton from "@/components/BackButton";

type MealItem = {
  foodId?: string;
  nom: string;
  caloriesPer100g: number;
  proteinesPer100g?: number;
  gramsPerPortion: number;
};

type Meal = {
  id: string;
  name: string;
  portions: number;
  items?: MealItem[];
};

type DayStats = { calories: number; proteines: number };

function calcMeal(meal: Meal, p: number) {
  const items = meal.items ?? [];
  const kcal = Math.round(
    items.reduce((s, it) => s + (it.gramsPerPortion / 100) * it.caloriesPer100g, 0) * p
  );
  const prot = Math.round(
    items.reduce((s, it) => s + (it.gramsPerPortion / 100) * (it.proteinesPer100g ?? 0), 0) * p * 10
  ) / 10;
  return { kcal, prot };
}

const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function Gauge({ value, max, label, color, unit = "", inverse = false }: {
  value: number; max: number; label: string; color: string; unit?: string; inverse?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const remaining = Math.max(0, max - value);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>{label}</span>
        <span className="text-white font-medium">
          {inverse ? `${remaining}${unit} restant` : `${remaining}${unit} à atteindre`}
        </span>
      </div>
      <div className="h-3 rounded-full bg-gray-700 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{value}{unit} consommé{unit === " g" ? "s" : ""}</span>
        <span>objectif {max}{unit}</span>
      </div>
    </div>
  );
}

export default function MealsPage() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [portions, setPortions] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const [dailyLimit, setDailyLimit] = useState(0);
  const [proteinGoal, setProteinGoal] = useState(0);
  const [todayStats, setTodayStats] = useState<DayStats>({ calories: 0, proteines: 0 });

  const [logging, setLogging] = useState(false);
  const [logSuccess, setLogSuccess] = useState<string | null>(null);
  const [logErr, setLogErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const [rMe, rCal] = await Promise.all([
          fetch("/api/users/me", { credentials: "include" }),
          fetch("/api/calories", { credentials: "include" }),
        ]);
        const dMe = await rMe.json();
        if (!rMe.ok) throw new Error(dMe?.error || "Non autorisé");
        const dCal = await rCal.json();
        if (rCal.ok) {
          setDailyLimit(dCal.dailyLimit ?? 0);
          setProteinGoal(dCal.dailyProteinGoal ?? 0);
          const today = dCal.entries?.[todayISO()];
          if (today) setTodayStats({ calories: today.calories ?? 0, proteines: today.proteines ?? 0 });
        }
        const [rMeals, rFoods] = await Promise.all([
          fetch(`/api/meals?userId=${encodeURIComponent(dMe.uid)}`, { credentials: "include" }),
          fetch("/api/foods", { credentials: "include" }),
        ]);
        const dMeals = await rMeals.json();
        if (!rMeals.ok) throw new Error(dMeals?.error || "Erreur chargement repas");
        if (!alive) return;

        // Index des aliments par id pour enrichir les items sans proteinesPer100g
        const dFoods = rFoods.ok ? await rFoods.json() : [];
        const foodIndex: Record<string, { proteinesPer100g?: number; caloriesPer100g?: number }> = {};
        if (Array.isArray(dFoods)) {
          for (const f of dFoods) foodIndex[f.id] = f;
        }

        const list: Meal[] = (Array.isArray(dMeals) ? dMeals : []).map((m: Meal) => ({
          ...m,
          items: (m.items ?? []).map((it) => {
            const ref = it.foodId ? foodIndex[it.foodId] : null;
            return {
              ...it,
              proteinesPer100g: ref?.proteinesPer100g ?? it.proteinesPer100g ?? 0,
              caloriesPer100g: ref?.caloriesPer100g ?? it.caloriesPer100g ?? 0,
            };
          }),
        }));
        setMeals(list);
        const initP: Record<string, number> = {};
        const initC: Record<string, boolean> = {};
        for (const m of list) { initP[m.id] = Number(m.portions) || 1; initC[m.id] = false; }
        setPortions(initP);
        setChecked(initC);
      } catch (e: any) {
        setErr(e.message || "Erreur");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const selection = useMemo(() => {
    return meals
      .filter((m) => checked[m.id])
      .map((m) => ({ meal: m, ...calcMeal(m, portions[m.id] ?? 1) }));
  }, [checked, meals, portions]);

  const totalSelected = useMemo(() => ({
    kcal: selection.reduce((s, x) => s + x.kcal, 0),
    prot: Math.round(selection.reduce((s, x) => s + x.prot, 0) * 10) / 10,
  }), [selection]);

  async function handleLogSelection() {
    if (totalSelected.kcal <= 0) return;
    setLogging(true);
    setLogSuccess(null);
    setLogErr(null);
    try {
      const res = await fetch("/api/calories/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dateKey: todayISO(), calories: totalSelected.kcal, proteines: totalSelected.prot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur");
      setTodayStats((s) => ({
        calories: s.calories + totalSelected.kcal,
        proteines: Math.round((s.proteines + totalSelected.prot) * 10) / 10,
      }));
      setLogSuccess(`✅ ${totalSelected.kcal} kcal · ${totalSelected.prot}g prot ajoutés`);
      setChecked((s) => Object.fromEntries(Object.keys(s).map((k) => [k, false])));
    } catch (e: any) {
      setLogErr(e.message || "Erreur");
    } finally {
      setLogging(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Supprimer ce repas ?")) return;
    setDeleting((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/meals/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Suppression impossible");
      setMeals((ms) => ms.filter((m) => m.id !== id));
    } catch (e: any) {
      alert(e.message || "Erreur");
    } finally {
      setDeleting((s) => { const { [id]: _, ...rest } = s; return rest; });
    }
  }

  if (loading) return <RequireAuth><div className="min-h-screen bg-gray-900 text-white p-6 max-w-xl mx-auto">Chargement…</div></RequireAuth>;
  if (err) return <RequireAuth><div className="min-h-screen bg-gray-900 text-white p-6 max-w-xl mx-auto"><p className="text-red-400">{err}</p></div></RequireAuth>;

  const hasSelection = selection.length > 0;

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-900 text-white px-4 py-6 max-w-xl mx-auto" style={{ paddingBottom: hasSelection ? "120px" : "24px" }}>
        <BackButton label="Retour" fallbackHref="/accueil" className="mb-3 w-fit" />
        <h1 className="text-2xl font-bold mb-4">📚 Mes repas</h1>

        {/* Jauges */}
        {(dailyLimit > 0 || proteinGoal > 0) && (
          <div className="mb-5 rounded-xl bg-gray-800 border border-gray-700 px-4 py-4 space-y-4">
            <p className="text-sm font-semibold text-gray-300">Bilan du jour</p>
            {dailyLimit > 0 && <Gauge label="Calories" value={todayStats.calories} max={dailyLimit} color="bg-orange-500" inverse />}
            {proteinGoal > 0 && <Gauge label="Protéines" value={todayStats.proteines} max={proteinGoal} color="bg-emerald-500" unit=" g" />}
          </div>
        )}

        {meals.length === 0 ? (
          <p className="text-gray-400">Aucun repas enregistré pour le moment.</p>
        ) : (
          <ul className="space-y-3">
            {meals.map((m) => {
              const p = portions[m.id] ?? 1;
              const { kcal, prot } = calcMeal(m, p);
              const isChecked = !!checked[m.id];
              const kcalRestant = dailyLimit > 0 ? dailyLimit - todayStats.calories - kcal : null;

              return (
                <li
                  key={m.id}
                  onClick={() => setChecked((s) => ({ ...s, [m.id]: !s[m.id] }))}
                  className={`rounded-xl border p-4 space-y-3 cursor-pointer transition select-none ${
                    isChecked ? "bg-blue-950/50 border-blue-500" : "bg-gray-800 border-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Checkbox visuel */}
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                      isChecked ? "border-blue-500 bg-blue-500" : "border-gray-500"
                    }`}>
                      {isChecked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{m.name}</p>
                      <div className="flex flex-wrap gap-x-3 mt-0.5 text-sm">
                        <span className="text-blue-300 font-medium">{kcal} kcal</span>
                        {prot > 0 && <span className="text-emerald-400 font-medium">{prot}g prot</span>}
                        {kcalRestant !== null && (
                          <span className={`font-medium ${kcalRestant >= 0 ? "text-gray-400" : "text-rose-400"}`}>
                            → {kcalRestant >= 0 ? `${kcalRestant} restant` : `${Math.abs(kcalRestant)} dépassé`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Colonne droite : portions + actions */}
                    <div className="flex flex-col items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPortions((s) => ({ ...s, [m.id]: Math.max(1, (s[m.id] ?? 1) - 1) }))}
                          className="w-10 h-10 rounded-full bg-rose-600 text-white text-xl font-bold hover:bg-rose-700 active:scale-90 transition flex items-center justify-center"
                        >–</button>
                        <button
                          type="button"
                          onClick={() => setPortions((s) => ({ ...s, [m.id]: (s[m.id] ?? 1) + 1 }))}
                          className="w-10 h-10 rounded-full bg-blue-600 text-white text-xl font-bold hover:bg-blue-700 active:scale-90 transition flex items-center justify-center"
                        >+</button>
                      </div>
                      <span className="font-bold text-base leading-none">{p}</span>
                      <div className="flex items-center gap-2">
                        <a
                          href={`/shopping?ids=${m.id}&p_${m.id}=${p}`}
                          className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-90 transition flex items-center justify-center text-lg"
                        >🛒</a>
                        <button
                          onClick={() => onDelete(m.id)}
                          disabled={!!deleting[m.id]}
                          className="w-10 h-10 rounded-full bg-rose-700 hover:bg-rose-800 active:scale-90 transition flex items-center justify-center text-lg disabled:opacity-50"
                        >🗑️</button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Barre sticky de log */}
      {hasSelection && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 border-t border-gray-700 px-4 py-3 space-y-2">
          <div className="max-w-xl mx-auto space-y-2">
            <div className="flex justify-between text-sm text-gray-300 px-1">
              <span>{selection.length} repas sélectionné{selection.length > 1 ? "s" : ""}</span>
              <span className="font-semibold text-white">{totalSelected.kcal} kcal · {totalSelected.prot}g prot</span>
            </div>
            {logSuccess && (
              <div className="text-sm text-emerald-300 bg-emerald-900/40 border border-emerald-700 rounded-lg px-3 py-1.5 text-center">
                {logSuccess}
              </div>
            )}
            {logErr && (
              <div className="text-sm text-rose-300 bg-rose-900/40 border border-rose-700 rounded-lg px-3 py-1.5 text-center">
                {logErr}
              </div>
            )}
            <button
              onClick={handleLogSelection}
              disabled={logging}
              className={`w-full py-3 rounded-xl font-semibold text-white transition ${
                logging ? "bg-gray-600 cursor-not-allowed" : "bg-orange-600 hover:bg-orange-700"
              }`}
            >
              {logging ? "Ajout en cours…" : `📊 Logger ${totalSelected.kcal} kcal · ${totalSelected.prot}g prot`}
            </button>
          </div>
        </div>
      )}
    </RequireAuth>
  );
}
