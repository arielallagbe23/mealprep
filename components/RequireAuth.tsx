"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./useAuth";

export default function RequireAuth({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const { user, ready } = useAuth();
  const router = useRouter();

  const forbidden = ready && !!user && adminOnly && user.role !== "admin";

  useEffect(() => {
    if (ready && !user) router.replace("/login");
    else if (forbidden) router.replace("/performance");
  }, [ready, user, forbidden, router]);

  if (!ready) return null;      // évite clignotement
  if (!user) return null;       // redirection en cours
  if (forbidden) return null;   // redirection en cours (accès refusé)
  return <>{children}</>;
}
