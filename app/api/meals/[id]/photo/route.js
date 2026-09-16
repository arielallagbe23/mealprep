export const runtime = "nodejs";

import { put, del } from "@vercel/blob";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/authMiddleware";

const MAX_SIZE = 8 * 1024 * 1024; // 8 Mo
const EXT_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(req, context) {
  const user = await requireAuth();
  if (!user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });
  if (user.role !== "admin") return new Response(JSON.stringify({ error: "Accès réservé aux admins" }), { status: 403 });

  const { id } = await context.params;
  if (!id) return new Response(JSON.stringify({ error: "id requis" }), { status: 400 });

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return new Response(JSON.stringify({ error: "Fichier requis" }), { status: 400 });
    }
    const ext = EXT_BY_TYPE[file.type];
    if (!ext) {
      return new Response(JSON.stringify({ error: "Format non supporté (jpg, png, webp, gif)" }), { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return new Response(JSON.stringify({ error: "Image trop lourde (8 Mo max)" }), { status: 400 });
    }

    const doc = await adminDb.collection("meals").doc(id).get();
    if (!doc.exists) return new Response(JSON.stringify({ error: "Repas introuvable" }), { status: 404 });

    const previousUrl = doc.data().photoUrl;

    const blob = await put(`meals/${id}/photo-${Date.now()}.${ext}`, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
    });

    // Best-effort : supprime l'ancienne photo pour ne pas accumuler de blobs orphelins
    if (previousUrl) del(previousUrl).catch(() => {});

    await adminDb.collection("meals").doc(id).update({ photoUrl: blob.url });
    return new Response(JSON.stringify({ ok: true, photoUrl: blob.url }), { status: 200 });
  } catch (e) {
    console.error("MEAL PHOTO UPLOAD ERROR", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}

export async function DELETE(_req, context) {
  const user = await requireAuth();
  if (!user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });
  if (user.role !== "admin") return new Response(JSON.stringify({ error: "Accès réservé aux admins" }), { status: 403 });

  const { id } = await context.params;
  if (!id) return new Response(JSON.stringify({ error: "id requis" }), { status: 400 });

  try {
    const doc = await adminDb.collection("meals").doc(id).get();
    if (!doc.exists) return new Response(JSON.stringify({ error: "Repas introuvable" }), { status: 404 });

    const previousUrl = doc.data().photoUrl;
    if (previousUrl) del(previousUrl).catch(() => {});

    await adminDb.collection("meals").doc(id).update({ photoUrl: null });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error("MEAL PHOTO DELETE ERROR", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}
