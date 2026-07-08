"use client";
import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import RequireAuth from "@/components/RequireAuth";

const MOIS_NOMS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const DEFAULT_KEYWORDS = [
  "Salade", "Fruité", "Légumes", "Froid", "Chaud", "Léger", "Copieux", "Rapide",
];

export default function Accueil() {
  const [idees, setIdees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [disliked, setDisliked] = useState<any[]>([]);
  const [newDisliked, setNewDisliked] = useState("");

  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [customKeywords, setCustomKeywords] = useState<any[]>([]);
  const [newKeyword, setNewKeyword] = useState("");

  const moisActuel = new Date().getMonth() + 1;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/suggest-meals", { credentials: "include" });
        const data = await res.json();
        setIdees(data.idees || []);
      } catch {
        setError("Impossible de charger le cache");
      } finally {
        setLoading(false);
      }
    })();

    fetch("/api/disliked-foods", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setDisliked(Array.isArray(d) ? d : []))
      .catch(() => setDisliked([]));

    fetch("/api/meal-keywords", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setCustomKeywords(Array.isArray(d) ? d : []))
      .catch(() => setCustomKeywords([]));
  }, []);

  function toggleKeyword(word: string) {
    setSelectedKeywords((prev) =>
      prev.includes(word) ? prev.filter((w) => w !== word) : [...prev, word]
    );
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/suggest-meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ keywords: selectedKeywords }),
      });
      const data = await res.json();
      if (Array.isArray(data.idees)) setIdees(data.idees);
      else setError("Réponse inattendue de l'IA");
    } catch {
      setError("Erreur pendant la génération");
    } finally {
      setGenerating(false);
    }
  }

  async function addDisliked() {
    if (!newDisliked.trim()) return;
    try {
      const res = await fetch("/api/disliked-foods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nom: newDisliked.trim() }),
      });
      const data = await res.json();
      setDisliked((d) => [...d, data]);
      setNewDisliked("");
    } catch {
      setError("Impossible d'ajouter cet aliment");
    }
  }

  async function removeDisliked(id: string) {
    try {
      await fetch(`/api/disliked-foods/${id}`, { method: "DELETE", credentials: "include" });
      setDisliked((d) => d.filter((x) => x.id !== id));
    } catch {
      setError("Impossible de supprimer cet aliment");
    }
  }

  async function addKeyword() {
    if (!newKeyword.trim()) return;
    try {
      const res = await fetch("/api/meal-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label: newKeyword.trim() }),
      });
      const data = await res.json();
      setCustomKeywords((k) => [...k, data]);
      setNewKeyword("");
    } catch {
      setError("Impossible d'ajouter ce mot-clé");
    }
  }

  async function removeKeyword(id: string, label: string) {
    try {
      await fetch(`/api/meal-keywords/${id}`, { method: "DELETE", credentials: "include" });
      setCustomKeywords((k) => k.filter((x) => x.id !== id));
      setSelectedKeywords((prev) => prev.filter((w) => w !== label));
    } catch {
      setError("Impossible de supprimer ce mot-clé");
    }
  }

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-900 flex flex-col md:flex-row">
        <Sidebar />
        <main className="flex-1 p-6 md:pt-10 md:p-10 max-w-4xl mx-auto w-full">
          <p className="text-gray-400 text-sm mb-1">{MOIS_NOMS[moisActuel - 1]}</p>
          <h2 className="text-2xl font-bold text-white mb-1">Idées de repas de saison</h2>
          <p className="text-gray-400 text-sm mb-6">Choisis un style, puis génère tes idées du jour.</p>

          {/* Sélection des mots-clés */}
          <div className="mb-6 rounded-2xl bg-gray-800 border border-gray-700 p-4">
            <p className="text-sm text-gray-400 mb-3">Style de repas (optionnel)</p>

            <div className="flex flex-wrap gap-2 mb-3">
              {DEFAULT_KEYWORDS.map((word) => (
                <button
                  key={word}
                  onClick={() => toggleKeyword(word)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    selectedKeywords.includes(word)
                      ? "bg-blue-600 text-white"
                      : "bg-gray-900 text-gray-400 border border-gray-700 hover:border-gray-600"
                  }`}
                >
                  {word}
                </button>
              ))}

              {customKeywords.map((kw) => (
                <button
                  key={kw.id}
                  onClick={() => toggleKeyword(kw.label)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                    selectedKeywords.includes(kw.label)
                      ? "bg-blue-600 text-white"
                      : "bg-gray-900 text-gray-400 border border-gray-700 hover:border-gray-600"
                  }`}
                >
                  {kw.label}
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      removeKeyword(kw.id, kw.label);
                    }}
                    className="text-rose-400 hover:text-rose-300"
                  >
                    ✕
                  </span>
                </button>
              ))}
            </div>

            <div className="flex gap-2 mb-4">
              <input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                placeholder="ex: saumon, pignon de pin…"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
              <button
                onClick={addKeyword}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm"
              >
                Ajouter
              </button>
            </div>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition disabled:opacity-50"
            >
              {generating ? "Génération…" : "🔄 Générer mes idées"}
            </button>
          </div>

          {loading && <p className="text-gray-500">Chargement…</p>}
          {error && <p className="text-rose-400 mb-4">{error}</p>}

          {!loading && idees.length === 0 && !error && (
            <p className="text-gray-400 text-center py-8">
              Choisis un style ci-dessus (ou pas) et clique sur générer.
            </p>
          )}

          {idees.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {idees.map((idee, i) => (
                <div key={i} className="rounded-2xl overflow-hidden bg-gray-800 border border-gray-700">
                  <div className={`h-32 bg-gradient-to-br ${idee.gradient} flex items-center justify-center text-6xl`}>
                    {idee.emoji}
                  </div>
                  <div className="p-4 space-y-2">
                    <h3 className="text-white font-semibold">{idee.nom}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {idee.ingredients?.map((ing: any, j: number) => (
                        <span
                          key={j}
                          className="text-xs bg-gray-900 border border-gray-700 rounded-full px-2.5 py-1 text-gray-300"
                        >
                          {typeof ing === "string" ? ing : ing?.nom}
                        </span>
                      ))}
                    </div>
                    <p className="text-gray-500 text-xs pt-1">~{idee.kcalApprox} kcal</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-10 rounded-2xl bg-gray-800 border border-gray-700 p-4">
            <h3 className="text-white font-semibold mb-3">🚫 Aliments que je n'aime pas</h3>
            <div className="flex gap-2 mb-3">
              <input
                value={newDisliked}
                onChange={(e) => setNewDisliked(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addDisliked()}
                placeholder="ex: œufs, champignons…"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              />
              <button
                onClick={addDisliked}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm"
              >
                Ajouter
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {disliked.map((item) => (
                <span
                  key={item.id}
                  className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-full px-3 py-1 text-sm text-gray-300"
                >
                  {item.nom}
                  <button onClick={() => removeDisliked(item.id)} className="text-rose-400 hover:text-rose-300">
                    ✕
                  </button>
                </span>
              ))}
              {disliked.length === 0 && (
                <p className="text-gray-500 text-sm">Aucun aliment exclu pour l'instant.</p>
              )}
            </div>
          </div>
        </main>
      </div>
    </RequireAuth>
  );
}