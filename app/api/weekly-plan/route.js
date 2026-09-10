export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authMiddleware";
import { adminDb } from "@/lib/firebaseAdmin";

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const SLOT_KEYS = ["petit_dejeuner", "dejeuner", "collation_apres_midi", "diner", "collation_soir"];

function isValidWeekStart(w) {
  return typeof w === "string" && /^\d{4}-\d{2}-\d{2}$/.test(w);
}

// GET /api/weekly-plan?week=YYYY-MM-DD (lundi de la semaine)
// Returns { weekStart, days: { mon: { [slotKey]: { mealId } | { cheat: true } } } }
export async function GET(req) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("week");
  if (!isValidWeekStart(weekStart)) {
    return NextResponse.json({ error: "week (YYYY-MM-DD) requis" }, { status: 400 });
  }

  try {
    const docId = `${user.uid}_${weekStart}`;
    const doc = await adminDb.collection("weeklyPlans").doc(docId).get();
    const days = doc.exists ? (doc.data().days ?? {}) : {};
    return NextResponse.json({ weekStart, days });
  } catch (e) {
    console.error("GET /api/weekly-plan error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/weekly-plan
// Body: { week: "YYYY-MM-DD", days: { mon: { [slotKey]: { mealId } | { cheat: true } } } }
export async function PUT(req) {
  const user = await requireAuth();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const body = await req.json();
    const weekStart = body?.week;
    const days = body?.days;

    if (!isValidWeekStart(weekStart)) {
      return NextResponse.json({ error: "week (YYYY-MM-DD) invalide" }, { status: 400 });
    }
    if (typeof days !== "object" || days === null || Array.isArray(days)) {
      return NextResponse.json({ error: "days invalide" }, { status: 400 });
    }

    const cleanDays = {};
    for (const dayKey of DAY_KEYS) {
      const dayVal = days[dayKey];
      if (!dayVal || typeof dayVal !== "object") continue;
      const cleanSlots = {};
      for (const slotKey of SLOT_KEYS) {
        const cell = dayVal[slotKey];
        if (!cell) continue;
        if (cell.cheat === true) {
          cleanSlots[slotKey] = { cheat: true };
        } else if (typeof cell.mealId === "string" && cell.mealId) {
          const entry = { mealId: cell.mealId };
          const portions = Number(cell.portions);
          if (Number.isFinite(portions) && portions > 0) entry.portions = portions;
          cleanSlots[slotKey] = entry;
        }
      }
      if (Object.keys(cleanSlots).length > 0) cleanDays[dayKey] = cleanSlots;
    }

    const docId = `${user.uid}_${weekStart}`;
    await adminDb.collection("weeklyPlans").doc(docId).set(
      { userId: user.uid, weekStart, days: cleanDays, updatedAt: new Date().toISOString() },
      { merge: false }
    );

    return NextResponse.json({ ok: true, weekStart, days: cleanDays });
  } catch (e) {
    console.error("PUT /api/weekly-plan error:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
