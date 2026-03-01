export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const CALORIE_SESSION_COOKIE = "calorie_session";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CALORIE_SESSION_COOKIE)?.value || null;

  if (!token) {
    return NextResponse.json({ error: "Token manquant" }, { status: 401 });
  }

  return NextResponse.json({ token }, { status: 200 });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true }, { status: 200 });

  response.cookies.set(CALORIE_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}
