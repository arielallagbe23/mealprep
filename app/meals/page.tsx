"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/useAuth";
import RequireAuth from "@/components/RequireAuth";

export default function MealsPage() {
  const { user } = useAuth();
  const [meals, setMeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    (async () => {
      setLoading(true);
      const res = await fetch(`/api/meals?userId=${user.uid}`);
      const data = await res.json();
      setMeals(Array.isArray(data) ? data : []);
      setLoading(false);
    })();
  }, [user?.uid]);

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-900 text-white p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">📚 Mes repas</h1>
        {loading ? "Chargement..." : (
          <ul className="space-y-3">
            {meals.map(m => (
              <li key={m.id} className="p-3 rounded-lg bg-gray-800">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{m.name}</div>
                    <div className="text-sm text-gray-300">Portions par défaut : {m.portions}</div>
                  </div>
                  <a
                    href={`/shopping?ids=${m.id}`}
                    className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-sm"
                  >
                    🛒 Générer la liste
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </RequireAuth>
  );
}
