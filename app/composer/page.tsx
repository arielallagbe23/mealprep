"use client";

import RequireAuth from "@/components/RequireAuth";
import Sidebar from "@/components/Sidebar";
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
    dailyProteines,
    setDailyProteines,
    mealTargetProteines,
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
  } = useComposer(apiBaseUrl);

  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-900 flex flex-col md:flex-row">
        <Sidebar />
        <main className="flex-1 px-4 py-6 md:py-10">
        <div className="w-full max-w-md mx-auto space-y-6">
          <ParamsCard
            dailyKcal={dailyKcal}
            setDailyKcal={setDailyKcal}
            dailyProteines={dailyProteines}
            setDailyProteines={setDailyProteines}
            mealTargetProteines={mealTargetProteines}
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
            mealTargetProteines={mealTargetProteines}
            onSaveMeal={saveMeal}
            success={success}
          />
        </div>
        </main>
      </div>
    </RequireAuth>
  );
}
