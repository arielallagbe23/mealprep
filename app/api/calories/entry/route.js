export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authMiddleware";
import { adminDb } from "@/lib/firebaseAdmin";

function entryId(userId, dateKey) {
  return `${userId}_${dateKey}`;
}

// POST /api/calories/entry — add calories (and optionally proteines) to a date (cumulative)
// Body: { dateKey: "YYYY-MM-DD", calories: number, proteines?: number }
export async function POST(req) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const body = await req.json();
    const dateKey = String(body?.dateKey ?? "");
    const calories = Number(body?.calories);
    const proteines = body?.proteines !== undefined ? Number(body.proteines) : null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    }
    if (!Number.isFinite(calories) || calories <= 0) {
      return NextResponse.json({ error: "Calories invalides" }, { status: 400 });
    }
    if (proteines !== null && (!Number.isFinite(proteines) || proteines < 0)) {
      return NextResponse.json({ error: "Protéines invalides" }, { status: 400 });
    }

    const docRef = adminDb.collection("calorieEntries").doc(entryId(user.uid, dateKey));
    const snap = await docRef.get();
    const existing = snap.exists ? snap.data() : { calories: 0, proteines: 0 };

    const newCalories = (existing.calories ?? 0) + Math.round(calories);
    const newProteines = proteines !== null
      ? (existing.proteines ?? 0) + Math.round(proteines)
      : (existing.proteines ?? 0);

    await docRef.set({
      userId: user.uid,
      dateKey,
      calories: newCalories,
      proteines: newProteines,
      updatedAt: new Date(),
    });

    return NextResponse.json({ ok: true, dateKey, calories: newCalories, proteines: newProteines }, { status: 200 });
  } catch (e) {
    console.error("POST /api/calories/entry error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/calories/entry — replace total calories and/or proteines for a date
// Body: { dateKey: "YYYY-MM-DD", newCalories?: number, newProteines?: number }
export async function PUT(req) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const body = await req.json();
    const dateKey = String(body?.dateKey ?? "");
    const newCalories = body?.newCalories !== undefined ? Number(body.newCalories) : null;
    const newProteines = body?.newProteines !== undefined ? Number(body.newProteines) : null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    }
    if (newCalories !== null && (!Number.isFinite(newCalories) || newCalories <= 0)) {
      return NextResponse.json({ error: "Calories invalides" }, { status: 400 });
    }
    if (newProteines !== null && (!Number.isFinite(newProteines) || newProteines < 0)) {
      return NextResponse.json({ error: "Protéines invalides" }, { status: 400 });
    }

    const docRef = adminDb.collection("calorieEntries").doc(entryId(user.uid, dateKey));
    const snap = await docRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });
    }

    const existing = snap.data();
    const update = {
      calories: newCalories !== null ? Math.round(newCalories) : existing.calories,
      proteines: newProteines !== null ? Math.round(newProteines) : (existing.proteines ?? 0),
      updatedAt: new Date(),
    };

    await docRef.update(update);

    return NextResponse.json({ ok: true, dateKey, ...update });
  } catch (e) {
    console.error("PUT /api/calories/entry error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/calories/entry?dateKey=YYYY-MM-DD
export async function DELETE(req) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url, "http://localhost");
    const dateKey = searchParams.get("dateKey") ?? "";

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    }

    await adminDb.collection("calorieEntries").doc(entryId(user.uid, dateKey)).delete();
    return NextResponse.json({ ok: true, dateKey });
  } catch (e) {
    console.error("DELETE /api/calories/entry error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
