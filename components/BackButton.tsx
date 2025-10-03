// components/BackButton.tsx
"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

type Props = {
  label?: string;
  fallbackHref?: string; // où aller si l’historique est vide (ex: "/accueil")
  className?: string;
};

export default function BackButton({
  label = "← Page précédente",
  fallbackHref = "/",
  className = "",
}: Props) {
  const router = useRouter();

  const onBack = useCallback(() => {
    // Essaye de revenir en arrière, sinon pousse vers le fallback
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  }, [router, fallbackHref]);

  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="Revenir à la page précédente"
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2
                  bg-gray-200 text-gray-800 hover:bg-gray-300
                  dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600
                  transition ${className}`}
    >
      <span aria-hidden>←</span>
      <span>{label}</span>
    </button>
  );
}
