"use client";

import { useEffect, useState } from "react";

export type AuthUser = { uid: string; email: string; nickname?: string } | null;

export function useAuth() {
  const [user, setUser] = useState<AuthUser>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("mpc:user");
      setUser(raw ? JSON.parse(raw) : null);
    } finally {
      setReady(true);
    }
  }, []);

  const login = (u: AuthUser) => {
    if (u) localStorage.setItem("mpc:user", JSON.stringify(u));
    setUser(u);
  };

  const logout = () => {
    localStorage.removeItem("mpc:user");
    setUser(null);
  };

  return { user, ready, login, logout };
}
