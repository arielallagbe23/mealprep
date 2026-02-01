export const runtime = "nodejs";

import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";

// GET /api/calorie-log?userId=...&date=YYYY-MM-DD
export async function GET(req) {
  try {
    const { searchParams } = new URL(
      req.url,
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost"
    );
    const userId = searchParams.get("userId");
    const date = searchParams.get("date");
    if (!userId || !date) {
      return new Response(JSON.stringify({ error: "userId et date requis" }), {
        status: 400,
      });
    }

    let snap;
    try {
      snap = await adminDb
        .collection("calorieLogs")
        .where("userId", "==", userId)
        .where("date", "==", date)
        .orderBy("createdAt", "desc")
        .get();
    } catch (err) {
      console.warn("⚠️ Firestore index manquant, fallback sans tri");
      snap = await adminDb
        .collection("calorieLogs")
        .where("userId", "==", userId)
        .where("date", "==", date)
        .get();
    }

    const list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
      };
    });

    return new Response(JSON.stringify(list), { status: 200 });
  } catch (e) {
    console.error("CALORIE LOG GET ERROR", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
    });
  }
}

// POST /api/calorie-log
// body: { userId, date, mealKcal, dayKcal, label? }
export async function POST(req) {
  try {
    const body = await req.json();
    const { userId, date, mealKcal, dayKcal, label } = body || {};

    if (!userId || !date) {
      return new Response(JSON.stringify({ error: "userId et date requis" }), {
        status: 400,
      });
    }

    const meal = Number(mealKcal);
    const day = Number(dayKcal);
    if (!Number.isFinite(meal) || meal <= 0 || !Number.isFinite(day) || day <= 0) {
      return new Response(JSON.stringify({ error: "Valeurs invalides" }), {
        status: 400,
      });
    }

    await adminDb.collection("calorieLogs").add({
      userId,
      date,
      mealKcal: meal,
      dayKcal: day,
      label: label || "Repas",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return new Response(JSON.stringify({ ok: true }), { status: 201 });
  } catch (e) {
    console.error("CALORIE LOG POST ERROR", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
    });
  }
}
