export const runtime = "nodejs";

import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/authMiddleware";

export async function PATCH(req, context) {
  const user = await requireAuth();
  if (!user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });

  const { id } = await context.params;
  if (!id) return new Response(JSON.stringify({ error: "id requis" }), { status: 400 });

  try {
    const body = await req.json();
    const { items, name } = body || {};

    const updates = { updatedAt: new Date().toISOString() };

    if (items !== undefined) {
      if (!Array.isArray(items) || items.length === 0) {
        return new Response(JSON.stringify({ error: "items[] requis" }), { status: 400 });
      }
      updates.items = items.map(it => ({
        foodId: it.foodId || it.id || null,
        nom: it.nom,
        typeName: it.typeName || "Autres",
        caloriesPer100g: Number(it.caloriesPer100g) || 0,
        proteinesPer100g: Number(it.proteinesPer100g) || 0,
        gramsPerPortion: Number(it.grams) || Number(it.gramsPerPortion) || 0,
      }));
    }

    if (name !== undefined) {
      const cleanName = String(name).trim();
      if (!cleanName) {
        return new Response(JSON.stringify({ error: "name requis" }), { status: 400 });
      }
      updates.name = cleanName;
    }

    if (updates.items === undefined && updates.name === undefined) {
      return new Response(JSON.stringify({ error: "Aucune modification fournie" }), { status: 400 });
    }

    await adminDb.collection("meals").doc(id).update(updates);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error("MEAL PATCH ERROR", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}

export async function DELETE(_req, context) {
  const user = await requireAuth();
  if (!user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });

  // ⬅️ params est un Promise maintenant
  const { id } = await context.params;

  if (!id) {
    return new Response(JSON.stringify({ error: "id requis" }), { status: 400 });
  }

  try {
    await adminDb.collection("meals").doc(id).delete();
    return new Response(null, { status: 204 });
  } catch (e) {
    console.error("MEAL DELETE ERROR", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}
