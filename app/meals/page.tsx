"use client";
import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";

type Meal = {
  id: string;
  name: string;
  portions: number; // portions par défaut sauvegardées
  items?: any[];
};

export default function MealsPage() {
  const [me, setMe] = useState<{ uid: string; email?: string } | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // sélection multi + portions à la volée
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [portions, setPortions] = useState<Record<string, number>>({});

  // 1) Récupérer l’utilisateur via le cookie (token en HttpOnly)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);
        setLoading(true);

        const rMe = await fetch("/api/users/me", { credentials: "include" });
        const dMe = await rMe.json();
        if (!rMe.ok) throw new Error(dMe?.error || "Non autorisé");
        if (!alive) return;

        setMe({ uid: dMe.uid, email: dMe.email });

        // 2) Charger ses repas
        const rMeals = await fetch(`/api/meals?userId=${encodeURIComponent(dMe.uid)}`, {
          credentials: "include",
        });
        const dMeals = await rMeals.json();
        if (!rMeals.ok) throw new Error(dMeals?.error || "Erreur chargement repas");
        if (!alive) return;

        const list: Meal[] = Array.isArray(dMeals) ? dMeals : [];
        setMeals(list);

        // init UI: non cochés, portions par défaut depuis le repas
        const initChecked: Record<string, boolean> = {};
        const initPortions: Record<string, number> = {};
        for (const m of list) {
          initChecked[m.id] = false;
          initPortions[m.id] = Number(m.portions) || 1;
        }
        setChecked(initChecked);
        setPortions(initPortions);
      } catch (e: any) {
        setErr(e.message || "Erreur");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Construire l’URL /shopping avec ids + p_<id>=X
  const shoppingHref = useMemo(() => {
    const ids = Object.keys(checked).filter((id) => checked[id]);
    if (ids.length === 0) return null;
    const qs = new URLSearchParams();
    qs.set("ids", ids.join(","));
    ids.forEach((id) => {
      const p = Math.max(1, Number(portions[id] || 1));
      qs.set(`p_${id}`, String(p));
    });
    return `/shopping?${qs.toString()}`;
  }, [checked, portions]);

  if (loading) {
    return (
      <RequireAuth>
        <div className="min-h-screen bg-gray-900 text-white p-6 max-w-xl mx-auto">
          Chargement…
        </div>
      </RequireAuth>
    );
  }

  if (err) {
    return (
      <RequireAuth>
        <div className="min-h-screen bg-gray-900 text-white p-6 max-w-xl mx-auto">
          <p className="text-red-400">{err}</p>
        </div>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-900 text-white p-6 max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">📚 Mes repas</h1>

        {meals.length === 0 ? (
          <p>Aucun repas enregistré pour le moment.</p>
        ) : (
          <ul className="space-y-3 mb-6">
            {meals.map((m) => (
              <li key={m.id} className="p-3 rounded-lg bg-gray-800">
                <div className="flex items-start justify-between gap-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!checked[m.id]}
                      onChange={(e) =>
                        setChecked((s) => ({ ...s, [m.id]: e.target.checked }))
                      }
                      className="mt-1 accent-blue-600"
                    />
                    <div>
                      <div className="font-semibold">{m.name}</div>
                      <div className="text-sm text-gray-300">
                        Portions par défaut : {m.portions}
                      </div>
                    </div>
                  </label>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-300">Portions</span>
                    <input
                      type="number"
                      min={1}
                      value={portions[m.id] ?? 1}
                      onChange={(e) =>
                        setPortions((s) => ({
                          ...s,
                          [m.id]: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      className="w-20 px-2 py-1 rounded bg-gray-900 border border-gray-700"
                    />
                  </div>
                </div>

                {/* Lien direct pour ce seul repas */}
                <div className="mt-3 flex justify-end">
                  <a
                    href={`/shopping?ids=${m.id}&p_${m.id}=${Math.max(
                      1,
                      Number(portions[m.id] ?? m.portions ?? 1)
                    )}`}
                    className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-700 text-sm"
                  >
                    🛒 Liste (ce repas)
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* CTA multi-repas */}
        <div className="flex justify-end">
          <a
            href={shoppingHref ?? "#"}
            aria-disabled={!shoppingHref}
            className={`px-4 py-2 rounded font-semibold ${
              shoppingHref
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-gray-600 cursor-not-allowed"
            }`}
          >
            🧾 Générer la liste (sélection)
          </a>
        </div>
      </div>
    </RequireAuth>
  );
}
