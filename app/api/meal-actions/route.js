export const runtime = "nodejs";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireAuth } from "@/lib/authMiddleware";

const DAILY_POULET_G = 500;
const DAILY_WHEY_G = 45;
const POULET_KCAL_100G = 110;
const POULET_PROT_100G = 23;
const WHEY_KCAL_45G = 180;
const WHEY_PROT_45G = 42;

// POST — deux actions possibles : "shopping" ou "log"
export async function POST(req) {
  const user = await requireAuth();
  if (!user) return new Response(JSON.stringify({ error: "Non autorisé" }), { status: 401 });

  try {
    const body = await req.json();
    const { action, idee, jours = 1 } = body;

    if (action === "shopping") {
      const items = idee.ingredients.map((ing) => ({
        nom: ing.nom,
        grammes: Math.round(ing.grammes * jours),
      }));
      items.push({ nom: "Blanc de poulet cru", grammes: DAILY_POULET_G * jours });
      items.push({ nom: "Clear Whey", grammes: DAILY_WHEY_G * jours });

      await adminDb.collection("shoppingLists").add({
        userId: user.uid,
        source: idee.nom,
        jours,
        items,
        createdAt: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ success: true, items }), { status: 200 });
    }

    if (action === "log") {
      const kcalTotal = idee.kcalApprox + Math.round((DAILY_POULET_G / 100) * POULET_KCAL_100G) + WHEY_KCAL_45G;
      const protTotal = idee.proteinesApprox + Math.round((DAILY_POULET_G / 100) * POULET_PROT_100G) + WHEY_PROT_45G;

      const dateKey = new Date().toISOString().slice(0, 10);
      await adminDb.collection("calorieEntries").add({
        userId: user.uid,
        dateKey,
        source: idee.nom,
        calories: kcalTotal,
        proteines: protTotal,
        createdAt: new Date().toISOString(),
      });

      return new Response(JSON.stringify({ success: true, calories: kcalTotal, proteines: protTotal }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: "Action inconnue" }), { status: 400 });
  } catch (e) {
    console.error("MEAL ACTIONS ERROR:", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}