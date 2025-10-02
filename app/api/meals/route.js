import { db } from "../../lib/firebase.js";
import { authMiddleware } from "../users/route.js"; // réutilisation middleware

const mealsColl = () => db.collection("meals");
const foodsColl = () => db.collection("foods");

// 🔧 util: calcule kcal pour chaque item
async function enrichItems(rawItems = []) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return { items: [], totalKcal: 0 };

  const ids = [...new Set(rawItems.map(it => String(it.foodId)))];
  const snaps = await Promise.all(ids.map(id => foodsColl().doc(id).get()));
  const map = {};
  snaps.forEach(s => { if (s.exists) map[s.id] = s.data(); });

  const items = [];
  let totalKcal = 0;

  for (const it of rawItems) {
    const f = map[String(it.foodId)];
    if (!f) continue;
    const grams = Number(it.grams || 0);
    const kcal = Math.round((f.caloriesPer100g || 0) * grams / 100);
    items.push({ foodId: String(it.foodId), name: f.nom, grams, kcal });
    totalKcal += kcal;
  }

  return { items, totalKcal };
}

// 🟢 POST /api/meals → créer un repas
export async function POST(req) {
  try {
    const body = await req.json();
    const { date, mealType, items } = body;

    if (!date || !mealType || !Array.isArray(items)) {
      return new Response(JSON.stringify({ error: "date, mealType et items requis" }), { status: 400 });
    }

    const user = await authMiddleware(req);
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    const { items: cooked, totalKcal } = await enrichItems(items);
    const now = new Date();

    const payload = {
      userId: user.uid,
      date: String(date),
      mealType: String(mealType),
      items: cooked,
      totalKcal,
      createdAt: now,
      updatedAt: now,
    };

    const ref = await mealsColl().add(payload);
    return new Response(JSON.stringify({ id: ref.id, ...payload }), { status: 201 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}

// 🟢 GET /api/meals?date=2025-09-26&mealType=dejeuner
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const mealType = searchParams.get("mealType");

    if (!date) {
      return new Response(JSON.stringify({ error: "date requis (YYYY-MM-DD)" }), { status: 400 });
    }

    const user = await authMiddleware(req);
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    let q = mealsColl()
      .where("userId", "==", user.uid)
      .where("date", "==", String(date));

    if (mealType) q = q.where("mealType", "==", String(mealType));

    const snap = await q.orderBy("createdAt", "desc").get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return new Response(JSON.stringify(items), { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), { status: 500 });
  }
}
