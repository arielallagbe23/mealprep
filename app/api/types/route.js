export const runtime = "nodejs";
import { adminDb } from "@/lib/firebaseAdmin";

export async function GET() {
  try {
    const snap = await adminDb.collection("type_aliments").get();
    const types = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return new Response(JSON.stringify(types), { status: 200 });
  } catch (e) {
    console.error("TYPES ERROR:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}
