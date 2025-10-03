export const runtime = "nodejs";

import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";

// GET /api/meals?userId=...
export async function GET(req) {
  try {
    const { searchParams } = new URL(
      req.url,
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost"
    );
    const userId = searchParams.get("userId");
    if (!userId) {
      return new Response(JSON.stringify({ error: "userId requis" }), { status: 400 });
    }

    let snap;
    try {
      snap = await adminDb
        .collection("meals")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .get();
    } catch (err) {
      // ⚠️ Si l’index Firestore n’existe pas encore → fallback sans orderBy
      console.warn("⚠️ Firestore index manquant, fallback sans tri");
      snap = await adminDb
        .collection("meals")
        .where("userId", "==", userId)
        .get();
    }

    const meals = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : null,
      };
    });

    return new Response(JSON.stringify(meals), { status: 200 });
  } catch (e) {
    console.error("MEALS LIST ERROR", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}

// POST /api/meals
export async function POST(req) {
  try {
    const body = await req.json();
    const { userId, name, portions = 1, items = [] } = body || {};

    if (!userId || !name || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Champs requis: userId, name, items[]" }),
        { status: 400 }
      );
    }

    const cleanItems = items.map(it => ({
      foodId: it.id || it.foodId,
      nom: it.nom,
      typeName: it.typeName || "Autres",
      caloriesPer100g: Number(it.caloriesPer100g) || 0,
      gramsPerPortion: Number(it.grams) || Number(it.gramsPerPortion) || 0,
    }));

    await adminDb.collection("meals").add({
      userId,
      name,
      portions: Number(portions) || 1,
      items: cleanItems,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return new Response(JSON.stringify({ ok: true }), { status: 201 });
  } catch (e) {
    console.error("MEALS CREATE ERROR", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}
