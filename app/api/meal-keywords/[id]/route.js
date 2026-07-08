export const runtime = "nodejs";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/authMiddleware";

export async function DELETE(req, { params }) {
  const user = await requireAuth();
  if (!user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });

  try {
    const { id } = params;
    const ref = adminDb.collection("mealKeywords").doc(id);
    const snap = await ref.get();

    if (!snap.exists || snap.data().userId !== user.uid) {
      return new Response(JSON.stringify({ error: "Introuvable" }), { status: 404 });
    }

    await ref.delete();
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e) {
    console.error("MEAL KEYWORDS DELETE ERROR:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}