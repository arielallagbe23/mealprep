export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authMiddleware";
import { adminDb } from "@/lib/firebaseAdmin";

// GET /api/shopping-list/current
// Returns { items: [...] } — la liste de courses en cours de l'utilisateur (peut être vide)
export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const doc = await adminDb.collection("shoppingLists").doc(user.uid).get();
    const items = doc.exists ? (doc.data().items ?? []) : [];
    return NextResponse.json({ items });
  } catch (e) {
    console.error("GET /api/shopping-list/current error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/shopping-list/current
// Body: { items: [...] } — remplace la liste de courses en cours de l'utilisateur
export async function PUT(req) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const body = await req.json();
    const items = Array.isArray(body?.items) ? body.items : null;
    if (!items) return NextResponse.json({ error: "items[] requis" }, { status: 400 });

    await adminDb.collection("shoppingLists").doc(user.uid).set(
      { userId: user.uid, items, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PUT /api/shopping-list/current error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
