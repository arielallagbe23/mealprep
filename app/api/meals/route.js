export const runtime = "nodejs";

import admin from "firebase-admin";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/authMiddleware";

// GET /api/meals
// Bibliothèque de repas partagée : tous les utilisateurs connectés voient tous
// les repas (seuls les admins peuvent en créer/composer), peu importe qui l'a créé.
export async function GET() {
  const user = await requireAuth();
  if (!user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });

  try {
    let snap;
    try {
      snap = await adminDb
        .collection("meals")
        .orderBy("createdAt", "desc")
        .get();
    } catch (err) {
      // ⚠️ Si l’index Firestore n’existe pas encore → fallback sans orderBy
      console.warn("⚠️ Firestore index manquant, fallback sans tri");
      snap = await adminDb.collection("meals").get();
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

// POST /api/meals — seuls les admins peuvent composer/créer des repas
export async function POST(req) {
  const user = await requireAuth();
  if (!user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });
  if (user.role !== "admin") return new Response(JSON.stringify({ error: "Accès réservé aux admins" }), { status: 403 });

  try {
    const body = await req.json();
    const { userId, name, mealType = null, portions = 1, items = [] } = body || {};

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
      proteinesPer100g: Number(it.proteinesPer100g) || 0,
      gramsPerPortion: Number(it.grams) || Number(it.gramsPerPortion) || 0,
    }));

    await adminDb.collection("meals").add({
      userId,
      name,
      mealType: mealType || null,
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
