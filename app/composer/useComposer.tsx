"use client";

import { useEffect, useMemo, useState } from "react";
import { CAPS_GRAMS, RATIOS } from "./constants";
import type { Food, SelectedItem, SelectedMap, Totals } from "./types";

export function useComposer(apiBaseUrl = "") {
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [dailyKcal, setDailyKcal] = useState("");
  const [mealType, setMealType] = useState<"dejeuner" | "diner">("dejeuner");
  const [selected, setSelected] = useState<SelectedMap>({});
  const [nbRepas, setNbRepas] = useState(1);
  const [breakfastKcal, setBreakfastKcal] = useState<string>("500");
  const [success, setSuccess] = useState<string | null>(null);

  async function fetchCurrentUser() {
    const res = await fetch("/api/users/me", { credentials: "include" });
    if (!res.ok) throw new Error("Impossible de récupérer l'utilisateur");
    return res.json() as Promise<{
      uid: string;
      email: string;
      nickname?: string | null;
    }>;
  }

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

  const mealTargetKcal = useMemo(() => {
    const base = Number(dailyKcal) || 0;
    const bf = Number(breakfastKcal) || 0;
    const remaining = Math.max(0, base - bf);
    const ratio = mealType === "dejeuner" ? 0.6 : 0.4;
    return Math.round(remaining * ratio);
  }, [dailyKcal, breakfastKcal, mealType]);

  const grouped = useMemo(() => {
    return foods.reduce((acc: Record<string, Food[]>, f) => {
      const k = f.typeName || "Autres";
      (acc[k] ||= []).push(f);
      return acc;
    }, {});
  }, [foods]);

  const selectedList = useMemo(() => {
    return Object.entries(selected)
      .map(([id, v]) => {
        const f = foods.find((x) => x.id === id);
        if (!f) return null;
        const grams = Number(v.grams) || 0;
        const kcal = Math.round((grams / 100) * (Number(f.caloriesPer100g) || 0));
        return { ...f, grams, kcal } as SelectedItem;
      })
      .filter(Boolean) as SelectedItem[];
  }, [selected, foods]);

  const totals = useMemo<Totals>(() => {
    const perType: Record<string, number> = {};
    let total = 0;
    for (const it of selectedList) {
      const key = it.typeName || "Autres";
      perType[key] = (perType[key] || 0) + it.kcal;
      total += it.kcal;
    }
    return { perType, total };
  }, [selectedList]);

  const surplusKcal = useMemo(() => {
    return Math.max(0, mealTargetKcal * nbRepas - totals.total * nbRepas);
  }, [mealTargetKcal, totals.total, nbRepas]);

  const targets = useMemo(() => {
    const t: Record<string, number> = {};
    Object.entries(RATIOS).forEach(([type, r]) => {
      t[type] = Math.round(mealTargetKcal * r);
    });
    return t;
  }, [mealTargetKcal]);

  const addFood = (id: string) => {
    setSelected((prev) => (prev[id] ? prev : { ...prev, [id]: { grams: 100 } }));
  };
  const removeFood = (id: string) => {
    setSelected((prev) => {
      const c = { ...prev };
      delete c[id];
      return c;
    });
  };
  const round5 = (g: number) => Math.max(0, Math.round(g / 5) * 5);
  const norm = (s?: string) =>
    (s || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const getItemMaxGrams = (id: string) => {
    const f = findFood(id);
    if (!f?.nom) return null;
    if (norm(f.nom) === norm("Blanc de poulet cru")) return 300;
    return null;
  };
  const clampItemGrams = (id: string, grams: number) => {
    const maxG = getItemMaxGrams(id);
    if (maxG == null) return grams;
    return Math.min(grams, maxG);
  };
  const findFood = (id: string) => foods.find((x) => x.id === id);
  const typeOf = (id: string) => findFood(id)?.typeName || "Autres";
  const kcalPerGram = (id: string) =>
    (Number(findFood(id)?.caloriesPer100g) || 0) / 100;
  const updateFoodGrams = (id: string, delta: number) => {
    setSelected((prev) => {
      const cur = prev[id]?.grams || 0;
      const nextG = Math.max(0, round5(clampItemGrams(id, cur + delta)));
      if (nextG <= 0) {
        const c = { ...prev };
        delete c[id];
        return c;
      }
      return { ...prev, [id]: { grams: nextG } };
    });
  };
  const computeTotalK = (data: SelectedMap) =>
    Math.round(
      Object.entries(data).reduce((sum, [id, v]) => {
        return sum + v.grams * kcalPerGram(id);
      }, 0)
    );

  const groupByType = (data: SelectedMap): Record<string, { id: string; grams: number }[]> =>
    Object.entries(data).reduce((acc, [id, v]) => {
      const type = typeOf(id);
      (acc[type] ||= []).push({ id, grams: v.grams });
      return acc;
    }, {} as Record<string, { id: string; grams: number }[]>);

  const applyTypeCaps = (data: SelectedMap) => {
    const byType = groupByType(data);
    Object.entries(byType).forEach(([type, items]) => {
      const cap = CAPS_GRAMS[type];
      if (!cap || items.length === 0) return;
      const totalG = items.reduce((s, it) => s + it.grams, 0);
      let targetTotalG = totalG;
      if (cap.min != null) targetTotalG = Math.max(targetTotalG, cap.min);
      if (cap.max != null) targetTotalG = Math.min(targetTotalG, cap.max);
      const factor = targetTotalG / (totalG || 1);
      items.forEach((it) => {
        data[it.id] = { grams: round5(it.grams * factor) };
      });
    });
  };

  const applyItemCaps = (data: SelectedMap) => {
    Object.keys(data).forEach((id) => {
      const nextG = clampItemGrams(id, data[id].grams);
      if (nextG !== data[id].grams) {
        data[id] = { grams: round5(nextG) };
      }
    });
  };

  const adjustDownToTarget = (data: SelectedMap, maxK: number) => {
    let totalK = computeTotalK(data);
    if (totalK <= maxK) return;

    const totalsByType = groupByType(data);
    const ids = Object.keys(data).sort((a, b) => kcalPerGram(b) - kcalPerGram(a));
    const step = -5;
    const maxIters = 300;

    const canApplyDelta = (id: string, delta: number) => {
      const nextG = (data[id]?.grams || 0) + delta;
      if (nextG < 0) return false;
      const type = typeOf(id);
      const cap = CAPS_GRAMS[type];
      if (!cap) return true;
      const nextTotal =
        (totalsByType[type]?.reduce((s, it) => s + it.grams, 0) || 0) + delta;
      if (cap.min != null && nextTotal < cap.min) return false;
      if (cap.max != null && nextTotal > cap.max) return false;
      return true;
    };

    for (let i = 0; i < maxIters; i += 1) {
      let moved = false;
      for (const id of ids) {
        if (!canApplyDelta(id, step)) continue;
        data[id] = { grams: round5(data[id].grams + step) };
        const type = typeOf(id);
        const list = totalsByType[type] || [];
        const idx = list.findIndex((it) => it.id === id);
        if (idx >= 0) list[idx] = { id, grams: data[id].grams };
        moved = true;
        break;
      }
      if (!moved) break;
      totalK = computeTotalK(data);
      if (totalK <= maxK) break;
    }
  };

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

    const selByType: Record<string, Food[]> = {};
    Object.keys(current).forEach((id) => {
      const f = findFood(id);
      if (!f) return;
      const type = f.typeName || "Autres";
      (selByType[type] ||= []).push(f);
    });

    const next: SelectedMap = {};
    const kcalPerGramFood = (f: Food) => (Number(f.caloriesPer100g) || 0) / 100;

    Object.entries(RATIOS).forEach(([type]) => {
      const items = selByType[type] || [];
      const targetK = targets[type] || 0;
      if (items.length === 0 || targetK <= 0) return;

      const perItemK = targetK / items.length;
      for (const f of items) {
        const kpg = kcalPerGramFood(f) || 0.01;
        let grams = perItemK / kpg;
        grams = round5(grams);
        next[f.id] = { grams };
      }
    });

    const initialTotal = computeTotalK(next);
    if (initialTotal > 0) {
      const factor = mealTargetKcal / initialTotal;
      Object.keys(next).forEach((id) => {
        next[id] = { grams: round5(next[id].grams * factor) };
      });
    }

    applyTypeCaps(next);
    applyItemCaps(next);
    adjustDownToTarget(next, mealTargetKcal);

    setSelected(next);
  };

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

  async function saveMeal() {
    try {
      if (selectedList.length === 0) throw new Error("Aucun aliment sélectionné");

      const me = await fetchCurrentUser();
      const userId = me.uid;

      const prettyType = mealType === "dejeuner" ? "Déjeuner" : "Dîner";

      const norm = (s?: string) =>
        (s || "")
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .toLowerCase();

      const firstByType = (label: string) =>
        selectedList.find((x) => norm(x.typeName) === norm(label))?.nom;

      const carb =
        firstByType("Féculents") ||
        firstByType("Feculents") ||
        selectedList.find((x) => /feculent/i.test(norm(x.typeName)))?.nom ||
        selectedList[0]?.nom ||
        "féculent";

      const protein =
        firstByType("Protéines") ||
        firstByType("Proteines") ||
        selectedList.find((x) => /proteine/i.test(norm(x.typeName)))?.nom ||
        selectedList.find((x) => /viande|poisson|oeuf/i.test(norm(x.typeName)))?.nom ||
        "protéine";

      const autoName = `${prettyType} — ${carb} + ${protein}`;

      const payload = {
        userId,
        name: autoName,
        portions: nbRepas,
        items: selectedList.map((f) => ({
          id: f.id,
          nom: f.nom,
          typeName: f.typeName,
          caloriesPer100g: f.caloriesPer100g,
          grams: f.grams,
        })),
      };

      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur d'enregistrement");

      setSuccess("Repas enregistré ✅");
      setErr("");
    } catch (e: any) {
      alert(e.message || "Erreur");
      setErr(e.message || "Erreur");
      setSuccess(null);
    }
  }

  return {
    foods,
    loading,
    err,
    setErr,
    dailyKcal,
    setDailyKcal,
    mealType,
    setMealType,
    selected,
    nbRepas,
    setNbRepas,
    breakfastKcal,
    setBreakfastKcal,
    success,
    mealTargetKcal,
    grouped,
    selectedList,
    totals,
    surplusKcal,
    targets,
    addFood,
    removeFood,
    updateFoodGrams,
    autoQuantities,
    typeBadge,
    saveMeal,
  };
}
