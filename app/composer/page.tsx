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
    <RequireAuth adminOnly>
      <div className="min-h-screen bg-gray-900 flex flex-col md:flex-row">
        <Sidebar />
        <main className="flex-1 px-4 py-6 md:py-10">
        <div className="w-full max-w-md lg:max-w-7xl mx-auto space-y-6 lg:space-y-0 lg:grid lg:grid-cols-[300px_1fr_340px] lg:items-start lg:gap-6">
          <div className="lg:sticky lg:top-6">
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
          </div>

          <FoodsList
            grouped={grouped}
            selected={selected}
            loading={loading}
            err={err}
            onAddFood={addFood}
            onRemoveFood={removeFood}
          />

          <div className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
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
        </div>
        </main>
      </div>
    </RequireAuth>
  );
}
