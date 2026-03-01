"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type TokenPayload = {
  token?: string;
  error?: string;
  message?: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erreur";
}

const TOKEN_LOGIN_ENDPOINT = "/api/calorie-auth/login";
const TOKEN_COOKIE_ENDPOINT = "/api/calorie-auth/token";

export default function CalorieTokenPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch(TOKEN_COOKIE_ENDPOINT, {
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok) return;

        const data: TokenPayload = await res.json();
        if (!alive) return;
        if (data.token) {
          setMsg("Connexion réussi");
        }
      } catch {
        if (!alive) return;
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    try {
      const res = await fetch(TOKEN_LOGIN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      const data: TokenPayload = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || "Connexion impossible");
      }

      setMsg("Connexion réussi");
    } catch (err: unknown) {
      setMsg(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6 py-10">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-800 shadow-md border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            Connexion au comptage calories
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Connecte-toi au service distant de comptage calories et stocke le
            token de session dans un cookie local.
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Adresse mail"
            required
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            required
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading}
              className={`rounded-lg px-4 py-3 font-semibold text-white transition ${
                loading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-orange-600 hover:bg-orange-700"
              }`}
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>
          </div>
        </form>

        {msg && (
          <p className="text-sm text-center text-gray-700 dark:text-gray-200">
            {msg}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Link
            href="/accueil"
            className="rounded-lg bg-gray-900 dark:bg-gray-100 px-4 py-2 text-sm font-semibold text-white dark:text-gray-900"
          >
            Aller à l&apos;accueil
          </Link>
          <Link
            href="/composer"
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200"
          >
            Ouvrir le composeur
          </Link>
        </div>
      </div>
    </main>
  );
}
