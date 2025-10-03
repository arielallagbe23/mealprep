import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";

export async function GET(req: Request) {
  try {
    const token = req.headers.get("Authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Token manquant" }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);

    return NextResponse.json({
      uid: decoded.uid,
      email: decoded.email,
      nickname: decoded.name || null,
    });
  } catch (e) {
    console.error("USER ME ERROR", e);
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
}
