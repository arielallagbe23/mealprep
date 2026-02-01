export const runtime = "nodejs";

import { adminDb } from "@/lib/firebaseAdmin";

export async function DELETE(_req, { params }) {
  try {
    const { id } = params || {};
    if (!id) {
      return new Response(JSON.stringify({ error: "id requis" }), { status: 400 });
    }

    await adminDb.collection("calorieLogs").doc(id).delete();
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error("CALORIE LOG DELETE ERROR", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500,
    });
  }
}
