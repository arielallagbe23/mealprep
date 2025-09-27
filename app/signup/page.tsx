"use client";
import { useState } from "react";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          nickname,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || data?.message || "Erreur");
      setMsg("✅ Compte créé avec succès, vous pouvez vous connecter !");
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6">
      <div className="w-full max-w-sm p-6 rounded-xl bg-white dark:bg-gray-800 shadow-md space-y-6">
        <h1 className="text-2xl font-bold text-center text-gray-800 dark:text-white">
          Inscription
        </h1>

        <form onSubmit={handleSignup} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 
                       bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Pseudo (optionnel)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 
                       bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            placeholder="Mot de passe (min 8 caractères)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 
                       bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-lg font-semibold text-white transition ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {loading ? "Création..." : "Créer le compte"}
          </button>
        </form>

        {msg && (
          <p className="text-center text-sm text-red-600 dark:text-red-400">{msg}</p>
        )}

        <p className="text-center text-sm text-gray-600 dark:text-gray-300">
          Déjà inscrit ?{" "}
          <a
            href="/login"
            className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Se connecter
          </a>
        </p>
      </div>
    </main>
  );
}
