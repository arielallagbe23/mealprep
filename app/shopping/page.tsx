"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";

export default function ShoppingPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Chargement…</div>}>
      <ShoppingPageInner />
    </Suspense>
  );
}

function ShoppingPageInner() {
  const sp = useSearchParams(); // ✅ dans Suspense
  const initialIds = useMemo(
    () => (sp.get("ids") || "").split(",").filter(Boolean),
    [sp]
  );

  const [mealIds, setMealIds] = useState<string[]>(initialIds);
  const [portionsByMeal, setPortionsByMeal] = useState<Record<string, number>>({});
  const [items, setItems] = useState<any[]>([]);

  async function generate() {
    const res = await fetch("/api/shopping-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealIds, portionsByMeal }),
    });
    const data = await res.json();
    setItems(data.items || []);
  }

  useEffect(() => {
    if (mealIds.length) generate();
  }, [mealIds, portionsByMeal]);

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-900 text-white p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">🛒 Liste de courses</h1>
        {items.length === 0 ? (
          "Sélection vide"
        ) : (
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="p-3 rounded bg-gray-800 flex justify-between">
                <span>
                  {it.nom} <span className="text-xs text-gray-300">({it.typeName})</span>
                </span>
                <span className="font-semibold">{it.grams} g</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </RequireAuth>
  );
}
