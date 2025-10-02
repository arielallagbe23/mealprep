export const runtime = "nodejs";
import { adminDb } from "@/lib/firebaseAdmin";

export async function POST(req) {
  try {
    const body = await req.json();
    const { mealIds = [], portionsByMeal = {} } = body || {};
    if (!Array.isArray(mealIds) || mealIds.length === 0) {
      return new Response(JSON.stringify({ error:"mealIds[] requis" }), { status: 400 });
    }

    // Récupère les repas
    const reads = mealIds.map(id => adminDb.collection("meals").doc(id).get());
    const snaps = await Promise.all(reads);
    const meals = snaps.filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }));

    // Agrégation par foodId (ou nom si foodId absent)
    const acc = new Map(); // key = foodId||nom
    for (const meal of meals) {
      const mult = Number(portionsByMeal[meal.id] ?? meal.portions ?? 1);
      for (const it of meal.items || []) {
        const key = it.foodId || it.nom;
        const prev = acc.get(key) || { 
          foodId: it.foodId || null,
          nom: it.nom,
          typeName: it.typeName || "Autres",
          caloriesPer100g: it.caloriesPer100g || 0,
          grams: 0
        };
        prev.grams += (Number(it.gramsPerPortion) || 0) * mult;
        acc.set(key, prev);
      }
    }

    const list = Array.from(acc.values())
      .map(x => ({ ...x, grams: Math.round(x.grams / 5) * 5 })) // arrondi par 5g
      .sort((a,b) => (a.typeName||"").localeCompare(b.typeName||"") || a.nom.localeCompare(b.nom));

    return new Response(JSON.stringify({ items: list }), { status: 200 });
  } catch (e) {
    console.error("SHOPPING LIST ERROR", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}
