export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authMiddleware";
import { adminDb } from "@/lib/firebaseAdmin";

function entryId(userId, dateKey) {
  return `${userId}_${dateKey}`;
}

// POST /api/weight/entry — enregistre (ou remplace) le poids d'une date donnée
// Body: { dateKey: "YYYY-MM-DD", weight: number }
export async function POST(req) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const body = await req.json();
    const dateKey = String(body?.dateKey ?? "");
    const weight = Number(body?.weight);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      return NextResponse.json({ error: "Poids invalide" }, { status: 400 });
    }

    await adminDb.collection("weightEntries").doc(entryId(user.uid, dateKey)).set({
      userId: user.uid,
      dateKey,
      weight,
      updatedAt: new Date(),
    });

    return NextResponse.json({ ok: true, dateKey, weight }, { status: 200 });
  } catch (e) {
    console.error("POST /api/weight/entry error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/weight/entry?dateKey=YYYY-MM-DD
export async function DELETE(req) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url, "http://localhost");
    const dateKey = searchParams.get("dateKey") ?? "";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    }

    await adminDb.collection("weightEntries").doc(entryId(user.uid, dateKey)).delete();
    return NextResponse.json({ ok: true, dateKey });
  } catch (e) {
    console.error("DELETE /api/weight/entry error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
