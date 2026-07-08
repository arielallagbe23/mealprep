export const runtime = "nodejs";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/authMiddleware";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  const user = await requireAuth();
  if (!user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });

  try {
    const ref = adminDb.collection("mealSuggestions").doc(`${user.uid}_${todayKey()}`);
    const snap = await ref.get();
    if (!snap.exists) return new Response(JSON.stringify({ idees: null }), { status: 200 });
    return new Response(JSON.stringify({ idees: snap.data().idees }), { status: 200 });
  } catch (e) {
    console.error("SUGGEST MEALS GET ERROR:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}

export async function POST(req) {
  const user = await requireAuth();
  if (!user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const keywords = Array.isArray(body?.keywords) ? body.keywords : [];

    const dislikedSnap = await adminDb.collection("dislikedFoods").where("userId", "==", user.uid).get();
    const disliked = dislikedSnap.docs.map((d) => d.data().nom);

    const mois = new Date().getMonth() + 1;
    const moisNoms = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

    const prompt = `Nous sommes en ${moisNoms[mois - 1]}, en France.

${disliked.length > 0 ? `IMPORTANT — je n'aime PAS ces aliments, ne les utilise JAMAIS : ${disliked.join(", ")}.` : ""}

${keywords.length > 0 ? `Style de repas souhaité : ${keywords.join(", ")}.` : ""}

Mes règles fixes :
- 500g de blanc de poulet cru + 45g de clear whey chaque jour, en plus de ce repas
- Féculents autorisés uniquement au dîner (repas post-training)

Propose 4 idées de repas simples utilisant des produits réellement de saison en ${moisNoms[mois - 1]} en France${keywords.length > 0 ? `, correspondant au style demandé (${keywords.join(", ")})` : ""}.

Pour chaque idée, liste les ingrédients principaux (5-7 max, noms courts, pas de grammage).

Réponds UNIQUEMENT avec un JSON strict, sans texte autour, format exact :
[{"nom": "...", "emoji": "...", "gradient": "from-COULEUR-500 to-COULEUR-500", "ingredients": ["...", "..."], "kcalApprox": 000}]

Couleurs Tailwind valides : orange, pink, red, emerald, amber, stone, sky, purple, blue, teal, rose, yellow, lime, cyan, indigo, violet.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("ANTHROPIC API ERROR:", res.status, JSON.stringify(data));
      return new Response(JSON.stringify({ error: "Erreur API Anthropic" }), { status: 500 });
    }

    const textBlock = data.content?.find((c) => c.type === "text");
    const rawText = textBlock?.text || "[]";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const idees = JSON.parse(cleaned);

    await adminDb.collection("mealSuggestions").doc(`${user.uid}_${todayKey()}`).set({
      idees,
      keywords,
      generatedAt: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ idees }), { status: 200 });
  } catch (e) {
    console.error("SUGGEST MEALS POST ERROR:", e);
    return new Response(JSON.stringify({ error: "Erreur génération suggestions" }), { status: 500 });
  }
}