"use client";

import RequireAuth from "@/components/RequireAuth";
import FoodsList from "./components/FoodsList";
import MealSummary from "./components/MealSummary";
import ParamsCard from "./components/ParamsCard";
import { useComposer } from "./useComposer";

export default function Composer({ apiBaseUrl = "" }: { apiBaseUrl?: string }) {
  const {
    loading,
    err,
    dailyKcal,
    setDailyKcal,
    mealBudgetKcal,
    surplusKcal,
    activeMeals,
    composingMeal,
    toggleMeal,
    setComposingMeal,
    mealDistribution,
    mealTargetKcal,
    typeBadge,
    autoQuantities,
    grouped,
    selected,
    addFood,
    removeFood,
    selectedList,
    nbRepas,
    setNbRepas,
    updateFoodGrams,
    totals,
    saveMeal,
    success,
    wheyActive,
    setWheyActive,
  } = useComposer(apiBaseUrl);

  return (
    <RequireAuth>
      <div className="w-full min-h-screen bg-gradient-to-b from-gray-900 to-gray-900 px-4 py-6">
        <div className="w-full max-w-md mx-auto space-y-6">
          <ParamsCard
            dailyKcal={dailyKcal}
            setDailyKcal={setDailyKcal}
            mealBudgetKcal={mealBudgetKcal}
            surplusKcal={surplusKcal}
            activeMeals={activeMeals}
            composingMeal={composingMeal}
            onToggleMeal={toggleMeal}
            onSelectMeal={setComposingMeal}
            mealDistribution={mealDistribution}
            mealTargetKcal={mealTargetKcal}
            loading={loading}
            err={err}
            onAutoQuantities={autoQuantities}
            typeBadge={typeBadge}
            wheyActive={wheyActive}
            onToggleWhey={() => setWheyActive((a) => !a)}
          />

          <FoodsList
            grouped={grouped}
            selected={selected}
            loading={loading}
            err={err}
            onAddFood={addFood}
            onRemoveFood={removeFood}
          />

          <MealSummary
            selectedList={selectedList}
            nbRepas={nbRepas}
            setNbRepas={setNbRepas}
            updateFoodGrams={updateFoodGrams}
            totals={totals}
            mealTargetKcal={mealTargetKcal}
            dailyKcal={dailyKcal}
            onSaveMeal={saveMeal}
            success={success}
            wheyActive={wheyActive}
          />
        </div>
      </div>
    </RequireAuth>
  );
}
