export const runtime = "nodejs";
import { adminDb } from "@/lib/firebaseAdmin";

// Récupérer les foods
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const expandType = searchParams.get("expandType") === "true";
    const typeId = searchParams.get("typeId");

    let q = adminDb.collection("foods");
    if (typeId) q = q.where("typeId", "==", typeId);

    const foodsSnap = await q.get();

    // 👇 On cast en any pour simplifier et éviter TS2339
    let foods = foodsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

    if (expandType) {
      const typesSnap = await adminDb.collection("type_aliments").get();
      const map = new Map(typesSnap.docs.map(d => [d.id, d.data() as any]));

      foods = foods.map(f => ({
        ...f,
        typeName: f.typeName || map.get(f.typeId)?.nomtype || "Autres",
      }));
    }

    return new Response(JSON.stringify(foods), { status: 200 });
  } catch (e) {
    console.error("FOODS ERROR:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
    });
  }
}

// Ajouter un food
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { nom, caloriesPer100g, typeId } = body;

    if (!nom || typeof caloriesPer100g !== "number" || !typeId) {
      return new Response(
        JSON.stringify({
          error: "Champs requis: nom, caloriesPer100g, typeId",
        }),
        { status: 400 }
      );
    }

    const doc = {
      nom,
      caloriesPer100g,
      typeId,
      createdAt: new Date().toISOString(),
    };

    const ref = await adminDb.collection("foods").add(doc);

    return new Response(JSON.stringify({ id: ref.id, ...doc }), {
      status: 201,
    });
  } catch (e) {
    console.error("FOODS CREATE ERROR:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
    });
  }
}
