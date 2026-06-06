export const runtime = "nodejs";

import { adminDb } from "@/lib/firebaseAdmin";

export async function PATCH(req, context) {
  const { id } = await context.params;
  if (!id) return new Response(JSON.stringify({ error: "id requis" }), { status: 400 });

  try {
    const body = await req.json();
    const { items } = body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: "items[] requis" }), { status: 400 });
    }

    const cleanItems = items.map(it => ({
      foodId: it.foodId || it.id || null,
      nom: it.nom,
      typeName: it.typeName || "Autres",
      caloriesPer100g: Number(it.caloriesPer100g) || 0,
      proteinesPer100g: Number(it.proteinesPer100g) || 0,
      gramsPerPortion: Number(it.grams) || Number(it.gramsPerPortion) || 0,
    }));

    await adminDb.collection("meals").doc(id).update({ items: cleanItems, updatedAt: new Date().toISOString() });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error("MEAL PATCH ERROR", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}

export async function DELETE(_req, context) {
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
