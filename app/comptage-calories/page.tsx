"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
import { useAuth } from "@/components/useAuth";
import { DAY_MEAL_SLOTS, type DayMealKey } from "@/app/composer/constants";

// ─── Types ───────────────────────────────────────────────────────────────────

type LimitRecord = { limitCalories: number; effectiveDate: string };
type DayEntry = { calories: number; proteines: number };
type TdeeProfile = {
  sex: "homme" | "femme";
  age: number;
  heightCm: number;
  activity: ActivityKey;
  mode: "deficit" | "date";
  deficitPerDay?: number;
  targetWeight?: number;
  targetDate?: string;
  proteinPerKg?: number;
};
type CalorieData = {
  entries: Record<string, DayEntry>;
  dailyLimit: number;
  limitHistory: LimitRecord[];
  dailyProteinGoal: number;
  activeMealSlots: DayMealKey[];
  tdeeProfile: TdeeProfile | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split("T")[0];

const ACTIVITY_LEVELS = [
  { key: "sedentaire", label: "Sédentaire", desc: "Peu ou pas de sport", factor: 1.2 },
  { key: "leger", label: "Léger", desc: "1–3 séances / sem.", factor: 1.375 },
  { key: "modere", label: "Modéré", desc: "3–5 séances / sem.", factor: 1.55 },
  { key: "intense", label: "Intense", desc: "6–7 séances / sem.", factor: 1.725 },
  { key: "tres_intense", label: "Très intense", desc: "Travail + sport", factor: 1.9 },
] as const;
type ActivityKey = (typeof ACTIVITY_LEVELS)[number]["key"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateLong(dateKey: string) {
  return new Date(dateKey + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function latestWeightEntry(entries: Record<string, number>) {
  const dateKeys = Object.keys(entries).sort((a, b) => b.localeCompare(a));
  if (dateKeys.length === 0) return null;
  return { dateKey: dateKeys[0], weight: entries[dateKeys[0]] };
}

function tdeeDraftKey(uid: string) {
  return `mpc:tdeeDraft:${uid}`;
}

// Mifflin-St Jeor + facteur d'activité, appliqué au poids fourni (le poids
// le plus récent). Utilisé à la fois par le calculateur et par le
// réajustement automatique déclenché à chaque nouveau poids enregistré.
function computeFromProfile(profile: TdeeProfile, weight: number, todayISO: string) {
  const bmr =
    profile.sex === "homme"
      ? 10 * weight + 6.25 * profile.heightCm - 5 * profile.age + 5
      : 10 * weight + 6.25 * profile.heightCm - 5 * profile.age - 161;
  const factor = ACTIVITY_LEVELS.find((a) => a.key === profile.activity)?.factor ?? 1.2;
  const tdee = bmr * factor;

  let deficitPerDay = 0;
  let daysRemaining: number | null = null;

  if (profile.mode === "deficit") {
    deficitPerDay = profile.deficitPerDay ?? 0;
  } else if (profile.targetWeight !== undefined && profile.targetDate) {
    const remainingKg = Math.max(0, weight - profile.targetWeight);
    const msPerDay = 24 * 60 * 60 * 1000;
    const days = Math.max(
      1,
      Math.round(
        (new Date(profile.targetDate + "T00:00:00").getTime() - new Date(todayISO + "T00:00:00").getTime()) / msPerDay,
      ),
    );
    daysRemaining = days;
    deficitPerDay = (remainingKg * 7700) / days;
  }

  const dailyTarget = Math.round(tdee - deficitPerDay);
  const proteinTarget = profile.proteinPerKg ? Math.round(weight * profile.proteinPerKg) : null;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    deficitPerDay: Math.round(deficitPerDay),
    daysRemaining,
    dailyTarget,
    proteinTarget,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ComptageCalories() {
  const { user } = useAuth();

  const [data, setData] = useState<CalorieData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add entry form
  const [addDate, setAddDate] = useState(TODAY);
  const [addCal, setAddCal] = useState("");
  const [addProt, setAddProt] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // État de sauvegarde de la limite (manuel via le calculateur TDEE, ou
  // automatique à chaque nouveau poids enregistré)
  const [limitLoading, setLimitLoading] = useState(false);

  // Repas mangés (créneaux actifs par défaut)
  const [mealSlots, setMealSlots] = useState<DayMealKey[]>([]);
  const [mealSlotsMsg, setMealSlotsMsg] = useState("");

  // Calculateur TDEE
  const [tdeeMode, setTdeeMode] = useState<"deficit" | "date">("date");
  const [tdeeSex, setTdeeSex] = useState<"homme" | "femme">("homme");
  const [tdeeActivity, setTdeeActivity] = useState<ActivityKey>("leger");
  const [tdeeAge, setTdeeAge] = useState("");
  const [tdeeHeight, setTdeeHeight] = useState("");
  const [tdeeWeight, setTdeeWeight] = useState("");
  const [tdeeDeficit, setTdeeDeficit] = useState("");
  const [tdeeGoalKg, setTdeeGoalKg] = useState("");
  const [tdeeTargetDate, setTdeeTargetDate] = useState("");
  const [tdeeProteinPerKg, setTdeeProteinPerKg] = useState("");
  const [tdeeResult, setTdeeResult] = useState<{
    bmr: number;
    tdee: number;
    deficitPerDay: number;
    dailyTarget: number;
    daysRemaining: number | null;
    proteinTarget: number | null;
  } | null>(null);
  const [tdeeError, setTdeeError] = useState("");
  const [tdeeApplyMsg, setTdeeApplyMsg] = useState("");
  const [tdeePrefilled, setTdeePrefilled] = useState(false);
  const [tdeeDraftLoaded, setTdeeDraftLoaded] = useState(false);

  // Suivi de poids
  const [weightEntries, setWeightEntries] = useState<Record<string, number>>({});
  const [addWeightDate, setAddWeightDate] = useState(TODAY);
  const [addWeightVal, setAddWeightVal] = useState("");
  const [addWeightMsg, setAddWeightMsg] = useState("");
  const [addWeightLoading, setAddWeightLoading] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────

  async function loadData() {
    try {
      setError("");
      const res = await fetch("/api/calories", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        setError("Connexion requise");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Erreur ${res.status}`);
      }
      const d: CalorieData = await res.json();
      setData(d);
      setMealSlots(d.activeMealSlots ?? DAY_MEAL_SLOTS.map((s) => s.key));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  async function loadWeightEntries() {
    try {
      const res = await fetch("/api/weight", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setWeightEntries(json.entries ?? {});
    } catch {
      // best-effort
    }
  }

  useEffect(() => {
    loadData();
    loadWeightEntries();
  }, []);

  // Pré-remplit le calculateur avec le profil déjà enregistré (une seule
  // fois, pour ne pas écraser une saisie en cours de l'utilisateur).
  useEffect(() => {
    if (tdeePrefilled || !data?.tdeeProfile) return;
    const p = data.tdeeProfile;
    setTdeeSex(p.sex);
    setTdeeActivity(p.activity);
    setTdeeMode(p.mode);
    setTdeeAge(String(p.age));
    setTdeeHeight(String(p.heightCm));
    if (p.proteinPerKg) setTdeeProteinPerKg(String(p.proteinPerKg));
    const latestWeight = latestWeightEntry(weightEntries);
    if (latestWeight) setTdeeWeight(String(latestWeight.weight));
    if (p.mode === "deficit") {
      setTdeeDeficit(String(p.deficitPerDay ?? ""));
    } else {
      setTdeeTargetDate(p.targetDate ?? "");
      if (p.targetWeight !== undefined && latestWeight) {
        setTdeeGoalKg(String(Math.max(0, r1(latestWeight.weight - p.targetWeight))));
      }
    }
    setTdeePrefilled(true);
  }, [data, weightEntries, tdeePrefilled]);

  // Restaure une saisie en cours non encore appliquée (brouillon local,
  // par navigateur) — prioritaire sur le pré-remplissage depuis le profil
  // enregistré, puisqu'elle est plus récente.
  useEffect(() => {
    if (!user?.uid || tdeeDraftLoaded) return;
    try {
      const raw = localStorage.getItem(tdeeDraftKey(user.uid));
      if (raw) {
        const d = JSON.parse(raw);
        if (d.mode) setTdeeMode(d.mode);
        if (d.sex) setTdeeSex(d.sex);
        if (d.activity) setTdeeActivity(d.activity);
        if (typeof d.age === "string") setTdeeAge(d.age);
        if (typeof d.height === "string") setTdeeHeight(d.height);
        if (typeof d.weight === "string") setTdeeWeight(d.weight);
        if (typeof d.deficit === "string") setTdeeDeficit(d.deficit);
        if (typeof d.goalKg === "string") setTdeeGoalKg(d.goalKg);
        if (typeof d.targetDate === "string") setTdeeTargetDate(d.targetDate);
        if (typeof d.proteinPerKg === "string") setTdeeProteinPerKg(d.proteinPerKg);
        setTdeePrefilled(true); // n'écrase pas ce brouillon avec le profil serveur
      }
    } catch {
      // brouillon corrompu ou localStorage indisponible — tant pis
    } finally {
      setTdeeDraftLoaded(true);
    }
  }, [user?.uid, tdeeDraftLoaded]);

  // Sauvegarde le brouillon à chaque frappe, pour ne rien perdre si la page
  // est rechargée avant d'avoir cliqué "Calculer" / "Appliquer".
  useEffect(() => {
    if (!user?.uid || !tdeeDraftLoaded) return;
    try {
      localStorage.setItem(
        tdeeDraftKey(user.uid),
        JSON.stringify({
          mode: tdeeMode,
          sex: tdeeSex,
          activity: tdeeActivity,
          age: tdeeAge,
          height: tdeeHeight,
          weight: tdeeWeight,
          deficit: tdeeDeficit,
          goalKg: tdeeGoalKg,
          targetDate: tdeeTargetDate,
          proteinPerKg: tdeeProteinPerKg,
        }),
      );
    } catch {
      // localStorage indisponible (navigation privée...) — le brouillon ne persistera juste pas
    }
  }, [
    user?.uid,
    tdeeDraftLoaded,
    tdeeMode,
    tdeeSex,
    tdeeActivity,
    tdeeAge,
    tdeeHeight,
    tdeeWeight,
    tdeeDeficit,
    tdeeGoalKg,
    tdeeTargetDate,
    tdeeProteinPerKg,
  ]);

  function clearTdeeDraft() {
    if (!user?.uid) return;
    try {
      localStorage.removeItem(tdeeDraftKey(user.uid));
    } catch {
      // ignore
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleAddEntry(e: FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    setAddMsg("");
    try {
      const body: Record<string, unknown> = {
        dateKey: addDate,
        calories: Number(addCal),
      };
      if (addProt.trim() !== "") body.proteines = Number(addProt);

      const res = await fetch("/api/calories/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      setAddMsg(
        `Ajouté. Total ${fmtDateLong(addDate)} : ${json.calories} kcal${json.proteines ? ` · ${json.proteines} g prot.` : ""}`,
      );
      setAddCal("");
      setAddProt("");
      await loadData();
    } catch (err: unknown) {
      setAddMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleDeleteDate(dateKey: string) {
    if (!confirm(`Supprimer l'entrée du ${fmtDateLong(dateKey)} ?`)) return;
    await fetch(`/api/calories/entry?dateKey=${dateKey}`, {
      method: "DELETE",
      credentials: "include",
    });
    await loadData();
  }

  function buildTdeeProfile(weight: number): TdeeProfile {
    const profile: TdeeProfile = {
      sex: tdeeSex,
      age: Number(tdeeAge),
      heightCm: Number(tdeeHeight),
      activity: tdeeActivity,
      mode: tdeeMode,
    };
    if (tdeeMode === "deficit") {
      profile.deficitPerDay = Number(tdeeDeficit) || 0;
    } else {
      profile.targetWeight = r1(weight - Number(tdeeGoalKg));
      profile.targetDate = tdeeTargetDate;
    }
    if (tdeeProteinPerKg.trim() !== "") profile.proteinPerKg = Number(tdeeProteinPerKg);
    return profile;
  }

  function handleTdeeCalculate(e: FormEvent) {
    e.preventDefault();
    setTdeeError("");
    setTdeeResult(null);
    setTdeeApplyMsg("");

    const age = Number(tdeeAge);
    const height = Number(tdeeHeight);
    const weight = Number(tdeeWeight);
    if (!age || !height || !weight || age <= 0 || height <= 0 || weight <= 0) {
      setTdeeError("Renseigne un âge, une taille et un poids valides.");
      return;
    }
    if (tdeeMode === "date") {
      const goalKg = Number(tdeeGoalKg);
      if (!goalKg || goalKg <= 0 || !tdeeTargetDate) {
        setTdeeError("Renseigne un objectif (kg) et une date butoir.");
        return;
      }
      if (new Date(tdeeTargetDate + "T00:00:00").getTime() <= new Date(TODAY + "T00:00:00").getTime()) {
        setTdeeError("La date butoir doit être dans le futur.");
        return;
      }
    }

    const result = computeFromProfile(buildTdeeProfile(weight), weight, TODAY);
    if (result.dailyTarget <= 0) {
      setTdeeError("Le déficit calculé dépasse tes besoins caloriques — revois l'objectif ou la date.");
      return;
    }
    setTdeeResult(result);
  }

  function handleTdeeReset() {
    setTdeeMode("date");
    setTdeeSex("homme");
    setTdeeActivity("leger");
    setTdeeAge("");
    setTdeeHeight("");
    setTdeeWeight("");
    setTdeeDeficit("");
    setTdeeGoalKg("");
    setTdeeTargetDate("");
    setTdeeProteinPerKg("");
    setTdeeResult(null);
    setTdeeError("");
    setTdeeApplyMsg("");
    clearTdeeDraft();
  }

  // Enregistre le résultat comme limite/objectif du jour ET sauvegarde le
  // profil TDEE — c'est ce profil qui permettra le réajustement automatique
  // à chaque nouveau poids enregistré ci-dessous.
  async function handleApplyTdeeResult() {
    if (!tdeeResult) return;
    setLimitLoading(true);
    setTdeeApplyMsg("");
    try {
      const weight = Number(tdeeWeight);
      const body: Record<string, unknown> = {
        limitCalories: tdeeResult.dailyTarget,
        effectiveDate: TODAY,
        tdeeProfile: buildTdeeProfile(weight),
      };
      if (tdeeResult.proteinTarget !== null) body.dailyProteinGoal = tdeeResult.proteinTarget;

      const res = await fetch("/api/calories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      setTdeeApplyMsg(
        `✅ Appliqué : ${json.dailyLimit} kcal${tdeeResult.proteinTarget !== null ? ` · ${json.dailyProteinGoal} g prot.` : ""}. Le suivi automatique est activé : ça se réajustera à chaque nouveau poids enregistré aujourd'hui.`,
      );
      clearTdeeDraft(); // appliqué : le profil serveur fait foi désormais, plus besoin du brouillon local
      await loadData();
    } catch (err: unknown) {
      setTdeeApplyMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLimitLoading(false);
    }
  }

  async function handleAddWeight(e: FormEvent) {
    e.preventDefault();
    setAddWeightLoading(true);
    setAddWeightMsg("");
    try {
      const weight = Number(addWeightVal);
      if (!Number.isFinite(weight) || weight <= 0) throw new Error("Poids invalide");

      const res = await fetch("/api/weight/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ dateKey: addWeightDate, weight }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");

      let msg = `Poids enregistré : ${weight} kg le ${fmtDateLong(addWeightDate)}.`;

      // Réajustement auto uniquement quand on log le poids du jour (pas un
      // backfill) — c'est le seul cas où "poids actuel" a du sens.
      if (data?.tdeeProfile && addWeightDate === TODAY) {
        const result = computeFromProfile(data.tdeeProfile, weight, TODAY);
        if (result.dailyTarget > 0) {
          const applyBody: Record<string, unknown> = {
            limitCalories: result.dailyTarget,
            effectiveDate: TODAY,
          };
          if (result.proteinTarget !== null) applyBody.dailyProteinGoal = result.proteinTarget;
          const res2 = await fetch("/api/calories", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(applyBody),
          });
          const json2 = await res2.json();
          if (res2.ok) {
            msg += ` 🔁 Réajusté automatiquement : ${json2.dailyLimit} kcal${result.proteinTarget !== null ? ` · ${json2.dailyProteinGoal} g prot.` : ""}`;
          }
        }
      }

      setAddWeightMsg(msg);
      setAddWeightVal("");
      await Promise.all([loadData(), loadWeightEntries()]);
    } catch (err: unknown) {
      setAddWeightMsg(err instanceof Error ? err.message : "Erreur");
    } finally {
      setAddWeightLoading(false);
    }
  }

  async function handleDeleteWeight(dateKey: string) {
    if (!confirm(`Supprimer le poids du ${fmtDateLong(dateKey)} ?`)) return;
    await fetch(`/api/weight/entry?dateKey=${dateKey}`, {
      method: "DELETE",
      credentials: "include",
    });
    await loadWeightEntries();
  }

  async function toggleMealSlot(key: DayMealKey) {
    const next = mealSlots.includes(key)
      ? mealSlots.filter((k) => k !== key)
      : [...mealSlots, key];
    if (next.length === 0) return; // au moins un créneau actif
    setMealSlots(next);
    setMealSlotsMsg("");
    try {
      const res = await fetch("/api/calories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ activeMealSlots: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erreur");
      setMealSlotsMsg("Préférence enregistrée ✅");
    } catch (err: unknown) {
      setMealSlotsMsg(err instanceof Error ? err.message : "Erreur");
      setMealSlots(mealSlots); // revert
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-900 flex flex-col md:flex-row">
        <Sidebar />
        <main className="flex-1 px-4 py-8 text-white">
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Header */}
          <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-green-400 mb-1">
              Comptage Calories & Protéines
            </p>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Objectifs & ajout manuel
                </h1>
                <p className="text-sm text-gray-400 mt-1">
                  Date du jour :{" "}
                  <span className="font-semibold text-white">
                    {fmtDateLong(TODAY)}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {user?.email && (
                  <span className="text-sm text-gray-300 truncate max-w-full">{user.email}</span>
                )}
                <Link
                  href="/performance"
                  className="rounded-lg border border-gray-600 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 transition whitespace-nowrap"
                >
                  ← Retour
                </Link>
              </div>
            </div>
          </div>

          {loading && (
            <p className="text-gray-400 text-sm text-center py-8">
              Chargement…
            </p>
          )}

          {error && (
            <div className="rounded-xl border border-red-700 bg-red-900/30 p-4 text-red-300 text-sm">
              {error}
            </div>
          )}

          {data && (
            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5 space-y-3">
              <h2 className="font-semibold text-white">
                Repas que tu manges
              </h2>
              <p className="text-xs text-gray-500">
                Dis une fois pour toutes quels créneaux tu manges dans la journée — ça devient le réglage par défaut sur "Mes repas" et le composer, plus besoin de recocher à chaque fois.
              </p>
              <div className="flex flex-wrap gap-2">
                {DAY_MEAL_SLOTS.map((slot) => {
                  const active = mealSlots.includes(slot.key);
                  return (
                    <button
                      key={slot.key}
                      type="button"
                      onClick={() => toggleMealSlot(slot.key)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border transition ${
                        active
                          ? "bg-blue-600 border-blue-500 text-white"
                          : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      {active ? "✓ " : ""}{slot.label}
                    </button>
                  );
                })}
              </div>
              {mealSlotsMsg && (
                <p className="text-xs text-gray-400">{mealSlotsMsg}</p>
              )}
            </div>
          )}

          {data && (
            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-semibold text-white">Poids</h2>
                {data.tdeeProfile ? (
                  <span className="text-xs text-green-400">🔁 Réajustement automatique activé</span>
                ) : (
                  <span className="text-xs text-gray-500">Configure le calculateur TDEE ci-dessous pour l&apos;activer</span>
                )}
              </div>

              {(() => {
                const latest = latestWeightEntry(weightEntries);
                return latest ? (
                  <p className="text-sm text-gray-300">
                    Dernier poids enregistré :{" "}
                    <span className="font-semibold text-white">{latest.weight} kg</span>{" "}
                    <span className="text-gray-500">({fmtDateLong(latest.dateKey)})</span>
                  </p>
                ) : (
                  <p className="text-sm text-gray-500">Aucun poids enregistré pour l&apos;instant.</p>
                );
              })()}

              <form onSubmit={handleAddWeight} className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Date</label>
                  <input
                    type="date"
                    value={addWeightDate}
                    onChange={(e) => setAddWeightDate(e.target.value)}
                    className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Poids (kg)</label>
                  <input
                    type="number"
                    min="1"
                    step="0.1"
                    value={addWeightVal}
                    onChange={(e) => setAddWeightVal(e.target.value)}
                    placeholder="Ex: 96.4"
                    required
                    className="w-28 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={addWeightLoading}
                  className="rounded-lg bg-green-500 hover:bg-green-600 disabled:bg-gray-600 px-4 py-2 text-sm font-semibold text-gray-900 transition"
                >
                  {addWeightLoading ? "…" : "Enregistrer"}
                </button>
              </form>
              {addWeightMsg && <p className="text-xs text-gray-400">{addWeightMsg}</p>}

              {Object.keys(weightEntries).length > 0 && (
                <div className="border-t border-gray-700 pt-3 space-y-1 max-h-40 overflow-y-auto">
                  {Object.keys(weightEntries)
                    .sort((a, b) => b.localeCompare(a))
                    .slice(0, 10)
                    .map((dateKey) => (
                      <div key={dateKey} className="flex items-center justify-between text-sm">
                        <span className="text-gray-400">{fmtDateLong(dateKey)}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-white">{weightEntries[dateKey]} kg</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteWeight(dateKey)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {data && (
            <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5 space-y-4">
              <h2 className="font-semibold text-white">
                Calculateur de calories (TDEE)
              </h2>

              <form onSubmit={handleTdeeCalculate} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { key: "deficit", label: "Déficit manuel" },
                        { key: "date", label: "Objectif par date" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setTdeeMode(m.key)}
                        className={`rounded-lg px-3 py-2 text-sm font-medium border transition ${
                          tdeeMode === m.key
                            ? "bg-blue-500 border-blue-400 text-white"
                            : "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-600"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Sexe</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { key: "homme", label: "Homme" },
                        { key: "femme", label: "Femme" },
                      ] as const
                    ).map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setTdeeSex(s.key)}
                        className={`rounded-lg px-3 py-2 text-sm font-medium border transition ${
                          tdeeSex === s.key
                            ? "bg-blue-500 border-blue-400 text-white"
                            : "bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-600"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Activité</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ACTIVITY_LEVELS.map((a) => (
                      <button
                        key={a.key}
                        type="button"
                        onClick={() => setTdeeActivity(a.key)}
                        className={`rounded-lg px-3 py-2 text-left border transition ${
                          tdeeActivity === a.key
                            ? "bg-blue-950/40 border-blue-400"
                            : "bg-gray-900 border-gray-700 hover:border-gray-600"
                        }`}
                      >
                        <div className="text-sm text-white">{a.label}</div>
                        <div className="text-xs text-gray-500">{a.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Âge</label>
                    <input
                      type="number"
                      min="1"
                      value={tdeeAge}
                      onChange={(e) => setTdeeAge(e.target.value)}
                      placeholder="ans"
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Taille</label>
                    <input
                      type="number"
                      min="1"
                      value={tdeeHeight}
                      onChange={(e) => setTdeeHeight(e.target.value)}
                      placeholder="cm"
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Poids</label>
                    <input
                      type="number"
                      min="1"
                      value={tdeeWeight}
                      onChange={(e) => setTdeeWeight(e.target.value)}
                      placeholder="kg"
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
                    />
                    {(() => {
                      const latest = latestWeightEntry(weightEntries);
                      return latest ? (
                        <button
                          type="button"
                          onClick={() => setTdeeWeight(String(latest.weight))}
                          className="mt-1 text-xs text-blue-400 hover:text-blue-300"
                        >
                          Utiliser {latest.weight} kg
                        </button>
                      ) : null;
                    })()}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 mb-1">
                    Objectif protéines (g/kg de poids){" "}
                    <span className="text-gray-600">— optionnel</span>
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={tdeeProteinPerKg}
                    onChange={(e) => setTdeeProteinPerKg(e.target.value)}
                    placeholder="Ex: 2 (laisser vide pour ne pas toucher aux protéines)"
                    className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
                  />
                </div>

                {tdeeMode === "deficit" ? (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Déficit calorique quotidien (kcal)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={tdeeDeficit}
                      onChange={(e) => setTdeeDeficit(e.target.value)}
                      placeholder="Ex: 500"
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-3 space-y-2">
                    <p className="text-xs text-gray-400">Objectif : perdre X kg avant une date</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Objectif</label>
                        <input
                          type="number"
                          min="0.1"
                          step="0.1"
                          value={tdeeGoalKg}
                          onChange={(e) => setTdeeGoalKg(e.target.value)}
                          placeholder="kg"
                          className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Date butoir</label>
                        <input
                          type="date"
                          value={tdeeTargetDate}
                          onChange={(e) => setTdeeTargetDate(e.target.value)}
                          className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">Calcul basé sur 7700 kcal par kg.</p>
                  </div>
                )}

                {tdeeError && (
                  <p className="text-xs text-red-400">{tdeeError}</p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleTdeeReset}
                    className="flex-1 rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition"
                  >
                    Réinitialiser
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-blue-500 hover:bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition"
                  >
                    Calculer
                  </button>
                </div>
              </form>

              {tdeeResult && (
                <div className="rounded-xl border border-green-700 bg-green-900/20 p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-gray-400">Métabolisme de base</div>
                    <div className="text-white text-right">{tdeeResult.bmr} kcal</div>
                    <div className="text-gray-400">Maintenance (TDEE)</div>
                    <div className="text-white text-right">{tdeeResult.tdee} kcal</div>
                    <div className="text-gray-400">
                      Déficit/jour{tdeeResult.daysRemaining ? ` (sur ${tdeeResult.daysRemaining} j)` : ""}
                    </div>
                    <div className="text-white text-right">{tdeeResult.deficitPerDay} kcal</div>
                  </div>
                  <div className="border-t border-green-800 pt-2 flex items-center justify-between">
                    <span className="text-sm text-gray-300">Objectif calories / jour</span>
                    <span className="text-lg font-bold text-green-400">{tdeeResult.dailyTarget} kcal</span>
                  </div>
                  {tdeeResult.proteinTarget !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">Objectif protéines / jour</span>
                      <span className="text-lg font-bold text-blue-400">{tdeeResult.proteinTarget} g</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleApplyTdeeResult}
                    disabled={limitLoading}
                    className="w-full rounded-lg bg-green-500 hover:bg-green-600 disabled:bg-gray-600 px-4 py-2 text-sm font-semibold text-gray-900 transition"
                  >
                    {limitLoading ? "…" : "✅ Appliquer et activer le réajustement automatique"}
                  </button>
                  {tdeeApplyMsg && <p className="text-xs text-gray-400">{tdeeApplyMsg}</p>}
                </div>
              )}
            </div>
          )}

          {data && (
            <div className="space-y-4">
              {/* Ajout repas */}
              <div className="rounded-2xl border border-gray-700 bg-gray-800 p-5 space-y-4">
                <h2 className="font-semibold text-white">
                  Ajout repas{" "}
                  <span className="text-gray-400 font-normal text-sm">
                    (cumul par jour)
                  </span>
                </h2>

                <form onSubmit={handleAddEntry} className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={addDate}
                      onChange={(e) => setAddDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Calories (kcal)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={addCal}
                      onChange={(e) => setAddCal(e.target.value)}
                      placeholder="Ex: 650"
                      required
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Protéines (g){" "}
                      <span className="text-gray-600">— optionnel</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={addProt}
                      onChange={(e) => setAddProt(e.target.value)}
                      placeholder="Ex: 45"
                      className="w-full rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={addLoading}
                      className="flex-1 rounded-lg bg-green-500 hover:bg-green-600 disabled:bg-gray-600 px-4 py-2 text-sm font-semibold text-gray-900 transition"
                    >
                      {addLoading ? "…" : "Ajouter ce repas"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDate(addDate)}
                      className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition"
                    >
                      Supprimer la date
                    </button>
                  </div>
                </form>

                {addMsg && <p className="text-xs text-gray-400">{addMsg}</p>}
                <p className="text-xs text-gray-500">
                  Chaque ajout augmente le total de la date sélectionnée.
                </p>
              </div>
            </div>
          )}
        </div>
        </main>
      </div>
    </RequireAuth>
  );
}
