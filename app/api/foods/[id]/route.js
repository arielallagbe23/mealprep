export const runtime = "nodejs";

import { adminDb } from "@/lib/firebaseAdmin";

export async function PATCH(req, context) {
  try {
    const { id } = await context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "id requis" }), { status: 400 });
    }

    const body = await req.json();
    const nom = String(body?.nom || "").trim();
    const caloriesPer100g = Number(body?.caloriesPer100g);
    const typeId = String(body?.typeId || "").trim();

    if (!nom || !Number.isFinite(caloriesPer100g) || caloriesPer100g < 0 || !typeId) {
      return new Response(
        JSON.stringify({ error: "Champs requis: nom, caloriesPer100g, typeId" }),
        { status: 400 }
      );
    }

    const ref = adminDb.collection("foods").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return new Response(JSON.stringify({ error: "Aliment introuvable" }), { status: 404 });
    }

    const update = {
      nom,
      caloriesPer100g,
      typeId,
      updatedAt: new Date().toISOString(),
    };

    await ref.update(update);
    return new Response(JSON.stringify({ id, ...update }), { status: 200 });
  } catch (e) {
    console.error("FOODS PATCH ERROR:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}

export async function DELETE(_req, context) {
  try {
    const { id } = await context.params;
    if (!id) {
      return new Response(JSON.stringify({ error: "id requis" }), { status: 400 });
    }

    const ref = adminDb.collection("foods").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return new Response(JSON.stringify({ error: "Aliment introuvable" }), { status: 404 });
    }

    await ref.delete();
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error("FOODS DELETE ERROR:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}
