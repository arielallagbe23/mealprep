"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import BackButton from "@/components/BackButton";
import RequireAuth from "@/components/RequireAuth";

const FOODS_PER_PAGE = 10;

type Food = {
  id: string;
  nom?: string;
  caloriesPer100g?: number;
  typeId?: string;
  typeName?: string;
};

type FoodType = {
  id: string;
  nomtype?: string;
};

type EditForm = {
  id: string;
  nom: string;
  caloriesPer100g: string;
  typeId: string;
};

export default function ReferentielPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [types, setTypes] = useState<FoodType[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [newFoodName, setNewFoodName] = useState("");
  const [newFoodCalories, setNewFoodCalories] = useState("");
  const [newFoodTypeId, setNewFoodTypeId] = useState("");
  const [addingFood, setAddingFood] = useState(false);
  const [addFoodMsg, setAddFoodMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const [foodsRes, typesRes] = await Promise.all([
          fetch("/api/foods?expandType=true", { credentials: "include" }),
          fetch("/api/types", { credentials: "include" }),
        ]);

        const foodsData = await foodsRes.json();
        const typesData = await typesRes.json();

        if (!foodsRes.ok) {
          throw new Error(foodsData?.error || "Erreur chargement aliments");
        }
        if (!typesRes.ok) {
          throw new Error(typesData?.error || "Erreur chargement types");
        }

        if (!alive) return;
        setFoods(Array.isArray(foodsData) ? foodsData : []);
        setTypes(Array.isArray(typesData) ? typesData : []);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Erreur serveur";
        if (alive) setErr(message);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const countsByType = useMemo(() => {
    return foods.reduce((acc, f) => {
      const key = f.typeId || "";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [foods]);

  const filteredFoods = useMemo(() => {
    const q = query.trim().toLowerCase();
    return foods.filter((f) => {
      const matchesType = typeFilter === "all" || f.typeId === typeFilter;
      if (!matchesType) return false;
      if (!q) return true;
      const nom = (f.nom || "").toLowerCase();
      const typeName = (f.typeName || "").toLowerCase();
      return nom.includes(q) || typeName.includes(q);
    });
  }, [foods, query, typeFilter]);

  const sortedFoods = useMemo(() => {
    return [...filteredFoods].sort((a, b) => {
      const aType = a.typeName || "Autres";
      const bType = b.typeName || "Autres";
      const byType = aType.localeCompare(bType, "fr", { sensitivity: "base" });
      if (byType !== 0) return byType;
      return (a.nom || "").localeCompare(b.nom || "", "fr", {
        sensitivity: "base",
      });
    });
  }, [filteredFoods]);

  useEffect(() => {
    setPage(1);
  }, [query, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(sortedFoods.length / FOODS_PER_PAGE));

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const paginatedFoods = useMemo(() => {
    const start = (page - 1) * FOODS_PER_PAGE;
    return sortedFoods.slice(start, start + FOODS_PER_PAGE);
  }, [sortedFoods, page]);

  const groupedFoods = useMemo(() => {
    const map = new Map<string, Food[]>();
    for (const food of paginatedFoods) {
      const typeLabel = food.typeName || "Autres";
      const list = map.get(typeLabel) || [];
      list.push(food);
      map.set(typeLabel, list);
    }
    return Array.from(map.entries()).map(([typeLabel, items]) => ({
      typeLabel,
      items,
    }));
  }, [paginatedFoods]);

  function openEdit(food: Food) {
    setActionErr(null);
    setEditForm({
      id: food.id,
      nom: food.nom || "",
      caloriesPer100g: String(Number(food.caloriesPer100g || 0)),
      typeId: food.typeId || "",
    });
  }

  async function handleDelete(foodId: string) {
    const ok = window.confirm("Supprimer cet aliment ?");
    if (!ok) return;

    try {
      setActionErr(null);
      setDeletingId(foodId);
      const res = await fetch(`/api/foods/${foodId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Suppression impossible");
      setFoods((prev) => prev.filter((f) => f.id !== foodId));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erreur serveur";
      setActionErr(message);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSaveEdit() {
    if (!editForm) return;

    const nom = editForm.nom.trim();
    const calories = Number(editForm.caloriesPer100g);
    const typeId = editForm.typeId.trim();

    if (!nom || !Number.isFinite(calories) || calories < 0 || !typeId) {
      setActionErr("Champs invalides pour la modification");
      return;
    }

    try {
      setActionErr(null);
      setSavingEdit(true);
      const res = await fetch(`/api/foods/${editForm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nom,
          caloriesPer100g: calories,
          typeId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Modification impossible");

      const nextTypeName =
        types.find((t) => t.id === typeId)?.nomtype || "Autres";

      setFoods((prev) =>
        prev.map((f) =>
          f.id === editForm.id
            ? {
                ...f,
                nom,
                caloriesPer100g: calories,
                typeId,
                typeName: nextTypeName,
              }
            : f
        )
      );
      setEditForm(null);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erreur serveur";
      setActionErr(message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleCreateFood(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const nom = newFoodName.trim();
    const calories = Number(newFoodCalories);
    const typeId = newFoodTypeId.trim();

    if (!nom || !Number.isFinite(calories) || calories < 0 || !typeId) {
      setActionErr("Champs invalides pour l'ajout");
      setAddFoodMsg(null);
      return;
    }

    try {
      setActionErr(null);
      setAddFoodMsg(null);
      setAddingFood(true);

      const res = await fetch("/api/foods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nom,
          caloriesPer100g: calories,
          typeId,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Ajout impossible");

      const typeName = types.find((t) => t.id === typeId)?.nomtype || "Autres";
      setFoods((prev) => [
        {
          id: data.id,
          nom,
          caloriesPer100g: calories,
          typeId,
          typeName,
        },
        ...prev,
      ]);

      setNewFoodName("");
      setNewFoodCalories("");
      setNewFoodTypeId("");
      setAddFoodMsg("Aliment ajouté");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erreur serveur";
      setActionErr(message);
      setAddFoodMsg(null);
    } finally {
      setAddingFood(false);
    }
  }

  return (
    <RequireAuth>
      <main className="min-h-screen bg-gray-900 text-white px-4 py-6">
        <div className="w-full max-w-6xl mx-auto space-y-5">
          <BackButton label="Retour" fallbackHref="/accueil" className="w-fit" />

          <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
            <h1 className="text-2xl font-bold">Gestion des aliments</h1>
            <p className="text-sm text-gray-300 mt-1">
              Ajoute, modifie et supprime les aliments et leurs types depuis Firestore.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-3">
              <div className="text-xs uppercase text-gray-400">Types</div>
              <div className="text-2xl font-bold">{types.length}</div>
            </div>
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-3">
              <div className="text-xs uppercase text-gray-400">Aliments</div>
              <div className="text-2xl font-bold">{foods.length}</div>
            </div>
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-3">
              <div className="text-xs uppercase text-gray-400">Après filtres</div>
              <div className="text-2xl font-bold">{filteredFoods.length}</div>
            </div>
          </div>

          <section className="rounded-xl border border-gray-700 bg-gray-800 p-4 space-y-3">
            <h2 className="text-3xl font-bold">Ajouter un aliment</h2>
            <form onSubmit={handleCreateFood} className="space-y-3">
              <input
                value={newFoodName}
                onChange={(e) => setNewFoodName(e.target.value)}
                placeholder="Nom (ex: Haricot vert)"
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2"
              />
              <input
                type="number"
                min={0}
                value={newFoodCalories}
                onChange={(e) => setNewFoodCalories(e.target.value)}
                placeholder="Calories / 100g"
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2"
              />
              <select
                value={newFoodTypeId}
                onChange={(e) => setNewFoodTypeId(e.target.value)}
                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2"
              >
                <option value="">Type d&apos;aliment</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nomtype || t.id}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={addingFood}
                className={`w-full rounded-lg px-3 py-3 text-white font-semibold ${
                  addingFood
                    ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {addingFood ? "Ajout..." : "Ajouter l'aliment"}
              </button>
            </form>
            {addFoodMsg && <div className="text-sm text-emerald-300">{addFoodMsg}</div>}
          </section>

          <div className="rounded-xl border border-gray-700 bg-gray-800 p-4 space-y-3">
            <h2 className="text-lg font-semibold">Filtres aliments</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Recherche nom / type"
                className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2"
              />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2"
              >
                <option value="all">Tous les types</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nomtype || t.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading && (
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-gray-300">
              Chargement...
            </div>
          )}

          {err && (
            <div className="rounded-lg border border-rose-700 bg-rose-900/30 p-4 text-rose-300">
              {err}
            </div>
          )}

          {actionErr && (
            <div className="rounded-lg border border-amber-700 bg-amber-900/30 p-4 text-amber-200">
              {actionErr}
            </div>
          )}

          {!loading && !err && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <section className="rounded-xl border border-gray-700 bg-gray-800 p-4">
                <h2 className="text-lg font-semibold mb-3">Types d&apos;aliments</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-700">
                        <th className="py-2 pr-2">Type</th>
                        <th className="py-2 pr-2">ID</th>
                        <th className="py-2">Nb aliments</th>
                      </tr>
                    </thead>
                    <tbody>
                      {types.map((t) => (
                        <tr key={t.id} className="border-b border-gray-800">
                          <td className="py-2 pr-2 font-medium">{t.nomtype || "Sans nom"}</td>
                          <td className="py-2 pr-2 text-gray-400">{t.id}</td>
                          <td className="py-2">{countsByType[t.id] || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-xl border border-gray-700 bg-gray-800 p-4">
                <h2 className="text-lg font-semibold mb-3">Aliments</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-400 border-b border-gray-700">
                        <th className="py-2 pr-2">Nom</th>
                        <th className="py-2 pr-2">Type</th>
                        <th className="py-2 pr-2">kcal/100g</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedFoods.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-3 text-gray-400">
                            Aucun aliment.
                          </td>
                        </tr>
                      ) : (
                        groupedFoods.flatMap((group) => [
                          <tr
                            key={`group-${group.typeLabel}`}
                            className="bg-gray-900/60 border-b border-gray-700"
                          >
                            <td
                              colSpan={4}
                              className="py-2 pr-2 text-xs font-semibold uppercase tracking-wide text-cyan-300"
                            >
                              {group.typeLabel}
                            </td>
                          </tr>,
                          ...group.items.map((f) => (
                            <tr key={f.id} className="border-b border-gray-800">
                              <td className="py-2 pr-2 font-medium">{f.nom || "—"}</td>
                              <td className="py-2 pr-2 text-gray-300">{f.typeName || "Autres"}</td>
                              <td className="py-2 pr-2">{Number(f.caloriesPer100g || 0)}</td>
                              <td className="py-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(f)}
                                    className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-xs font-semibold"
                                  >
                                    Modifier
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(f.id)}
                                    disabled={deletingId === f.id}
                                    className={`px-2 py-1 rounded text-xs font-semibold ${
                                      deletingId === f.id
                                        ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                                        : "bg-rose-600 hover:bg-rose-700"
                                    }`}
                                  >
                                    {deletingId === f.id ? "Suppression..." : "Supprimer"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )),
                        ])
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 text-sm">
                  <span className="text-gray-400">
                    Page {page} / {totalPages} · {sortedFoods.length} aliments
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className={`px-3 py-1.5 rounded ${
                        page <= 1
                          ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                          : "bg-gray-700 hover:bg-gray-600"
                      }`}
                    >
                      Précédent
                    </button>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className={`px-3 py-1.5 rounded ${
                        page >= totalPages
                          ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                          : "bg-gray-700 hover:bg-gray-600"
                      }`}
                    >
                      Suivant
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {editForm && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
              <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-4">
                <h3 className="text-lg font-semibold">Modifier un aliment</h3>

                <label className="block text-sm text-gray-300">
                  Nom
                  <input
                    value={editForm.nom}
                    onChange={(e) =>
                      setEditForm((prev) =>
                        prev ? { ...prev, nom: e.target.value } : prev
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2"
                  />
                </label>

                <label className="block text-sm text-gray-300">
                  Calories / 100g
                  <input
                    type="number"
                    min={0}
                    value={editForm.caloriesPer100g}
                    onChange={(e) =>
                      setEditForm((prev) =>
                        prev ? { ...prev, caloriesPer100g: e.target.value } : prev
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2"
                  />
                </label>

                <label className="block text-sm text-gray-300">
                  Type
                  <select
                    value={editForm.typeId}
                    onChange={(e) =>
                      setEditForm((prev) =>
                        prev ? { ...prev, typeId: e.target.value } : prev
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2"
                  >
                    <option value="">Sélectionne un type</option>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nomtype || t.id}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditForm(null)}
                    className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                    className={`px-3 py-2 rounded font-semibold ${
                      savingEdit
                        ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}
                  >
                    {savingEdit ? "Enregistrement..." : "Enregistrer"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </RequireAuth>
  );
}
