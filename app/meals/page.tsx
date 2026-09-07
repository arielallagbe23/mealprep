"use client";
import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import BackButton from "@/components/BackButton";
import { useAuth } from "@/components/useAuth";
import { DAY_MEAL_SLOTS, type DayMealKey } from "@/app/composer/constants";

function categoryOf(meal: Meal) {
  if (meal.mealType) {
    const byKey = DAY_MEAL_SLOTS.find((s) => s.key === meal.mealType);
    if (byKey) return byKey.label;
  }
  // Repas plus anciens sans mealType : on retombe sur l'ancienne heuristique
  // (préfixe du nom), pour ne pas tout renvoyer dans "Autres" d'un coup.
  const prefix = meal.name.split("—")[0]?.trim();
  const match = DAY_MEAL_SLOTS.find((s) => s.label === prefix);
  return match?.label ?? "Autres";
}

const INITIAL_ACTIVE_SLOTS: Record<DayMealKey, boolean> = DAY_MEAL_SLOTS.reduce(
  (acc, slot) => {
    acc[slot.key] = true;
    return acc;
  },
  {} as Record<DayMealKey, boolean>
);

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
  mealType?: DayMealKey | null;
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

const r2 = (n: number) => Math.round(n * 100) / 100;

function Gauge({ value, previewValue = 0, max, label, color, unit = "", inverse = false }: {
  value: number; previewValue?: number; max: number; label: string; color: string; unit?: string; inverse?: boolean;
}) {
  const total = value + previewValue;
  const basePct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const totalPct = max > 0 ? Math.min(100, Math.round((total / max) * 100)) : 0;
  const previewPct = Math.max(0, totalPct - basePct);
  const remaining = r2(Math.max(0, max - total));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>{label}</span>
        <span className="text-white font-medium">
          {inverse ? `${remaining}${unit} restant` : `${remaining}${unit} à atteindre`}
        </span>
      </div>
      <div className="h-3 rounded-full bg-gray-700 overflow-hidden flex">
        <div className={`h-full transition-all ${color}`} style={{ width: `${basePct}%` }} />
        {previewPct > 0 && (
          <div className={`h-full transition-all opacity-50 ${color}`} style={{ width: `${previewPct}%` }} />
        )}
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>
          {r2(value)}{unit} consommé{unit === " g" ? "s" : ""}
          {previewValue > 0 && ` + ${r2(previewValue)}${unit} sélectionné${unit === " g" ? "s" : ""}`}
        </span>
        <span>objectif {r2(max)}{unit}</span>
      </div>
    </div>
  );
}

