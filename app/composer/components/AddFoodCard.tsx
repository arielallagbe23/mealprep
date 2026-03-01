"use client";

import { useState, type FormEvent } from "react";
import type { FoodType } from "../types";

type Props = {
  foodTypes: FoodType[];
  onCreateFood: (payload: {
    nom: string;
    caloriesPer100g: number;
    typeId: string;
  }) => Promise<unknown>;
};

export default function AddFoodCard({ foodTypes, onCreateFood }: Props) {
  const [nom, setNom] = useState("");
  const [calories, setCalories] = useState("");
  const [typeId, setTypeId] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);

    const cleanNom = nom.trim();
    const kcal = Number(calories);
    if (!cleanNom) {
      setErr("Nom requis");
      return;
    }
    if (!Number.isFinite(kcal) || kcal < 0) {
      setErr("Calories invalides");
      return;
    }
    if (!typeId) {
      setErr("Type requis");
      return;
    }

    try {
      setSaving(true);
      await onCreateFood({
        nom: cleanNom,
        caloriesPer100g: kcal,
        typeId,
      });
      setNom("");
      setCalories("");
      setTypeId("");
      setMsg("Aliment ajouté");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erreur serveur";
      setErr(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800 shadow-sm">
      <h2 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-300">
        Ajouter un aliment
      </h2>

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Nom (ex: Haricot vert)"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
        />
        <input
          value={calories}
          onChange={(e) => setCalories(e.target.value)}
          type="number"
          min="0"
          step="1"
          placeholder="Calories / 100g"
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
        />
        <select
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
        >
          <option value="">Type d&apos;aliment</option>
          {foodTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.nomtype || type.id}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={saving}
          className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {saving ? "Ajout..." : "Ajouter l'aliment"}
        </button>
      </form>

      {msg ? <p className="mt-2 text-sm text-emerald-600">{msg}</p> : null}
      {err ? <p className="mt-2 text-sm text-rose-600">{err}</p> : null}
    </section>
  );
}
