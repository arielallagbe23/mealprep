export const runtime = "nodejs";

import { adminDb } from "@/lib/firebaseAdmin";
import bcrypt from "bcryptjs";

export async function POST(req) {
  try {
    const { email, password } = await req.json();
    if (!email || !password)
      return new Response(JSON.stringify({ message: "Email et mot de passe requis" }), { status: 400 });

    // Admin SDK : requête côté serveur, pas de Rules bloquantes
    const snap = await adminDb.collection("users")
      .where("email", "==", email.trim().toLowerCase())
      .limit(1)
      .get();

    if (snap.empty) return new Response(JSON.stringify({ message: "Utilisateur introuvable" }), { status: 401 });

    const user = snap.docs[0].data();
    const ok = await bcrypt.compare(password, user.passwordHash || "");
    if (!ok) return new Response(JSON.stringify({ message: "Mot de passe incorrect" }), { status: 401 });

    return new Response(JSON.stringify({ message: "Connexion réussie", user }), { status: 200 });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    return new Response(JSON.stringify({ message: "Erreur serveur" }), { status: 500 });
  }
}
