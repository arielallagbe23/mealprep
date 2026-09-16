import * as admin from "firebase-admin";

let adminApp;

// Le loader d'env de Next.js convertit TOUS les \n en vrais sauts de ligne
// dans une valeur .env entre guillemets doubles — y compris ceux qui, dans
// le JSON d'origine, étaient l'échappement légitime d'un saut de ligne à
// l'intérieur d'une chaîne (ex: private_key). Un saut de ligne brut est
// interdit dans une chaîne JSON, donc ça casse le parsing. On ne peut pas se
// contenter de tout ré-échapper : les sauts de ligne utilisés comme simple
// indentation (hors chaîne) sont un espace JSON valide et doivent le rester.
// On repasse donc le texte caractère par caractère pour ne ré-échapper que
// ce qui se trouve à l'intérieur d'une chaîne — no-op si le texte est déjà
// un JSON valide (ex: en production, où Vercel n'altère pas la valeur).
function reescapeNewlinesInsideJsonStrings(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === "\\") {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        inString = false;
        out += ch;
      } else if (ch === "\n") {
        out += "\\n";
      } else if (ch === "\r") {
        out += "\\r";
      } else if (ch === "\t") {
        out += "\\t";
      } else {
        out += ch;
      }
    } else {
      if (ch === '"') inString = true;
      out += ch;
    }
  }
  return out;
}

const buildServiceAccount = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    return JSON.parse(reescapeNewlinesInsideJsonStrings(process.env.FIREBASE_SERVICE_ACCOUNT));
  }
  return {
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
  };
};

if (!admin.apps.length) {
  const serviceAccount = buildServiceAccount();

  adminApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  adminApp = admin.app();
}

export const adminDb = adminApp.firestore();
export const adminAuth = adminApp.auth(); // ✅ ajout
