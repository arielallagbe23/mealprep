export const runtime = "nodejs";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/authMiddleware";

export async function GET() {
  const user = await requireAuth();
  if (!user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });

  try {
    const snap = await adminDb.collection("dislikedFoods").where("userId", "==", user.uid).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return new Response(JSON.stringify(items), { status: 200 });
  } catch (e) {
    console.error("DISLIKED FOODS GET ERROR:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}

export async function POST(req) {
  const user = await requireAuth();
  if (!user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });

  try {
    const body = await req.json();
    const nom = String(body?.nom || "").trim();
    if (!nom) {
      return new Response(JSON.stringify({ error: "Champ 'nom' requis" }), { status: 400 });
    }

    const doc = { userId: user.uid, nom, createdAt: new Date().toISOString() };
    const ref = await adminDb.collection("dislikedFoods").add(doc);

    return new Response(JSON.stringify({ id: ref.id, ...doc }), { status: 201 });
  } catch (e) {
    console.error("DISLIKED FOODS POST ERROR:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}