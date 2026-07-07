# Notes — Actions manuelles restantes

## Firestore : collections à nettoyer manuellement

La collection suivante n'est plus utilisée par aucune route API ni page depuis la migration vers `calorieEntries` + `calorieData`. Elle peut être supprimée depuis la console Firebase si elle est vide ou obsolète.

### `calorieLogs`
- **Ancienne structure** : `{ userId, date, mealKcal, dayKcal, label, createdAt }`
- **Remplacée par** : collections `calorieEntries` et `calorieData`
- **Action** : vérifier dans la console Firebase si des documents existent, puis supprimer la collection si inutile

**Console Firebase** → Firestore Database → collection `calorieLogs` → supprimer tous les documents

---

## Note sur calorie-auth/entry

La route `/api/calorie-auth/entry` est conservée car elle est encore appelée depuis :
- `app/composer/components/MealSummary.tsx` (ligne 50)

Les routes `/api/calorie-auth/login` et `/api/calorie-auth/token` ont été supprimées car aucune page ne les appelle.
