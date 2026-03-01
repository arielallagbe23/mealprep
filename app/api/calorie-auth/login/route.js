export const runtime = "nodejs";

import { NextResponse } from "next/server";

const CALORIE_AUTH_BASE_URL =
  process.env.CALORIE_AUTH_BASE_URL || "https://comptagecalories.vercel.app";
const CALORIE_SESSION_COOKIE = "calorie_session";
const CALORIE_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function extractSessionToken(response) {
  const getSetCookie = response.headers.getSetCookie?.bind(response.headers);
  const values = typeof getSetCookie === "function"
    ? getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);

  for (const header of values) {
    const match = header.match(
      new RegExp(`${CALORIE_SESSION_COOKIE}=([^;]+)`)
    );
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!email || !password) {
      return NextResponse.json(
        { error: "Identifiants invalides" },
        { status: 400 }
      );
    }

    const upstream = await fetch(`${CALORIE_AUTH_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.error || "Connexion impossible" },
        { status: upstream.status }
      );
    }

    const token = extractSessionToken(upstream);
    if (!token) {
      return NextResponse.json(
        { error: "Token calorie introuvable dans la réponse distante" },
        { status: 502 }
      );
    }

    const response = NextResponse.json(
      {
        token,
        user: data?.user || null,
      },
      { status: 200 }
    );

    response.cookies.set(CALORIE_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CALORIE_SESSION_MAX_AGE,
    });

    return response;
  } catch (error) {
    console.error("CALORIE AUTH LOGIN ERROR:", error);
    return NextResponse.json(
      { error: "Impossible de se connecter au comptage calories" },
      { status: 500 }
    );
  }
}
