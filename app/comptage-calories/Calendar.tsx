"use client";

import { useState } from "react";

type LimitRecord = {
  limitCalories: number;
  effectiveDate: string;
};

type DayEntry = {
  calories: number;
  proteines: number;
};

type CalendarProps = {
  entries: Record<string, DayEntry>;
  limitHistory: LimitRecord[];
  dailyLimit: number;
  dailyProteinGoal: number;
};

function getLimitForDate(
  dateKey: string,
  history: LimitRecord[],
  def: number,
) {
  const sorted = [...history].sort((a, b) =>
    b.effectiveDate.localeCompare(a.effectiveDate),
  );

  return (
    sorted.find((h) => h.effectiveDate <= dateKey)?.limitCalories ?? def
  );
}

export default function Calendar({
  entries,
  limitHistory,
  dailyLimit,
  dailyProteinGoal,
}: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return (
    <div className="rounded-2xl border border-gray-700 bg-gray-800 p-4">
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
          className="rounded-lg border border-gray-700 px-3 py-1 text-white hover:bg-gray-700"
        >
          ←
        </button>

        <h2 className="font-semibold text-white capitalize">
          {currentDate.toLocaleDateString("fr-FR", {
            month: "long",
            year: "numeric",
          })}
        </h2>

        <button
          onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
          className="rounded-lg border border-gray-700 px-3 py-1 text-white hover:bg-gray-700"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2 text-center text-xs text-gray-400">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-2">
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;

          const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

          const entry = entries[dateKey];

          let dayClass = "bg-gray-900 text-gray-300";

          if (entry) {
            const limit = getLimitForDate(
              dateKey,
              limitHistory,
              dailyLimit,
            );

            const caloriesOk = entry.calories <= limit;

            const proteinsOk =
              dailyProteinGoal > 0 &&
              entry.proteines >= dailyProteinGoal;

            if (caloriesOk && proteinsOk) {
              dayClass = "bg-blue-600 text-white";
            } else if (caloriesOk) {
              dayClass = "bg-cyan-600 text-white";
            }
          }

          return (
            <div
              key={day}
              className={`aspect-square rounded-xl border border-gray-800 p-2 text-xs font-medium ${dayClass}`}
            >
              {day}
            </div>
          );
        })}
      </div>
    </div>
  );
}