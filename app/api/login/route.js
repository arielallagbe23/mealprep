export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET non défini dans les variables d'environnement");
}

export async function POST(req) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json(
        { message: "Email et mot de passe requis" },
        { status: 400 }
      );
    }

    const snap = await adminDb
      .collection("users")
      .where("email", "==", String(email).trim().toLowerCase())
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json(
        { message: "Utilisateur introuvable" },
        { status: 401 }
      );
    }

    const doc = snap.docs[0];
    const user = doc.data();

    const ok = await bcrypt.compare(password, user.passwordHash || "");
    if (!ok) {
      return NextResponse.json(
        { message: "Mot de passe incorrect" },
        { status: 401 }
      );
    }

    // Crée le JWT
    const payload = {
      uid: doc.id,
      email: user.email,
      nickname: user.nickname || null,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

    // Réponse + cookie HttpOnly
    const res = NextResponse.json({
      message: "Connexion réussie",
      user: payload,
    });

    res.cookies.set("mpc_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 jours
    });

    return res;
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    return NextResponse.json({ message: "Erreur serveur" }, { status: 500 });
  }
}
