export const runtime = "nodejs";

import { adminDb } from "@/lib/firebaseAdmin";
import bcrypt from "bcryptjs";

export async function POST(req) {
  try {
    const { email, password, nickname } = await req.json();
    if (!email || !password)
      return new Response(JSON.stringify({ message: "Email et mot de passe requis" }), { status: 400 });

    const normEmail = email.trim().toLowerCase();

    const dup = await adminDb.collection("users").where("email", "==", normEmail).limit(1).get();
    if (!dup.empty) return new Response(JSON.stringify({ message: "Email déjà utilisé" }), { status: 409 });

    const passwordHash = await bcrypt.hash(password, 10);

    await adminDb.collection("users").add({
      email: normEmail,
      nickname: nickname || "",
      passwordHash,
      status: "accepted",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return new Response(JSON.stringify({ message: "Compte créé. Vous pouvez vous connecter." }), { status: 201 });
  } catch (e) {
    console.error("SIGNUP ERROR:", e);
    return new Response(JSON.stringify({ message: "Erreur serveur" }), { status: 500 });
  }
}
