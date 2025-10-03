export const runtime = "nodejs";
import { adminDb } from "@/lib/firebaseAdmin";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await adminDb.collection("meals").doc(params.id).delete();
    return new Response(null, { status: 204 });
  } catch (e) {
    console.error("MEAL DELETE ERROR", e);
    return new Response(JSON.stringify({ error: "Erreur suppression" }), { status: 500 });
  }
}
