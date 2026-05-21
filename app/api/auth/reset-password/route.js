export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import bcrypt from "bcryptjs";

export async function POST(req) {
  try {
    const { token, password } = await req.json();
    if (!token || !password) {
      return NextResponse.json({ error: "Token et mot de passe requis" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Mot de passe trop court (6 caractères min)" }, { status: 400 });
    }

    const resetDoc = await adminDb.collection("passwordResets").doc(String(token)).get();
    if (!resetDoc.exists) {
      return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 400 });
    }

    const { userId, expiresAt } = resetDoc.data();
    if (new Date() > expiresAt.toDate()) {
      await resetDoc.ref.delete();
      return NextResponse.json({ error: "Lien expiré" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await adminDb.collection("users").doc(userId).update({ passwordHash, updatedAt: new Date() });
    await resetDoc.ref.delete();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("RESET PASSWORD ERROR:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
