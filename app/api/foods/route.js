export const runtime = "nodejs";
import { adminDb } from "@/lib/firebaseAdmin";

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
