export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authMiddleware";
import { adminDb } from "@/lib/firebaseAdmin";

// GET /api/calories
// Returns { entries: { "YYYY-MM-DD": { calories, proteines } }, dailyLimit, limitHistory, dailyProteinGoal }
export async function GET() {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const [entriesSnap, dataDoc] = await Promise.all([
      adminDb.collection("calorieEntries").where("userId", "==", user.uid).get(),
      adminDb.collection("calorieData").doc(user.uid).get(),
    ]);

    const entries = {};
    entriesSnap.forEach((doc) => {
      const d = doc.data();
      entries[d.dateKey] = {
        calories: d.calories ?? 0,
        proteines: d.proteines ?? 0,
      };
    });

    const calData = dataDoc.exists ? dataDoc.data() : {};
    const dailyLimit = calData.dailyLimit ?? 2000;
    const limitHistory = calData.limitHistory ?? [];
    const dailyProteinGoal = calData.dailyProteinGoal ?? 0;

    return NextResponse.json({ entries, dailyLimit, limitHistory, dailyProteinGoal });
  } catch (e) {
    console.error("GET /api/calories error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/calories — update daily calorie limit and/or protein goal
// Body: { limitCalories?: number, effectiveDate?: "YYYY-MM-DD", dailyProteinGoal?: number }
export async function PUT(req) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const body = await req.json();
    const docRef = adminDb.collection("calorieData").doc(user.uid);
    const docSnap = await docRef.get();
    const existing = docSnap.exists ? docSnap.data() : {};

    const update = { userId: user.uid };

    // Update calorie limit
    if (body?.limitCalories !== undefined) {
      const limitCalories = Number(body.limitCalories);
      const effectiveDate = String(body?.effectiveDate ?? "");

      if (!Number.isInteger(limitCalories) || limitCalories <= 0) {
        return NextResponse.json({ error: "Limite invalide" }, { status: 400 });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
        return NextResponse.json({ error: "Date d'effet invalide" }, { status: 400 });
      }

      const history = existing.limitHistory ?? [];
      const idx = history.findIndex((h) => h.effectiveDate === effectiveDate);
      if (idx >= 0) {
        history[idx] = { limitCalories, effectiveDate };
      } else {
        history.push({ limitCalories, effectiveDate });
      }
      history.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));

      update.dailyLimit = limitCalories;
      update.limitHistory = history;
    }

    // Update protein goal
    if (body?.dailyProteinGoal !== undefined) {
      const dailyProteinGoal = Number(body.dailyProteinGoal);
      if (!Number.isFinite(dailyProteinGoal) || dailyProteinGoal < 0) {
        return NextResponse.json({ error: "Objectif protéines invalide" }, { status: 400 });
      }
      update.dailyProteinGoal = dailyProteinGoal;
    }

    await docRef.set(update, { merge: true });

    const updatedSnap = await docRef.get();
    const updated = updatedSnap.data();

    return NextResponse.json({
      ok: true,
      dailyLimit: updated.dailyLimit ?? 2000,
      limitHistory: updated.limitHistory ?? [],
      dailyProteinGoal: updated.dailyProteinGoal ?? 0,
    });
  } catch (e) {
    console.error("PUT /api/calories error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
