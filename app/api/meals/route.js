export const runtime = "nodejs";
import { adminDb } from "@/lib/firebaseAdmin";

// LISTE des repas de l'utilisateur
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) return new Response(JSON.stringify({ error:"userId requis" }), { status: 400 });

    const snap = await adminDb.collection("meals").where("userId","==",userId).orderBy("createdAt","desc").get();
    const meals = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return new Response(JSON.stringify(meals), { status: 200 });
  } catch (e) {
    console.error("MEALS LIST ERROR", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}

// ENREGISTRER un repas
export async function POST(req) {
  try {
    const body = await req.json();
    const { userId, name, portions = 1, items = [] } = body || {};
    if (!userId || !name || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error:"Champs requis: userId, name, items[]" }), { status: 400 });
    }

    // on ne sauvegarde que ce qui est utile et stable
    const cleanItems = items.map(it => ({
      foodId: it.id || it.foodId,
      nom: it.nom,
      typeName: it.typeName || "Autres",
      caloriesPer100g: Number(it.caloriesPer100g) || 0,
      gramsPerPortion: Number(it.grams) || Number(it.gramsPerPortion) || 0
    }));

    const doc = {
      userId,
      name,
      portions: Number(portions) || 1,
      items: cleanItems,
      createdAt: new Date().toISOString(),
    };

    const ref = await adminDb.collection("meals").add(doc);
    return new Response(JSON.stringify({ id: ref.id, ...doc }), { status: 201 });
  } catch (e) {
    console.error("MEALS CREATE ERROR", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}


