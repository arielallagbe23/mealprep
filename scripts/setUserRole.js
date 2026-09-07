// Usage: node scripts/setUserRole.js <email> <admin|user>
const { readFileSync } = require("fs");
const { resolve } = require("path");
const admin = require("firebase-admin");

const envPath = resolve(__dirname, "../.env.local");
const envLines = readFileSync(envPath, "utf-8").split("\n");
for (const line of envLines) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim().replace(/^"(.*)"$/, "$1");
    if (!process.env[key]) process.env[key] = val;
  }
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
    }),
  });
}

const db = admin.firestore();

async function main() {
  const email = (process.argv[2] || "").trim().toLowerCase();
  const role = (process.argv[3] || "admin").trim();

  if (!email) {
    console.error("Usage: node scripts/setUserRole.js <email> <admin|user>");
    process.exit(1);
  }
  if (role !== "admin" && role !== "user") {
    console.error('Le rôle doit être "admin" ou "user"');
    process.exit(1);
  }

  const snap = await db.collection("users").where("email", "==", email).limit(1).get();
  if (snap.empty) {
    console.error(`Aucun utilisateur trouvé pour ${email}`);
    process.exit(1);
  }

  const doc = snap.docs[0];
  await doc.ref.update({ role, updatedAt: new Date() });
  console.log(`✅ ${email} (${doc.id}) est maintenant "${role}"`);
}

main().then(() => process.exit(0));
