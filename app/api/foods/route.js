export const runtime = "nodejs";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/authMiddleware";

function toIsoDate(value) {
  if (!value) return null;

  if (typeof value === "string") return value;

  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }

  if (typeof value === "object" && typeof value._seconds === "number") {
    return new Date(value._seconds * 1000).toISOString();
  }

  return null;
}

// GET foods
export async function GET(req) {
  const user = await requireAuth();
  if (!user) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const expandType = searchParams.get("expandType") === "true";
    const typeId = searchParams.get("typeId");

    let q = adminDb.collection("foods");
    if (typeId) q = q.where("typeId", "==", typeId);

    const foodsSnap = await q.get();
    let foods = foodsSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: toIsoDate(data?.createdAt),
      };
    });

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
  const user = await requireAuth();
  if (!user) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });
  }

  try {
    const body = await req.json();
    const nom = String(body?.nom || "").trim();
    const caloriesPer100g = Number(body?.caloriesPer100g);
    const typeId = String(body?.typeId || "").trim();
    const proteinesPer100g = body?.proteinesPer100g != null ? Number(body.proteinesPer100g) : 0;

    if (!nom || !Number.isFinite(caloriesPer100g) || caloriesPer100g < 0 || !typeId) {
      return new Response(JSON.stringify({ error: "Champs requis: nom, caloriesPer100g, typeId" }), { status: 400 });
    }

    if (!Number.isFinite(proteinesPer100g) || proteinesPer100g < 0) {
      return new Response(JSON.stringify({ error: "proteinesPer100g doit être un nombre positif" }), { status: 400 });
    }

    const doc = { nom, caloriesPer100g, proteinesPer100g, typeId, createdAt: new Date().toISOString() };
    const ref = await adminDb.collection("foods").add(doc);

    return new Response(JSON.stringify({ id: ref.id, ...doc }), { status: 201 });
  } catch (e) {
    console.error("FOODS CREATE ERROR:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}