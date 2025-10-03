"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/useAuth";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import BackButton from "@/components/BackButton";

// Ratios cibles
const RATIOS: Record<string, number> = {
  Féculents: 0.25,
  Protéines: 0.4,
  Légumes: 0.3,
  Sides: 0.05,
};

export default function Composer({ apiBaseUrl = "" }: { apiBaseUrl?: string }) {
  const { user } = useAuth();

  const [foods, setFoods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [dailyKcal, setDailyKcal] = useState(""); // J (kcal/jour)
  const [mealType, setMealType] = useState<"dejeuner" | "diner">("dejeuner");
  const [selected, setSelected] = useState<Record<string, { grams: number }>>(
    {}
  );
  const [nbRepas, setNbRepas] = useState(1);
  const [breakfastKcal, setBreakfastKcal] = useState<string>("500"); // kcal du petit-déj saisi

  async function fetchCurrentUser() {
    const res = await fetch("/api/users/me", { credentials: "include" });
    if (!res.ok) throw new Error("Impossible de récupérer l'utilisateur");
    return res.json() as Promise<{
      uid: string;
      email: string;
      nickname?: string | null;
    }>;
  }

  // --- Fetch aliments ---
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr("");
        setLoading(true);
        const res = await fetch(`${apiBaseUrl}/api/foods?expandType=true`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Erreur de chargement");
        if (alive) setFoods(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (alive) setErr(e.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [apiBaseUrl]);

  // --- Cible du repas ---
  const mealTargetKcal = useMemo(() => {
    const base = Number(dailyKcal) || 0;
    const bf = Number(breakfastKcal) || 0; // petit-déj saisi
    const remaining = Math.max(0, base - bf); // calories restantes sur la journée
    const ratio = mealType === "dejeuner" ? 0.6 : 0.4; // 60% midi / 40% soir (inchangé)
    return Math.round(remaining * ratio);
  }, [dailyKcal, breakfastKcal, mealType]);

  // --- Groupes par type ---
  const grouped = useMemo(() => {
    return foods.reduce((acc: Record<string, any[]>, f: any) => {
      const k = f.typeName || "Autres";
      (acc[k] ||= []).push(f);
      return acc;
    }, {});
  }, [foods]);

  // --- Liste sélectionnée enrichie ---
  const selectedList = useMemo(() => {
    return Object.entries(selected)
      .map(([id, v]) => {
        const f = foods.find((x) => x.id === id);
        if (!f) return null;
        const grams = Number(v.grams) || 0;
        const kcal = Math.round(
          (grams / 100) * (Number(f.caloriesPer100g) || 0)
        );
        return { ...f, grams, kcal };
      })
      .filter(Boolean) as any[];
  }, [selected, foods]);

  // --- Totaux ---
  const totals = useMemo(() => {
    const perType: Record<string, number> = {};
    let total = 0;
    for (const it of selectedList) {
      const key = it.typeName || "Autres";
      perType[key] = (perType[key] || 0) + it.kcal;
      total += it.kcal;
    }
    return { perType, total };
  }, [selectedList]);

  // --- Cibles par type ---
  const targets = useMemo(() => {
    const t: Record<string, number> = {};
    Object.entries(RATIOS).forEach(([type, r]) => {
      t[type] = Math.round(mealTargetKcal * r);
    });
    return t;
  }, [mealTargetKcal]);

  // Helpers UI
  const addFood = (id: string) => {
    setSelected((prev) =>
      prev[id] ? prev : { ...prev, [id]: { grams: 100 } }
    );
  };
  const removeFood = (id: string) => {
    setSelected((prev) => {
      const c = { ...prev };
      delete c[id];
      return c;
    });
  };
  const round5 = (g: number) => Math.max(0, Math.round(g / 5) * 5);

  // ⚡ AUTO-QUANTITÉS
  const autoQuantities = () => {
    if (mealTargetKcal <= 0) return;

    let current = { ...selected };
    const ensureOnePerType = () => {
      for (const type of Object.keys(RATIOS)) {
        const hasInType = Object.keys(current).some((id) => {
          const f = foods.find((x) => x.id === id);
          return f && (f.typeName || "Autres") === type;
        });
        if (!hasInType) {
          const candidate = (grouped[type] || [])[0];
          if (candidate) current[candidate.id] = { grams: 100 };
        }
      }
    };
    if (Object.keys(current).length === 0) ensureOnePerType();

    const selByType: Record<string, any[]> = {};
    Object.keys(current).forEach((id) => {
      const f = foods.find((x) => x.id === id);
      if (!f) return;
      const type = f.typeName || "Autres";
      (selByType[type] ||= []).push(f);
    });

    const next: Record<string, { grams: number }> = {};
    const kcalPerGram = (f: any) => (Number(f.caloriesPer100g) || 0) / 100;

    Object.entries(RATIOS).forEach(([type]) => {
      const items = selByType[type] || [];
      const targetK = targets[type] || 0;
      if (items.length === 0 || targetK <= 0) return;

      const perItemK = targetK / items.length;
      for (const f of items) {
        const kpg = kcalPerGram(f) || 0.01;
        let grams = perItemK / kpg;
        grams = round5(grams);
        next[f.id] = { grams };
      }
    });

    // Ajustement global ±5%
    const afterList = Object.entries(next).map(([id, v]) => {
      const f = foods.find((x) => x.id === id);
      const grams = v.grams;
      const kcal = Math.round(
        grams * ((Number(f?.caloriesPer100g) || 0) / 100)
      );
      return { id, grams, kcal, f };
    });
    const totalK = afterList.reduce((s, x) => s + x.kcal, 0);
    const tolerance = mealTargetKcal * 0.05;
    const minK = mealTargetKcal - tolerance;
    const maxK = mealTargetKcal + tolerance;

    if (totalK < minK || totalK > maxK) {
      const factor = mealTargetKcal / (totalK || 1);
      for (const it of afterList) {
        let g = round5(it.grams * factor);
        next[it.id] = { grams: g };
      }
    }

    setSelected(next);
  };

  // Badge visuel par type
  const typeBadge = (type: string) => {
    const cur = totals.perType[type] || 0;
    const tgt = targets[type] || 0;
    const diff = tgt - cur;
    const sign = diff >= 0 ? "+" : "–";
    const cls =
      cur === 0
        ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
        : diff >= 0
        ? "bg-blue-600 text-white"
        : "bg-amber-600 text-white";
    return (
      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${cls}`}>
        {type} · {cur} / {tgt} kcal ({sign}
        {Math.abs(diff)})
      </span>
    );
  };

  const router = useRouter();

  async function saveMeal() {
    try {
      if (selectedList.length === 0)
        throw new Error("Aucun aliment sélectionné");

      // 1) Récupérer l'utilisateur via le cookie (serveur)
      const me = await fetchCurrentUser(); // -> { uid, email, nickname }
      const userId = me.uid;

      // 2) Construire le payload d’enregistrement
      const payload = {
        userId,
        name: `${mealType} du ${new Date().toLocaleDateString()}`,
        portions: nbRepas,
        items: selectedList.map((f) => ({
          id: f.id,
          nom: f.nom,
          typeName: f.typeName,
          caloriesPer100g: f.caloriesPer100g,
          grams: f.grams, // par portion
        })),
      };

      // 3) Enregistrer le repas
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // (optionnel ici, mais cohérent)
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur d'enregistrement");

      // 4) Option UX : rediriger direct vers la liste de courses
      // on passe l'id du repas et le nombre de portions pour calcul
      const mealId = data.id as string;
      router.push(
        `/shopping?ids=${encodeURIComponent(mealId)}&p_${mealId}=${nbRepas}`
      );
      // Si tu préfères rester sur place :
      // alert("Repas enregistré ✅");
    } catch (e: any) {
      alert(e.message || "Erreur");
    }
  }

  return (
    <RequireAuth>
      <div className="w-full min-h-screen bg-gradient-to-b from-gray-900 to-gray-900 px-4 py-6">
        <div className="w-full max-w-md mx-auto space-y-6">
          {/* Bloc paramètres */}
          <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-4 shadow-sm">
            {/* Input + boutons repas */}

            <BackButton
              label="Retour"
              fallbackHref="/accueil"
              className="mb-3 w-fit"
            />

            <h1 className="text-xl md:text-2xl font-bold text-center text-white">
              🍽️ Composer un repas
            </h1>

            <div className="grid grid-cols-1 gap-3">
              <label className="text-sm text-gray-700 dark:text-gray-300">
                Apport journalier (kcal)
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="ex: 2200"
                  value={dailyKcal}
                  onChange={(e) => setDailyKcal(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <label className="text-sm text-gray-700 dark:text-gray-300">
                Petit déjeuner (kcal)
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="ex: 300"
                  value={breakfastKcal}
                  onChange={(e) => setBreakfastKcal(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-base text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              <span className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700">
                Restant après petit-déj :{" "}
                <b>
                  {Math.max(
                    0,
                    (Number(dailyKcal) || 0) - (Number(breakfastKcal) || 0)
                  )}
                </b>{" "}
                kcal
              </span>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMealType("dejeuner")}
                  className={`flex-1 py-3 rounded-lg font-semibold text-sm md:text-base ${
                    mealType === "dejeuner"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  }`}
                >
                  Déjeuner (60%)
                </button>
                <button
                  type="button"
                  onClick={() => setMealType("diner")}
                  className={`flex-1 py-3 rounded-lg font-semibold text-sm md:text-base ${
                    mealType === "diner"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                  }`}
                >
                  Dîner (40%)
                </button>
              </div>
            </div>

            {/* Badges cibles */}
            <div className="text-sm text-gray-700 dark:text-gray-200 flex flex-wrap gap-2">
              <span className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700">
                Cible repas : <b>{mealTargetKcal}</b> kcal (±5%)
              </span>
              {Object.keys(RATIOS).map((t) => typeBadge(t))}
            </div>

            {/* Bouton auto quantités */}
            <button
              type="button"
              disabled={mealTargetKcal <= 0 || loading || !!err}
              onClick={autoQuantities}
              className={`w-full py-3 rounded-lg font-semibold text-white ${
                mealTargetKcal <= 0 || loading || !!err
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-purple-600 hover:bg-purple-700 active:scale-95 transition"
              }`}
            >
              ⚡ Auto-quantités
            </button>
          </div>

          {/* Erreurs / loading */}
          {loading && (
            <div className="text-center text-sm text-gray-500 dark:text-gray-400">
              Chargement des aliments...
            </div>
          )}
          {err && (
            <div className="text-center text-sm text-red-700 bg-red-100 dark:bg-red-200 dark:text-red-900 px-3 py-2 rounded-lg">
              {err}
            </div>
          )}

          {/* Liste par type */}
          {!loading && !err && (
            <div className="space-y-4">
              {Object.entries(grouped).map(([type, items]) => (
                <div
                  key={type}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800 shadow-sm"
                >
                  <h2 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-300">
                    {type}
                  </h2>
                  <ul className="space-y-2">
                    {items.map((item) => {
                      const isSel = !!selected[item.id];
                      const grams = selected[item.id]?.grams ?? 0;
                      const kcal = Math.round(
                        (grams / 100) * (item.caloriesPer100g || 0)
                      );
                      return (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-3"
                        >
                          <div className="min-w-0">
                            <p className="text-gray-800 dark:text-gray-100 truncate">
                              {item.nom}
                            </p>
                            <p className="text-xs text-gray-500">
                              {item.caloriesPer100g} kcal/100g
                            </p>
                          </div>

                          {!isSel ? (
                            <button
                              onClick={() => addFood(item.id)}
                              className="ml-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition"
                            >
                              ➕ Ajouter
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-800 dark:text-gray-100 min-w-[70px] text-right">
                                {grams} g
                              </span>
                              <span className="text-xs text-gray-700 dark:text-gray-200 min-w-[64px] text-right">
                                {kcal} kcal
                              </span>
                              <button
                                onClick={() => removeFood(item.id)}
                                className="px-3 py-2 rounded-lg bg-rose-600 text-white text-sm hover:bg-rose-700 active:scale-95 transition"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Résumé */}
          <div className="space-y-3">
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 space-y-4 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Ton repas
              </h3>

              {/* Nb repas */}
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
                      <li key={f.id} className="flex justify-between">
                        <span>
                          {f.nom} — {gramsTotal} g
                        </span>
                        <span className="font-medium">{kcalTotal} kcal</span>
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

            <div className="grid grid-cols-1 gap-2">
              <button
                disabled={mealTargetKcal <= 0 || selectedList.length === 0}
                className={`w-full py-3 rounded-xl font-semibold text-white ${
                  mealTargetKcal <= 0 || selectedList.length === 0
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                }`}
                onClick={saveMeal}
              >
                💾 Enregistrer ce repas
              </button>

              <a
                href="/meals"
                className="block w-full text-center py-3 mb-20 rounded-xl font-semibold text-white bg-blue-600 hover:bg-blue-700"
              >
                📚 Mes repas enregistrés
              </a>
            </div>
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}
