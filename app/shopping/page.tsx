"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import BackButton from "@/components/BackButton";

type Item = {
  foodId: string | null;
  nom: string;
  typeName: string;
  caloriesPer100g: number;
  proteinesPer100g: number;
  grams: number;
  kcal: number;
  prot: number;
};

type Food = {
  id: string;
  nom: string;
  typeName?: string;
  caloriesPer100g: number;
  proteinesPer100g?: number;
};

function recompute(item: Omit<Item, "kcal" | "prot">): Item {
  const grams = Math.max(0, item.grams);
  return {
    ...item,
    grams,
    kcal: Math.round((grams / 100) * item.caloriesPer100g),
    prot: Math.round((grams / 100) * (item.proteinesPer100g ?? 0) * 10) / 10,
  };
}

export default function ShoppingPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Chargement…</div>}>
      <ShoppingPageInner />
    </Suspense>
  );
}

function ShoppingPageInner() {
  const sp = useSearchParams();

  const initialIds = useMemo(() => (sp.get("ids") || "").split(",").filter(Boolean), [sp]);
  const initialPortions = useMemo(() => {
    const o: Record<string, number> = {};
    for (const id of initialIds) {
      const val = Number(sp.get(`p_${id}`) || "0");
      if (val > 0) o[id] = val;
    }
    return o;
  }, [sp, initialIds]);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Foods pour le picker
  const [foods, setFoods] = useState<Food[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  // Sauvegarde
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Charger la liste de courses
  useEffect(() => {
    if (!initialIds.length) return;
    setLoading(true);
    fetch("/api/shopping-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ mealIds: initialIds, portionsByMeal: initialPortions }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setItems(data.items || []);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Charger le référentiel pour le picker
  useEffect(() => {
    if (!showPicker || foods.length > 0) return;
    fetch("/api/foods?expandType=true", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setFoods(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [showPicker]);

  function updateGrams(idx: number, delta: number) {
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? recompute({ ...it, grams: Math.max(5, it.grams + delta) }) : it
      )
    );
  }

  function setGrams(idx: number, val: number) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? recompute({ ...it, grams: val }) : it))
    );
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    if (items.length === 0 || initialIds.length === 0) return;
    setSaving(true);
    setSaveErr(null);
    try {
      // Met à jour chaque repas source avec les nouvelles quantités
      await Promise.all(
        initialIds.map((id) =>
          fetch(`/api/meals/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ items }),
          }).then(async (r) => {
            if (!r.ok) throw new Error((await r.json())?.error || "Erreur");
          })
        )
      );
      setSaveSuccess(true);
    } catch (e: any) {
      setSaveErr(e.message || "Erreur");
    } finally {
      setSaving(false);
    }
  }

  function addFood(food: Food) {
    const existing = items.findIndex((it) => it.foodId === food.id || it.nom === food.nom);
    if (existing >= 0) {
      updateGrams(existing, 50);
    } else {
      setItems((prev) => [
        ...prev,
        recompute({
          foodId: food.id,
          nom: food.nom,
          typeName: food.typeName || "Autres",
          caloriesPer100g: food.caloriesPer100g,
          proteinesPer100g: food.proteinesPer100g ?? 0,
          grams: 100,
        }),
      ]);
    }
    setShowPicker(false);
    setPickerSearch("");
  }

  const totalKcal = items.reduce((s, it) => s + it.kcal, 0);
  const totalProt = Math.round(items.reduce((s, it) => s + it.prot, 0) * 10) / 10;

  // Picker : foods filtrés et groupés par type
  const filteredFoods = useMemo(() => {
    const q = pickerSearch.toLowerCase();
    return foods.filter((f) => !q || f.nom.toLowerCase().includes(q));
  }, [foods, pickerSearch]);

  const grouped = useMemo(() => {
    const g: Record<string, Food[]> = {};
    for (const f of filteredFoods) {
      const t = f.typeName || "Autres";
      (g[t] ||= []).push(f);
    }
    return g;
  }, [filteredFoods]);

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-900 text-white flex flex-col md:flex-row">
        <Sidebar />
        <main className="flex-1 px-4 py-6 pb-10">
        <div className="max-w-xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-4">🛒 Liste de courses</h1>

        {loading && <p className="text-gray-400">Chargement...</p>}
        {err && <p className="text-red-400">{err}</p>}

        {!loading && !err && (
          <>
            {/* Total */}
            {items.length > 0 && (
              <div className="mb-4 rounded-xl bg-gray-800 border border-gray-700 px-4 py-3 flex justify-between text-sm">
                <span className="text-gray-400">Total</span>
                <div className="flex gap-4">
                  <span className="text-blue-300 font-semibold">{totalKcal} kcal</span>
                  <span className="text-emerald-400 font-semibold">{totalProt}g prot</span>
                </div>
              </div>
            )}

            {/* Liste */}
            <ul className="space-y-2 mb-4">
              {items.map((it, i) => (
                <li key={i} className="rounded-xl bg-gray-800 border border-gray-700 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        {it.nom}{" "}
                        <span className="text-xs text-gray-400">({it.typeName})</span>
                      </p>
                      <div className="flex gap-3 mt-0.5 text-xs">
                        <span className="text-blue-300">{it.kcal} kcal</span>
                        {it.prot > 0 && <span className="text-emerald-400">{it.prot}g prot</span>}
                      </div>
                    </div>

                    {/* Stepper quantité */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => updateGrams(i, -5)}
                        className="w-8 h-8 rounded-full bg-rose-600 hover:bg-rose-700 font-bold text-lg flex items-center justify-center active:scale-90 transition"
                      >–</button>
                      <input
                        type="number"
                        value={it.grams}
                        onChange={(e) => setGrams(i, Math.max(0, Number(e.target.value)))}
                        className="w-16 text-center bg-gray-700 border border-gray-600 rounded-lg py-1 text-sm font-semibold"
                      />
                      <span className="text-xs text-gray-400">g</span>
                      <button
                        onClick={() => updateGrams(i, 5)}
                        className="w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 font-bold text-lg flex items-center justify-center active:scale-90 transition"
                      >+</button>
                      <button
                        onClick={() => removeItem(i)}
                        className="w-8 h-8 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-400 flex items-center justify-center active:scale-90 transition ml-1"
                      >✕</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Bouton ajouter */}
            <button
              onClick={() => setShowPicker(true)}
              className="w-full py-3 rounded-xl border-2 border-dashed border-gray-600 text-gray-400 hover:border-blue-500 hover:text-blue-400 font-semibold transition"
            >
              + Ajouter un aliment
            </button>

            {/* Sauvegarde */}
            {saveSuccess && (
              <div className="rounded-xl bg-emerald-900/40 border border-emerald-700 text-emerald-200 px-4 py-3 text-sm text-center">
                ✅ Quantités mises à jour
              </div>
            )}
            {saveErr && (
              <div className="rounded-xl bg-rose-900/40 border border-rose-700 text-rose-200 px-4 py-3 text-sm text-center">
                {saveErr}
              </div>
            )}
            {items.length > 0 && initialIds.length > 0 && !saveSuccess && (
              <button
                onClick={handleSave}
                disabled={saving}
                className={`w-full py-3 rounded-xl font-semibold text-white transition ${
                  saving ? "bg-gray-600 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {saving ? "Enregistrement…" : "💾 Enregistrer"}
              </button>
            )}
          </>
        )}
        </div>
        </main>
      </div>

      {/* Picker modal */}
      {showPicker && (
        <div className="fixed inset-0 z-50 bg-black/70 flex flex-col" onClick={() => { setShowPicker(false); setPickerSearch(""); }}>
          <div
            className="mt-auto bg-gray-900 border-t border-gray-700 rounded-t-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-2 border-b border-gray-700 flex items-center gap-3">
              <input
                autoFocus
                type="text"
                placeholder="Rechercher un aliment…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={() => { setShowPicker(false); setPickerSearch(""); }} className="text-gray-400 hover:text-white text-xl px-2">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
              {Object.keys(grouped).length === 0 ? (
                <p className="text-gray-400 text-center py-6">Aucun résultat</p>
              ) : (
                Object.entries(grouped).map(([type, foodList]) => (
                  <div key={type}>
                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">{type}</p>
                    <div className="space-y-1">
                      {foodList.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => addFood(f)}
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 active:scale-95 transition text-left"
                        >
                          <span className="font-medium">{f.nom}</span>
                          <div className="text-xs text-gray-400 text-right">
                            <span className="text-blue-300">{f.caloriesPer100g} kcal</span>
                            {f.proteinesPer100g != null && f.proteinesPer100g > 0 && (
                              <span className="text-emerald-400 ml-2">{f.proteinesPer100g}g prot</span>
                            )}
                            <span className="ml-1">/100g</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </RequireAuth>
  );
}
