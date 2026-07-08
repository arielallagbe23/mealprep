export const runtime = "nodejs";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/authMiddleware";

export async function GET() {
  const user = await requireAuth();
  if (!user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });

  try {
    const snap = await adminDb.collection("mealKeywords").where("userId", "==", user.uid).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return new Response(JSON.stringify(items), { status: 200 });
  } catch (e) {
    console.error("MEAL KEYWORDS GET ERROR:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}

export async function POST(req) {
  const user = await requireAuth();
  if (!user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });

  try {
    const body = await req.json();
    const label = String(body?.label || "").trim();
    if (!label) {
      return new Response(JSON.stringify({ error: "Champ 'label' requis" }), { status: 400 });
    }

    const doc = { userId: user.uid, label, createdAt: new Date().toISOString() };
    const ref = await adminDb.collection("mealKeywords").add(doc);

    return new Response(JSON.stringify({ id: ref.id, ...doc }), { status: 201 });
  } catch (e) {
    console.error("MEAL KEYWORDS POST ERROR:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}