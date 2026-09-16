"use client";
import { useEffect, useMemo, useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
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
  preparation?: string[];
  photoUrl?: string | null;
};

const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function MealsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const [prepOpenId, setPrepOpenId] = useState<string | null>(null);
  const [prepDraft, setPrepDraft] = useState<string[]>([]);
  const [newStepText, setNewStepText] = useState("");
  const [draggedStepIndex, setDraggedStepIndex] = useState<number | null>(null);
  const [savingPrep, setSavingPrep] = useState(false);

  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<Record<string, string>>({});

  const [dailyLimit, setDailyLimit] = useState(0);
  const [proteinGoal, setProteinGoal] = useState(0);

  const todayKey = todayISO();
  const [activeSlots, setActiveSlots] = useState<Record<DayMealKey, boolean>>(INITIAL_ACTIVE_SLOTS);

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

          // Créneaux actifs : un override du jour (localStorage) prime sur la
          // préférence permanente définie dans "Info user".
          let overrideForToday: Record<string, boolean> | null = null;
          try {
            const raw = localStorage.getItem(`mealSlotsActive:${todayKey}`);
            if (raw) overrideForToday = JSON.parse(raw);
          } catch {
            // localStorage indisponible
          }
          if (overrideForToday) {
            setActiveSlots({ ...INITIAL_ACTIVE_SLOTS, ...overrideForToday });
          } else if (Array.isArray(dCal.activeMealSlots)) {
            const fromProfile = { ...INITIAL_ACTIVE_SLOTS };
            for (const key of Object.keys(fromProfile) as DayMealKey[]) {
              fromProfile[key] = dCal.activeMealSlots.includes(key);
            }
            setActiveSlots(fromProfile);
          }
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

  async function handlePhotoUpload(id: string, file: File) {
    setPhotoError((s) => ({ ...s, [id]: "" }));
    if (!file.type.startsWith("image/")) {
      setPhotoError((s) => ({ ...s, [id]: "Fichier non supporté" }));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setPhotoError((s) => ({ ...s, [id]: "Image trop lourde (8 Mo max)" }));
      return;
    }
    setUploadingPhotoId(id);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/meals/${id}/photo`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur d'envoi");
      setMeals((ms) => ms.map((m) => (m.id === id ? { ...m, photoUrl: data.photoUrl } : m)));
    } catch (e: any) {
      setPhotoError((s) => ({ ...s, [id]: e.message || "Erreur" }));
    } finally {
      setUploadingPhotoId(null);
    }
  }

  async function handlePhotoRemove(id: string) {
    setUploadingPhotoId(id);
    try {
      const res = await fetch(`/api/meals/${id}/photo`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Erreur");
      setMeals((ms) => ms.map((m) => (m.id === id ? { ...m, photoUrl: null } : m)));
    } catch {
      setPhotoError((s) => ({ ...s, [id]: "Impossible de retirer la photo" }));
    } finally {
      setUploadingPhotoId(null);
    }
  }

  function togglePrep(m: Meal) {
    if (prepOpenId === m.id) {
      setPrepOpenId(null);
      return;
    }
    setPrepOpenId(m.id);
    setPrepDraft(Array.isArray(m.preparation) ? m.preparation : []);
    setNewStepText("");
  }

  function addStep() {
    const text = newStepText.trim();
    if (!text) return;
    setPrepDraft((s) => [...s, text]);
    setNewStepText("");
  }

  function updateStep(idx: number, text: string) {
    setPrepDraft((s) => s.map((step, i) => (i === idx ? text : step)));
  }

  function removeStep(idx: number) {
    setPrepDraft((s) => s.filter((_, i) => i !== idx));
  }

  function moveStep(from: number, to: number) {
    setPrepDraft((s) => {
      const next = [...s];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function savePrep(id: string) {
    const cleanSteps = prepDraft.map((s) => s.trim()).filter(Boolean);
    setSavingPrep(true);
    try {
      const res = await fetch(`/api/meals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ preparation: cleanSteps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erreur");
      setMeals((ms) => ms.map((m) => (m.id === id ? { ...m, preparation: cleanSteps } : m)));
      setPrepOpenId(null);
    } catch (e: any) {
      alert(e.message || "Impossible d'enregistrer la préparation");
    } finally {
      setSavingPrep(false);
    }
  }

  if (loading) return <RequireAuth><div className="min-h-screen bg-gray-900 flex flex-col md:flex-row"><Sidebar /><main className="flex-1 p-6 text-white">Chargement…</main></div></RequireAuth>;
  if (err) return <RequireAuth><div className="min-h-screen bg-gray-900 flex flex-col md:flex-row"><Sidebar /><main className="flex-1 p-6 text-white"><p className="text-red-400">{err}</p></main></div></RequireAuth>;

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-900 text-white flex flex-col md:flex-row">
        <Sidebar />
        <main className="flex-1 px-4 py-6 pb-6">
        <div className="max-w-xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-4">📚 Mes repas</h1>

        <div className="space-y-6">
          {groupedMeals.map(({ key: slotKey, category, meals: catMeals }) => {
            const isActive = slotKey === null ? true : !!activeSlots[slotKey];
            const pct = slotKey === null ? null : Math.round((slotDistribution[slotKey] || 0) * 1000) / 10;
            const targetKcal = slotKey === null || dailyLimit <= 0 ? null : Math.round(dailyLimit * (slotDistribution[slotKey] || 0));
            const targetProt = slotKey === null || proteinGoal <= 0 ? null : Math.round(proteinGoal * (slotDistribution[slotKey] || 0) * 10) / 10;

            return (
            <div key={category}>
              <div className="mb-2 px-1 py-1 border-b border-gray-700 pb-1.5">
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
              {!isActive && slotKey !== null && (
                <p className="text-xs text-gray-600 italic px-1">
                  Repas désactivé aujourd&apos;hui — coche la case pour le réactiver.
                </p>
              )}
              {isActive && (
              <div>
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
              const isEditing = editingId === m.id;

              return (
                <li
                  key={m.id}
                  className="rounded-xl border p-4 space-y-4 bg-gray-800 border-gray-700"
                >
                  {/* Photo */}
                  {(m.photoUrl || isAdmin) && (
                    <div>
                      <div className="relative">
                        {m.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={m.photoUrl}
                            alt={m.name}
                            className="w-full h-64 object-cover rounded-lg"
                          />
                        ) : null}
                        {isAdmin && (
                          <div className={`flex items-center gap-1.5 ${m.photoUrl ? "absolute bottom-1.5 right-1.5" : ""}`}>
                            <label
                              title={m.photoUrl ? "Changer la photo" : "Ajouter une photo"}
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm cursor-pointer transition active:scale-90 ${
                                uploadingPhotoId === m.id
                                  ? "bg-gray-700 opacity-50"
                                  : m.photoUrl
                                  ? "bg-black/50 hover:bg-black/70 backdrop-blur"
                                  : "bg-gray-700 hover:bg-gray-600"
                              }`}
                            >
                              {uploadingPhotoId === m.id ? "…" : "📷"}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={uploadingPhotoId === m.id}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = "";
                                  if (file) handlePhotoUpload(m.id, file);
                                }}
                              />
                            </label>
                            {m.photoUrl && (
                              <button
                                type="button"
                                title="Retirer la photo"
                                onClick={() => handlePhotoRemove(m.id)}
                                disabled={uploadingPhotoId === m.id}
                                className="w-8 h-8 rounded-full bg-black/50 hover:bg-rose-800 backdrop-blur flex items-center justify-center text-sm active:scale-90 transition disabled:opacity-50"
                              >
                                🗑️
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      {photoError[m.id] && (
                        <p className="text-xs text-red-400 mt-1">{photoError[m.id]}</p>
                      )}
                    </div>
                  )}

                  <div className="min-w-0">
                    {isEditing && isAdmin ? (
                      <div className="flex items-center gap-2">
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
                            onClick={() => startEditing(m)}
                            className="text-gray-500 hover:text-gray-300 shrink-0 mt-0.5"
                            aria-label="Renommer le repas"
                          >✏️</button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <a
                      href={`/shopping?ids=${m.id}&p_${m.id}=${m.portions ?? 1}`}
                      title="Modifier repas"
                      className="w-10 h-10 m-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-90 transition flex items-center justify-center text-lg"
                    >📝</a>
                    <button
                      type="button"
                      onClick={() => togglePrep(m)}
                      title="Préparation"
                      className={`w-10 h-10 m-1 rounded-xl active:scale-90 transition flex items-center justify-center text-lg ${
                        prepOpenId === m.id ? "bg-amber-500" : "bg-gray-700 hover:bg-gray-600"
                      }`}
                    >👨‍🍳</button>
                    {isAdmin && (
                      <button
                        onClick={() => onDelete(m.id)}
                        disabled={!!deleting[m.id]}
                        className="w-10 h-10 m-1 rounded-xl bg-rose-700 hover:bg-rose-800 active:scale-90 transition flex items-center justify-center text-lg disabled:opacity-50"
                      >🗑️</button>
                    )}
                  </div>

                  {/* Préparation */}
                  {prepOpenId === m.id && (
                    <div
                      className="rounded-xl bg-amber-950/20 border border-amber-800/50 p-3 space-y-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide">👨‍🍳 Préparation</p>
                      {isAdmin ? (
                        <>
                          {prepDraft.length > 0 && (
                            <ol className="space-y-1.5">
                              {prepDraft.map((step, idx) => (
                                <li
                                  key={idx}
                                  draggable
                                  onDragStart={() => setDraggedStepIndex(idx)}
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={() => {
                                    if (draggedStepIndex !== null && draggedStepIndex !== idx) {
                                      moveStep(draggedStepIndex, idx);
                                    }
                                    setDraggedStepIndex(null);
                                  }}
                                  onDragEnd={() => setDraggedStepIndex(null)}
                                  className={`flex items-center gap-2 bg-gray-900 border rounded-lg px-2 py-1.5 cursor-grab active:cursor-grabbing ${
                                    draggedStepIndex === idx ? "border-amber-500 opacity-50" : "border-gray-700"
                                  }`}
                                >
                                  <span className="text-gray-500 shrink-0 select-none">⠿</span>
                                  <span className="text-amber-400 font-semibold text-sm w-5 text-center shrink-0">{idx + 1}.</span>
                                  <input
                                    value={step}
                                    onChange={(e) => updateStep(idx, e.target.value)}
                                    className="flex-1 min-w-0 bg-transparent text-sm text-white focus:outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeStep(idx)}
                                    className="text-rose-400 hover:text-rose-300 text-sm shrink-0"
                                  >✕</button>
                                </li>
                              ))}
                            </ol>
                          )}
                          <div className="flex items-center gap-2">
                            <input
                              value={newStepText}
                              onChange={(e) => setNewStepText(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStep(); } }}
                              placeholder="Nouvelle étape…"
                              className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
                            />
                            <button
                              type="button"
                              onClick={addStep}
                              className="w-9 h-9 shrink-0 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center"
                            >+</button>
                          </div>
                          <button
                            type="button"
                            onClick={() => savePrep(m.id)}
                            disabled={savingPrep}
                            className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50"
                          >
                            {savingPrep ? "Enregistrement…" : "Enregistrer"}
                          </button>
                        </>
                      ) : m.preparation && m.preparation.length > 0 ? (
                        <ol className="space-y-1 list-decimal list-inside">
                          {m.preparation.map((step, idx) => (
                            <li key={idx} className="text-sm text-gray-200">{step}</li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-sm text-gray-500 italic">Aucune préparation renseignée.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
              </ul>
              )}
              </div>
              )}
            </div>
            );
          })}
          </div>
      </div>
        </main>
      </div>
    </RequireAuth>
  );
}
