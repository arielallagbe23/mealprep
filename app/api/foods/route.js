export const runtime = "nodejs";
import { adminDb } from "@/lib/firebaseAdmin";

// GET foods
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const expandType = searchParams.get("expandType") === "true";
    const typeId = searchParams.get("typeId");

    let q = adminDb.collection("foods");
    if (typeId) q = q.where("typeId", "==", typeId);

    const foodsSnap = await q.get();
    let foods = foodsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (expandType) {
      const typesSnap = await adminDb.collection("type_aliments").get();
      const map = new Map(typesSnap.docs.map(d => [d.id, d.data()]));
      foods = foods.map(f => ({
        ...f,
        typeName: f.typeName || map.get(f.typeId)?.nomtype || "Autres",
      }));
    }

    return new Response(JSON.stringify(foods), { status: 200 });
  } catch (e) {
    console.error("FOODS ERROR:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}

// POST foods
export async function POST(req) {
  try {
    const body = await req.json();
    const { nom, caloriesPer100g, typeId } = body;

    if (!nom || typeof caloriesPer100g !== "number" || !typeId) {
      return new Response(JSON.stringify({ error: "Champs requis: nom, caloriesPer100g, typeId" }), { status: 400 });
    }

    const doc = { nom, caloriesPer100g, typeId, createdAt: new Date().toISOString() };
    const ref = await adminDb.collection("foods").add(doc);

    return new Response(JSON.stringify({ id: ref.id, ...doc }), { status: 201 });
  } catch (e) {
    console.error("FOODS CREATE ERROR:", e); // ← log visible dans Vercel
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}
