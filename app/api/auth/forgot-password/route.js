export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import crypto from "crypto";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email requis" }, { status: 400 });
    }
    const normEmail = String(email).trim().toLowerCase();

    const snap = await adminDb
      .collection("users")
      .where("email", "==", normEmail)
      .limit(1)
      .get();

    // Always respond 200 to avoid user enumeration
    if (snap.empty) {
      return NextResponse.json({ ok: true });
    }

    const userId = snap.docs[0].id;
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await adminDb.collection("passwordResets").doc(token).set({
      userId,
      email: normEmail,
      expiresAt,
    });

    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/reset-password?token=${token}`;

    // In dev, return the link directly. In prod, send via email (configure nodemailer).
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ ok: true, resetUrl });
    }

    console.log(`[forgot-password] reset link for ${normEmail}: ${resetUrl}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("FORGOT PASSWORD ERROR:", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
