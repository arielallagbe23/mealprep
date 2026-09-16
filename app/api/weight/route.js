export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authMiddleware";
import { adminDb } from "@/lib/firebaseAdmin";

// GET /api/weight
// Returns { entries: { "YYYY-MM-DD": weightKg } }
export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const snap = await adminDb.collection("weightEntries").where("userId", "==", user.uid).get();
    const entries = {};
    snap.forEach((doc) => {
      const d = doc.data();
      entries[d.dateKey] = d.weight;
    });
    return NextResponse.json({ entries });
  } catch (e) {
    console.error("GET /api/weight error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
