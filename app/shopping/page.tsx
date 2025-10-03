"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import BackButton from "@/components/BackButton";


export default function ShoppingPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Chargement…</div>}>
      <ShoppingPageInner />
    </Suspense>
  );
}

function ShoppingPageInner() {
  const sp = useSearchParams(); // ✅ utilisable ici grâce à Suspense

  // --- Récupération des ids depuis query
  const initialIds = useMemo(() => {
    return (sp.get("ids") || "").split(",").filter(Boolean);
  }, [sp]);

  // --- Récupération des portions depuis query
  const initialPortions = useMemo(() => {
    const o: Record<string, number> = {};
    for (const id of initialIds) {
      const key = `p_${id}`;
      const val = Number(sp.get(key) || "0");
      if (val > 0) o[id] = val;
    }
    return o;
  }, [sp, initialIds]);

  const [mealIds, setMealIds] = useState<string[]>(initialIds);
  const [portionsByMeal, setPortionsByMeal] = useState<Record<string, number>>(initialPortions);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch("/api/shopping-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // important si ton endpoint est protégé par cookie
        body: JSON.stringify({ mealIds, portionsByMeal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur génération liste");
      setItems(data.items || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (mealIds.length) generate();
  }, [mealIds, portionsByMeal]);

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-900 text-white p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">🛒 Liste de courses</h1>

        {loading && <p className="text-gray-400">Chargement...</p>}
        {err && <p className="text-red-400">{err}</p>}

        {!loading && !err && (
          <>
            {items.length === 0 ? (
              <p>Sélection vide</p>
            ) : (
              <ul className="space-y-2">
                {items.map((it, i) => (
                  <li
                    key={i}
                    className="p-3 rounded bg-gray-800 flex justify-between"
                  >
                    <span>
                      {it.nom}{" "}
                      <span className="text-xs text-gray-300">
                        ({it.typeName})
                      </span>
                    </span>
                    <span className="font-semibold">{it.grams} g</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </RequireAuth>
  );
}
