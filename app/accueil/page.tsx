"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/useAuth";
import RequireAuth from "@/components/RequireAuth";

export default function Accueil() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const onLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <RequireAuth>
      <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-6">
        <div className="w-full max-w-sm p-6 rounded-xl bg-white dark:bg-gray-800 shadow-md space-y-6 text-center">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            🍽️ Meal Composer
          </h1>

          <p className="text-gray-600 dark:text-gray-300">
            Bonjour{" "}
            <span className="font-semibold">
              {user?.nickname || user?.email}
            </span>
          </p>

          <Link
            href="/composer"
            className="block w-full py-3 px-6 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
          >
            Composer un repas
          </Link>

          <button
            onClick={onLogout}
            className="w-full py-2 px-6 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition"
          >
            Se déconnecter
          </button>
        </div>
      </main>
    </RequireAuth>
  );
}
