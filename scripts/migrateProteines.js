import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse .env.local without dotenv
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

const PROTEINES_MAP = {
  "02fyjvFHOepdEuvYi7Ps": 1.8,
  "2cj64Et14RptlomUvzPs": 2.0,
  "3WcQmcl1oNTxCJ4pBMeG": 17.0,
  "4P8aBmDpYMh73EqriWAx": 10.0,
  "6SyFZO75x3OQjVNORybK": 1.1,
  "7qY8UcOUU1Bb71ieBZwO": 1.0,
  "AVNWdhbdYCwHahWn4jVg": 14.0,
  "Cjw7lQmIuDmEJ4Wd8UjI": 13.0,
  "Cn8zO8qwzJ8HsKZFPn12": 75.0,
  "DpYkZget7LirbA3uZzFY": 1.3,
  "HQM3NwRSwbMXLryH5NYe": 75.0,
  "Ign4va0JSEd12agr1EvD": 23.0,
  "LF7NJV9C3XfdsWBYpuNG": 1.8,
  "M0oznBkKMkXg83Bo1zcc": 0.9,
  "Q7lvm7ZBf6qdAhIY6EyE": 0.0,
  "QJLuqzH61bbhuwIBpWu2": 8.1,
  "SKyy4h4p0vmO5DXlcCn3": 21.0,
  "Skf0eJCvVejSREZO0qgS": 13.0,
  "dfnKFx4rXjC2o3lnJYGG": 2.2,
  "dgUMxP2OiUylyQK7eBVu": 20.0,
  "f3OUMzb6MAvkbkNtlVf7": 13.0,
  "fNX7xRTZVkaNOEDnBOa5": 0.3,
  "g5TY1UJD8dk9FbHrFtrJ": 2.5,
  "hhAWnvRBqHjhoxxoQvpA": 8.0,
  "lglNv2qixbWZUA48OECj": 2.0,
  "mLDcDQRfPgbYVP48um1V": 3.5,
  "odqGX6eL4mLBJdVKG5l7": 0.5,
  "of4JqrM7VcKBK2B5YQme": 25.0,
  "qcK9SUYNn2iqH1T3Z5gQ": 1.2,
  "rv8R4ntcKWQ5aAOj4taC": 2.8,
  "s3nDBwX4lOVNEtrArgXN": 0.5,
  "wSYCyMoMTbBxQUbFlhUD": 7.5,
};

async function migrate() {
  const entries = Object.entries(PROTEINES_MAP);
  const BATCH_SIZE = 500;
  let updated = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const chunk = entries.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const [id, proteinesPer100g] of chunk) {
      const ref = db.collection("foods").doc(id);
      batch.set(ref, { proteinesPer100g }, { merge: true });
    }

    await batch.commit();
    updated += chunk.length;
    console.log(`Batch committed: ${chunk.length} docs`);
  }

  console.log(`\nMigration terminée — ${updated}/${entries.length} documents mis à jour.`);
}

migrate().catch((err) => {
  console.error("Erreur migration:", err);
  process.exit(1);
});
