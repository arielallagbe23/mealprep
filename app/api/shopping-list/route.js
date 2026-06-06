export const runtime = "nodejs";
import { adminDb } from "@/lib/firebaseAdmin";

export async function POST(req) {
  try {
    const body = await req.json();
    const { mealIds = [], portionsByMeal = {} } = body || {};
    if (!Array.isArray(mealIds) || mealIds.length === 0) {
      return new Response(JSON.stringify({ error:"mealIds[] requis" }), { status: 400 });
    }

    // Récupère les repas + le référentiel aliments en parallèle
    const [snaps, foodsSnap] = await Promise.all([
      Promise.all(mealIds.map(id => adminDb.collection("meals").doc(id).get())),
      adminDb.collection("foods").get(),
    ]);
    const meals = snaps.filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }));

    // Index du référentiel : foodId → { caloriesPer100g, proteinesPer100g, typeName }
    const foodRef = {};
    foodsSnap.forEach(doc => { foodRef[doc.id] = doc.data(); });

    // Agrégation par foodId (ou nom si foodId absent)
    const acc = new Map();
    for (const meal of meals) {
      const mult = Number(portionsByMeal[meal.id] ?? meal.portions ?? 1);
      for (const it of meal.items || []) {
        const key = it.foodId || it.nom;
        // Toujours utiliser les valeurs du référentiel si disponibles
        const ref = it.foodId ? (foodRef[it.foodId] || {}) : {};
        const prev = acc.get(key) || {
          foodId: it.foodId || null,
          nom: ref.nom || it.nom,
          typeName: ref.typeName || it.typeName || "Autres",
          caloriesPer100g: ref.caloriesPer100g ?? it.caloriesPer100g ?? 0,
          proteinesPer100g: ref.proteinesPer100g ?? it.proteinesPer100g ?? 0,
          grams: 0,
        };
        prev.grams += (Number(it.gramsPerPortion) || 0) * mult;
        acc.set(key, prev);
      }
    }

    const list = Array.from(acc.values())
      .map(x => {
        const grams = Math.round(x.grams / 5) * 5;
        return {
          ...x,
          grams,
          kcal: Math.round((grams / 100) * x.caloriesPer100g),
          prot: Math.round((grams / 100) * x.proteinesPer100g * 10) / 10,
        };
      })
      .sort((a, b) => (a.typeName || "").localeCompare(b.typeName || "") || a.nom.localeCompare(b.nom));

    return new Response(JSON.stringify({ items: list }), { status: 200 });
  } catch (e) {
    console.error("SHOPPING LIST ERROR", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}
