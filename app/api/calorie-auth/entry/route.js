export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const CALORIE_AUTH_BASE_URL =
  process.env.CALORIE_AUTH_BASE_URL || "https://comptagecalories.vercel.app";
const CALORIE_SESSION_COOKIE = "calorie_session";

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(CALORIE_SESSION_COOKIE)?.value || null;

    if (!sessionToken) {
      return NextResponse.json(
        { error: "Connecte-toi au comptage calories d'abord" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const dateKey = String(body?.dateKey ?? "");
    const calories = Number(body?.calories);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    }

    if (!Number.isInteger(calories) || calories <= 0) {
      return NextResponse.json(
        { error: "Calories invalides" },
        { status: 400 }
      );
    }

    const upstream = await fetch(`${CALORIE_AUTH_BASE_URL}/api/calories/entry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${CALORIE_SESSION_COOKIE}=${sessionToken}`,
      },
      body: JSON.stringify({ dateKey, calories }),
      cache: "no-store",
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data?.error || "Impossible d'ajouter au comptage calories" },
        { status: upstream.status }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        dateKey,
        calories,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("CALORIE AUTH ENTRY ERROR:", error);
    return NextResponse.json(
      { error: "Impossible d'ajouter au comptage calories" },
      { status: 500 }
    );
  }
}
