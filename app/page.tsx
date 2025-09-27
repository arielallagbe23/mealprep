import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 px-6 py-10">
      <main className="text-center space-y-8 max-w-md w-full">
        {/* Logo ou Titre */}
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-800 dark:text-white">
          🍽️ Meal Composer
        </h1>
        <p className="text-gray-600 dark:text-gray-300 text-lg">
          Compose tes repas équilibrés en quelques clics.
        </p>

        {/* Actions principales */}
        <div className="flex flex-col gap-4 mt-8">
          <Link
            href="/login"
            className="w-full py-3 px-6 rounded-xl bg-blue-600 text-white font-semibold text-lg hover:bg-blue-700 active:scale-95 transition"
          >
            Connexion
          </Link>
          <Link
            href="/signup"
            className="w-full py-3 px-6 rounded-xl bg-green-600 text-white font-semibold text-lg hover:bg-green-700 active:scale-95 transition"
          >
            Inscription
          </Link>
        </div>

        {/* Accès rapide au composer */}
        <div className="mt-6">
          <Link
            href="/composer"
            className="inline-block py-2 px-5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition"
          >
            🚀 Composer un repas
          </Link>
        </div>
      </main>

      <footer className="mt-12 text-xs text-gray-500 dark:text-gray-400">
        © {new Date().getFullYear()} Meal Composer. Tous droits réservés.
      </footer>
    </div>
  );
}