export default function MealsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [portions, setPortions] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [dailyLimit, setDailyLimit] = useState(0);
  const [proteinGoal, setProteinGoal] = useState(0);
  const [todayStats, setTodayStats] = useState<DayStats>({ calories: 0, proteines: 0 });

  const [logging, setLogging] = useState(false);
  const [logSuccess, setLogSuccess] = useState<string | null>(null);
  const [logErr, setLogErr] = useState<string | null>(null);

  const [stickyBarEl, setStickyBarEl] = useState<HTMLDivElement | null>(null);
  const [stickyBarHeight, setStickyBarHeight] = useState(0);

  const todayKey = todayISO();
  const [activeSlots, setActiveSlots] = useState<Record<DayMealKey, boolean>>(INITIAL_ACTIVE_SLOTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`mealSlotsActive:${todayKey}`);
      if (raw) setActiveSlots({ ...INITIAL_ACTIVE_SLOTS, ...JSON.parse(raw) });
    } catch {
      // localStorage indisponible : on garde tous les créneaux actifs
    }
  }, [todayKey]);

  useEffect(() => {
    if (!stickyBarEl) { setStickyBarHeight(0); return; }
    const observer = new ResizeObserver(([entry]) => {
      setStickyBarHeight(entry.contentRect.height);
    });
    observer.observe(stickyBarEl);
    return () => observer.disconnect();
  }, [stickyBarEl]);

  function toggleSlot(key: DayMealKey) {
    const next = { ...activeSlots, [key]: !activeSlots[key] };
    const hasAtLeastOne = Object.values(next).some(Boolean);
    if (!hasAtLeastOne) return;

    setActiveSlots(next);
    try {
      localStorage.setItem(`mealSlotsActive:${todayKey}`, JSON.stringify(next));
    } catch {
      // localStorage indisponible : le choix ne sera pas mémorisé
    }

    // Repas sauté : on retire ses éventuels items de la sélection en cours
    if (!next[key]) {
      const label = DAY_MEAL_SLOTS.find((s) => s.key === key)?.label;
      if (label) {
        setChecked((c) => {
          const updated = { ...c };
          let changed = false;
          for (const m of meals) {
            if (categoryOf(m) === label && updated[m.id]) {
              updated[m.id] = false;
              changed = true;
            }
          }
          return changed ? updated : c;
        });
      }
    }
  }

  const slotDistribution = useMemo<Record<DayMealKey, number>>(() => {
    const active = DAY_MEAL_SLOTS.filter((slot) => activeSlots[slot.key]);
    const totalRatios = active.reduce((sum, slot) => sum + slot.ratio, 0) || 1;
    const map = {} as Record<DayMealKey, number>;
    DAY_MEAL_SLOTS.forEach((slot) => { map[slot.key] = 0; });
    active.forEach((slot) => { map[slot.key] = slot.ratio / totalRatios; });
    return map;
  }, [activeSlots]);

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
          fetch("/api/meals", { credentials: "include" }),
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

  const groupedMeals = useMemo(() => {
    const groups: Record<string, Meal[]> = {};
    for (const m of meals) {
      const cat = categoryOf(m);
      (groups[cat] ||= []).push(m);
    }
    const slotGroups = DAY_MEAL_SLOTS.map((slot) => ({
      key: slot.key as DayMealKey | null,
      category: slot.label,
      meals: groups[slot.label] ?? [],
    }));
    const autres = groups["Autres"] ?? [];
    return autres.length > 0
      ? [...slotGroups, { key: null, category: "Autres", meals: autres }]
      : slotGroups;
  }, [meals]);

  const selection = useMemo(() => {
    return meals
      .filter((m) => checked[m.id])
      .map((m) => ({ meal: m, ...calcMeal(m, portions[m.id] ?? 1) }));
  }, [checked, meals, portions]);

  const totalSelected = useMemo(() => ({
    kcal: selection.reduce((s, x) => s + x.kcal, 0),
    prot: Math.round(selection.reduce((s, x) => s + x.prot, 0) * 10) / 10,
  }), [selection]);

  const shoppingListHref = useMemo(() => {
    if (selection.length === 0) return null;
    const params = new URLSearchParams();
    params.set("ids", selection.map(({ meal }) => meal.id).join(","));
    params.set("mode", "shop");
    for (const { meal } of selection) {
      params.set(`p_${meal.id}`, String(portions[meal.id] ?? 1));
    }
    return `/shopping?${params.toString()}`;
  }, [selection, portions]);

  const missingPct = dailyLimit > 0 && totalSelected.kcal > 0 && totalSelected.kcal < dailyLimit
    ? r2(((dailyLimit - totalSelected.kcal) / totalSelected.kcal) * 100)
    : null;

  const missingProtPct = proteinGoal > 0 && totalSelected.prot > 0 && totalSelected.prot < proteinGoal
    ? r2(((proteinGoal - totalSelected.prot) / totalSelected.prot) * 100)
    : null;

  function scaleSelectionBy(scale: number) {
    setPortions((prev) => {
      const next = { ...prev };
      for (const { meal } of selection) {
        next[meal.id] = r2((prev[meal.id] ?? 1) * scale);
      }
      return next;
    });
  }

  function completeToObjective() {
    if (dailyLimit <= 0 || totalSelected.kcal <= 0 || totalSelected.kcal >= dailyLimit) return;
    scaleSelectionBy(dailyLimit / totalSelected.kcal);
  }

  function completeProteinToObjective() {
    if (proteinGoal <= 0 || totalSelected.prot <= 0 || totalSelected.prot >= proteinGoal) return;
    scaleSelectionBy(proteinGoal / totalSelected.prot);
  }

  // Scaler chaque repas sélectionné par son propre facteur (au lieu d'un facteur
  // unique) : seule façon d'atteindre calories ET protéines en même temps quand
  // les repas n'ont pas le même ratio kcal/protéine que l'objectif.
  function completeToBothObjectives() {
    if (dailyLimit <= 0 || proteinGoal <= 0 || selection.length === 0) return;

    const base = selection.map(({ meal }) => calcMeal(meal, 1));
    const K = base.map((b) => b.kcal);
    const P = base.map((b) => b.prot);

    const a = K.reduce((s, k) => s + k * k, 0);
    const b = K.reduce((s, k, i) => s + k * P[i], 0);
    const c = P.reduce((s, p) => s + p * p, 0);
    const det = a * c - b * b;

    if (Math.abs(det) < 1e-6) {
      alert("Impossible d'atteindre exactement les deux objectifs avec cette sélection (essaie avec des repas aux profils kcal/protéines plus variés).");
      return;
    }

    const y1 = (c * dailyLimit - b * proteinGoal) / det;
    const y2 = (-b * dailyLimit + a * proteinGoal) / det;

    const next = { ...portions };
    let hasNegative = false;
    selection.forEach(({ meal }, i) => {
      const x = K[i] * y1 + P[i] * y2;
      if (x < 0) hasNegative = true;
      next[meal.id] = r2(Math.max(0.1, x));
    });

    if (hasNegative) {
      alert("Pour atteindre exactement les deux objectifs, certaines quantités auraient dû être négatives — elles ont été ramenées au minimum, le résultat est donc approximatif.");
    }

    setPortions(next);
  }

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

  function startEditing(m: Meal) {
    setEditingId(m.id);
    setEditValue(m.name);
  }

  function cancelEditing() {
    setEditingId(null);
    setEditValue("");
  }

  async function saveEditing(id: string) {
    const trimmed = editValue.trim();
    if (!trimmed) { cancelEditing(); return; }
    const prev = meals.find((m) => m.id === id)?.name;
    if (trimmed === prev) { cancelEditing(); return; }

    setRenaming(true);
    try {
      const res = await fetch(`/api/meals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur de renommage");
      setMeals((ms) => ms.map((m) => (m.id === id ? { ...m, name: trimmed } : m)));
      cancelEditing();
    } catch (e: any) {
      alert(e.message || "Erreur");
    } finally {
      setRenaming(false);
    }
  }

  async function updateMealType(id: string, newType: DayMealKey | null) {
    setMeals((ms) => ms.map((m) => (m.id === id ? { ...m, mealType: newType } : m)));
    try {
      const res = await fetch(`/api/meals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mealType: newType }),
      });
      if (!res.ok) throw new Error("Erreur");
    } catch {
      alert("Impossible de changer le créneau de ce repas");
    }
  }

  if (loading) return <RequireAuth><div className="min-h-screen bg-gray-900 flex flex-col md:flex-row"><Sidebar /><main className="flex-1 p-6 text-white">Chargement…</main></div></RequireAuth>;
  if (err) return <RequireAuth><div className="min-h-screen bg-gray-900 flex flex-col md:flex-row"><Sidebar /><main className="flex-1 p-6 text-white"><p className="text-red-400">{err}</p></main></div></RequireAuth>;

  const hasSelection = selection.length > 0;

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-900 text-white flex flex-col md:flex-row">
        <Sidebar />
        <main className="flex-1 px-4 py-6" style={{ paddingBottom: hasSelection ? `${stickyBarHeight + 24}px` : "24px" }}>
        <div className="max-w-xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-4">📚 Mes repas</h1>

        {/* Jauges */}
        {(dailyLimit > 0 || proteinGoal > 0) && (
          <div className="mb-5 rounded-xl bg-gray-800 border border-gray-700 px-4 py-4 space-y-4">
            <p className="text-sm font-semibold text-gray-300">Bilan du jour</p>
            {dailyLimit > 0 && (
              <Gauge
                label="Calories"
                value={todayStats.calories}
                previewValue={totalSelected.kcal}
                max={dailyLimit}
                color="bg-orange-500"
                inverse
              />
            )}
            {proteinGoal > 0 && (
              <Gauge
                label="Protéines"
                value={todayStats.proteines}
                previewValue={totalSelected.prot}
                max={proteinGoal}
                color="bg-emerald-500"
                unit=" g"
              />
            )}
          </div>
        )}

        <div className="space-y-6">
          {groupedMeals.map(({ key: slotKey, category, meals: catMeals }) => {
            const isActive = slotKey === null ? true : !!activeSlots[slotKey];
            const pct = slotKey === null ? null : Math.round((slotDistribution[slotKey] || 0) * 1000) / 10;
            const targetKcal = slotKey === null || dailyLimit <= 0 ? null : Math.round(dailyLimit * (slotDistribution[slotKey] || 0));
            const targetProt = slotKey === null || proteinGoal <= 0 ? null : Math.round(proteinGoal * (slotDistribution[slotKey] || 0) * 10) / 10;

            return (
            <div key={category}>
              <div className="mb-3 px-1 py-1 border-b border-gray-700 pb-2">
                <div className="flex items-center gap-2.5">
                  {slotKey !== null && (
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => toggleSlot(slotKey)}
                      className="accent-blue-600 w-5 h-5"
                      aria-label={`${category} actif aujourd'hui`}
                    />
                  )}
                  <h2 className={`text-lg font-bold uppercase tracking-wide ${isActive ? "text-white" : "text-gray-500"}`}>
                    {category}
                  </h2>
                </div>
                {pct !== null && (
                  <p className={`text-xs font-medium mt-0.5 ${isActive ? "text-emerald-400" : "text-gray-500"}`}>
                    {pct}%
                    {targetKcal !== null ? ` · ${targetKcal} kcal` : ""}
                    {targetProt !== null ? ` · ${targetProt}g prot` : ""}
                  </p>
                )}
              </div>
              <div className={isActive ? "" : "opacity-40"}>
              {catMeals.length === 0 ? (
                <a
                  href="/composer"
                  className="block rounded-xl border border-dashed border-gray-700 p-4 text-sm text-gray-400 hover:border-gray-500 hover:text-gray-300 transition"
                >
                  Aucun repas pour ce créneau — <span className="text-blue-400 font-medium">composer un repas →</span>
                </a>
              ) : (
              <ul className="space-y-3">
            {catMeals.map((m) => {
              const p = portions[m.id] ?? 1;
              const { kcal, prot } = calcMeal(m, p);
              const isChecked = !!checked[m.id];
              const kcalRestant = dailyLimit > 0 ? dailyLimit - todayStats.calories - kcal : null;
              const isEditing = editingId === m.id;

              return (
                <li
                  key={m.id}
                  onClick={() => setChecked((s) => ({ ...s, [m.id]: !s[m.id] }))}
                  className={`rounded-xl border p-4 space-y-5 cursor-pointer transition select-none ${
                    isChecked ? "bg-blue-950/50 border-blue-500" : "bg-gray-800 border-gray-700"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox visuel */}
                    <div className={`w-6 h-6 mt-0.5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                      isChecked ? "border-blue-500 bg-blue-500" : "border-gray-500"
                    }`}>
                      {isChecked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
                    </div>

                    <div className="min-w-0 flex-1">
                      {isEditing && isAdmin ? (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEditing(m.id);
                              if (e.key === "Escape") cancelEditing();
                            }}
                            disabled={renaming}
                            className="flex-1 min-w-0 bg-gray-900 border border-blue-500 rounded-lg px-2 py-1 font-semibold text-white"
                          />
                          <button
                            type="button"
                            onClick={() => saveEditing(m.id)}
                            disabled={renaming}
                            className="text-emerald-400 hover:text-emerald-300 text-sm font-medium shrink-0 disabled:opacity-50"
                          >✓</button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            disabled={renaming}
                            className="text-gray-400 hover:text-gray-300 text-sm font-medium shrink-0 disabled:opacity-50"
                          >✕</button>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <p className="font-semibold wrap-break-word">{m.name}</p>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); startEditing(m); }}
                              className="text-gray-500 hover:text-gray-300 shrink-0 mt-0.5"
                              aria-label="Renommer le repas"
                            >✏️</button>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-x-3 mt-0.5 text-sm">
                        <span className="text-blue-300 font-medium">{kcal} kcal</span>
                        {prot > 0 && <span className="text-emerald-400 font-medium">{prot}g prot</span>}
                        {kcalRestant !== null && (
                          <span className={`font-medium ${kcalRestant >= 0 ? "text-gray-400" : "text-rose-400"}`}>
                            → {kcalRestant >= 0 ? `${kcalRestant} restant` : `${Math.abs(kcalRestant)} dépassé`}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5 text-xs" onClick={(e) => e.stopPropagation()}>
                        <span className="text-gray-500">Créneau :</span>
                        {isAdmin ? (
                          <select
                            value={m.mealType ?? ""}
                            onChange={(e) => updateMealType(m.id, (e.target.value || null) as DayMealKey | null)}
                            className="bg-gray-900 border border-gray-700 rounded-lg px-1.5 py-0.5 text-gray-300"
                          >
                            <option value="">Autres</option>
                            {DAY_MEAL_SLOTS.map((slot) => (
                              <option key={slot.key} value={slot.key}>{slot.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-300">{categoryOf(m)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Portions + actions */}
                  <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center">
                      <span className="font-bold text-base min-w-10 text-center">{r2(p)}</span>
                      <button
                        type="button"
                        onClick={() => setPortions((s) => ({ ...s, [m.id]: Math.max(1, (s[m.id] ?? 1) - 1) }))}
                        className="w-10 h-10 m-1 rounded-xl bg-rose-600 text-white text-xl font-bold hover:bg-rose-700 active:scale-90 transition flex items-center justify-center"
                      >–</button>
                      <button
                        type="button"
                        onClick={() => setPortions((s) => ({ ...s, [m.id]: (s[m.id] ?? 1) + 1 }))}
                        className="w-10 h-10 m-1 rounded-xl bg-blue-600 text-white text-xl font-bold hover:bg-blue-700 active:scale-90 transition flex items-center justify-center"
                      >+</button>
                    </div>
                    <div className="flex items-center">
                      <a
                        href={`/shopping?ids=${m.id}&p_${m.id}=${p}`}
                        title="Modifier repas"
                        className="w-10 h-10 m-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-90 transition flex items-center justify-center text-lg"
                      >📝</a>
                      {isAdmin && (
                        <button
                          onClick={() => onDelete(m.id)}
                          disabled={!!deleting[m.id]}
                          className="w-10 h-10 m-1 rounded-xl bg-rose-700 hover:bg-rose-800 active:scale-90 transition flex items-center justify-center text-lg disabled:opacity-50"
                        >🗑️</button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
              </ul>
              )}
              </div>
            </div>
            );
          })}
          </div>
      </div>
        </main>
      </div>

      {/* Barre sticky de log */}
      {hasSelection && (
        <div ref={setStickyBarEl} className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 border-t border-gray-700 px-4 py-3 space-y-2">
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
            {dailyLimit > 0 && proteinGoal > 0 && selection.length > 0 &&
              (totalSelected.kcal !== dailyLimit || totalSelected.prot !== proteinGoal) && (
              <button
                onClick={completeToBothObjectives}
                className="w-full py-2 rounded-xl font-medium text-sm text-blue-200 bg-blue-900/40 border border-blue-700 hover:bg-blue-900/60 transition"
              >
                🎯 Compléter aux deux objectifs (calories + protéines)
              </button>
            )}
            {missingPct !== null && (
              <button
                onClick={completeToObjective}
                className="w-full py-2 rounded-xl font-medium text-sm text-purple-200 bg-purple-900/40 border border-purple-700 hover:bg-purple-900/60 transition"
              >
                🎯 Compléter calories à l'objectif (+{missingPct}% sur tous les repas sélectionnés)
              </button>
            )}
            {missingProtPct !== null && (
              <button
                onClick={completeProteinToObjective}
                className="w-full py-2 rounded-xl font-medium text-sm text-emerald-200 bg-emerald-900/40 border border-emerald-700 hover:bg-emerald-900/60 transition"
              >
                🎯 Compléter protéines à l'objectif (+{missingProtPct}% sur tous les repas sélectionnés)
              </button>
            )}
            {shoppingListHref && (
              <a
                href={shoppingListHref}
                className="w-full py-3 rounded-xl font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition flex items-center justify-center"
              >
                🛒 Générer ma liste de courses
              </a>
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
