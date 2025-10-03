export const runtime = "nodejs";

import { adminDb } from "@/lib/firebaseAdmin";

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
