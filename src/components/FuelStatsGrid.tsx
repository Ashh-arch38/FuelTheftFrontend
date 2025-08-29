// src/components/FuelStatsGrid.tsx
import React from "react";

type NumLike = number | string | null | undefined;

interface FuelUsageStats {
  total_fuel_consumed?: NumLike;
  total_fuel_stolen?: NumLike;
  total_fuel_refueled?: NumLike;
  distance_traveled?: NumLike;
  fuel_efficiency?: NumLike;
}

interface Props {
  stats?: Partial<FuelUsageStats> | null; // allow partial / null while loading
  loading?: boolean;
}

const fmt = (val: NumLike, unit = "", digits = 2) => {
  const num =
    typeof val === "string" ? Number(val) :
    typeof val === "number" ? val :
    null;

  if (num === null || Number.isNaN(num) || !Number.isFinite(num)) return "--";
  return `${num.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
};

const Card: React.FC<{
  title: string;
  value: React.ReactNode;
  className?: string;
  gradient?: string;
}> = ({ title, value, className, gradient = "from-slate-50 to-white dark:from-slate-800 dark:to-slate-900" }) => (
  <div
    className={[
      `bg-gradient-to-br ${gradient} p-6 rounded-2xl shadow-lg`,
      "border border-slate-200/50 dark:border-slate-700/50",
      "backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:scale-[1.02]",
      "animate-fade-in",
      className || "",
    ].join(" ")}
  >
    <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-3 uppercase tracking-wide">
      {title}
    </h4>
    <div className="text-2xl font-bold">{value}</div>
  </div>
);

const Skeleton: React.FC = () => (
  <div
    className="animate-pulse h-8 w-32 rounded-lg bg-slate-200 dark:bg-slate-700"
    aria-hidden="true"
  />
);

const FuelStatsGrid: React.FC<Props> = ({ stats, loading }) => {
  const consumed = fmt(stats?.total_fuel_consumed, "L");
  const stolen = fmt(stats?.total_fuel_stolen, "L");
  const refueled = fmt(stats?.total_fuel_refueled, "L");
  const distance = fmt(stats?.distance_traveled, "km");
  const efficiency = fmt(stats?.fuel_efficiency, "km/L");

  return (
    <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
      <Card
        title="Total Fuel Consumed"
        gradient="from-blue-50 via-blue-100 to-blue-200 dark:from-blue-900/30 dark:via-blue-800/30 dark:to-blue-700/30"
        value={
          loading ? <Skeleton /> : (
            <span className="text-blue-700 dark:text-blue-300">{consumed}</span>
          )
        }
      />
      <Card
        title="Fuel Stolen"
        gradient="from-red-50 via-red-100 to-red-200 dark:from-red-900/30 dark:via-red-800/30 dark:to-red-700/30"
        value={
          loading ? <Skeleton /> : (
            <span className="text-red-700 dark:text-red-300">{stolen}</span>
          )
        }
      />
      <Card
        title="Fuel Refueled"
        gradient="from-green-50 via-green-100 to-green-200 dark:from-green-900/30 dark:via-green-800/30 dark:to-green-700/30"
        value={
          loading ? <Skeleton /> : (
            <span className="text-green-700 dark:text-green-300">{refueled}</span>
          )
        }
      />
      <Card
        title="Distance Traveled"
        gradient="from-yellow-50 via-yellow-100 to-orange-100 dark:from-yellow-900/30 dark:via-yellow-800/30 dark:to-orange-800/30"
        value={
          loading ? <Skeleton /> : (
            <span className="text-orange-700 dark:text-orange-300">{distance}</span>
          )
        }
      />
      <Card
        title="Fuel Efficiency"
        gradient="from-purple-50 via-purple-100 to-purple-200 dark:from-purple-900/30 dark:via-purple-800/30 dark:to-purple-700/30"
        value={
          loading ? <Skeleton /> : (
            <span className="text-purple-700 dark:text-purple-300">{efficiency}</span>
          )
        }
      />
    </div>
  );
};

export default FuelStatsGrid;
