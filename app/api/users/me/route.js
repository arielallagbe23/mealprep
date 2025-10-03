// @ts-check
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

/** @typedef {{uid?: string, email?: string, nickname?: string|null}} MPCFields */
/** @param {Request} req */
export async function GET(req) {
  try {
    // ✅ await cookies()
    const cookieStore = await cookies();
    const cookieToken = cookieStore.get("mpc_token")?.value || null;

    const headerToken =
      req.headers.get("Authorization")?.replace("Bearer ", "") || null;

    const token = cookieToken || headerToken;
    if (!token) {
      return NextResponse.json({ error: "Token manquant" }, { status: 401 });
    }

    if (!JWT_SECRET) {
      throw new Error("JWT_SECRET pas du tout défini");
    }

    /** @type {import('jsonwebtoken').JwtPayload & MPCFields} */
    const decoded = /** @type {any} */ (jwt.verify(token, JWT_SECRET));

    return NextResponse.json({
      uid: decoded.uid ?? null,
      email: decoded.email ?? null,
      nickname: decoded.nickname ?? null,
    });
  } catch (e) {
    console.error("USER ME ERROR", e);
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
}
