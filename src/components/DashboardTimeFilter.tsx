// components/DashboardTimeFilter.tsx
import React from "react";


export type TimeRangeValue = "today" | "yesterday" | "week" | "month" | "custom";

interface DashboardTimeFilterProps {
  range: TimeRangeValue;
  customStart: string;                 // "YYYY-MM-DD"
  customEnd: string;                   // "YYYY-MM-DD"
  onRangeChange: (range: TimeRangeValue) => void;
  onCustomDateChange: (start: string, end: string) => void;
}

const timeOptions: { label: string; value: TimeRangeValue }[] = [
  { label: "Today", value: "today" },
  { label: "Yesterday", value: "yesterday" },
  { label: "Last 7 Days", value: "week" },
  { label: "Last 30 Days", value: "month" },
  { label: "Custom", value: "custom" },
];

const DashboardTimeFilter: React.FC<DashboardTimeFilterProps> = ({
  range,
  customStart,
  customEnd,
  onRangeChange,
  onCustomDateChange,
}) => {
  const handleStartChange = (start: string) => {
    // Auto-fix if start > end
    if (customEnd && start && start > customEnd) {
      onCustomDateChange(start, start);
    } else {
      onCustomDateChange(start, customEnd);
    }
  };

  const handleEndChange = (end: string) => {
    // Auto-fix if end < start
    if (customStart && end && end < customStart) {
      onCustomDateChange(customStart, customStart);
    } else {
      onCustomDateChange(customStart, end);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mb-4">
      {/* Time Range Dropdown */}
      <label className="sr-only" htmlFor="dashboard-range">Time range</label>
      <select
  id="dashboard-range"
  value={range}
  onChange={(e) => {
    const v = e.target.value as TimeRangeValue;
    onRangeChange(v);
    if (v !== "custom") {
      onCustomDateChange("", ""); // clear stale custom dates
    }
  }}
  className="px-3 py-2 rounded bg-white text-gray-800 dark:bg-gray-800 dark:text-white border dark:border-gray-600"
>
        {timeOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Custom Date Pickers */}
      {range === "custom" && (
        <div className="flex gap-2 items-center">
          <label className="text-sm text-gray-700 dark:text-gray-200" htmlFor="custom-start">
            From:
          </label>
          <input
            id="custom-start"
            type="date"
            value={customStart}
            max={customEnd || undefined}
            onChange={(e) => handleStartChange(e.target.value)}
            className="px-2 py-1 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-white border dark:border-gray-600"
          />
          <label className="text-sm text-gray-700 dark:text-gray-200" htmlFor="custom-end">
            To:
          </label>
          <input
            id="custom-end"
            type="date"
            value={customEnd}
            min={customStart || undefined}
            onChange={(e) => handleEndChange(e.target.value)}
            className="px-2 py-1 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-white border dark:border-gray-600"
          />
        </div>
      )}
    </div>
  );
};

export default DashboardTimeFilter;
