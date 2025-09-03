import React, { useMemo, useState } from "react";
import { format } from "date-fns";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

type Props = {
  busSearch: string;
  setBusSearch: (val: string) => void;
  selectedBusId: string | null;                 // parent passes the selected REG (or null)
  setSelectedBusId: (val: string | null) => void; // parent handles URL + id mapping
  timeRange: string;
  setTimeRange: (val: string) => void;
  customStart: string;
  setCustomStart: (val: string) => void;
  customEnd: string;
  setCustomEnd: (val: string) => void;
  busSuggestions: string[];                     // <-- new: parent supplies suggestions
};

// Keep keys aligned with getDateRange: today|yesterday|week|month|custom
const timeOptions = ["today", "yesterday", "week", "month", "custom"] as const;

const BusTimeFilter: React.FC<Props> = ({
  busSearch,
  setBusSearch,
  selectedBusId,
  setSelectedBusId,
  timeRange,
  setTimeRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  busSuggestions,
}) => {
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filtered = useMemo(() => {
    const q = busSearch.trim().toLowerCase();
    return q ? busSuggestions.filter(s => s.toLowerCase().includes(q)) : busSuggestions;
  }, [busSearch, busSuggestions]);

  const parsedStart = customStart ? new Date(customStart) : undefined;
  const parsedEnd = customEnd ? new Date(customEnd) : undefined;

  const handlePick = (regNo: string) => {
    setSelectedBusId(regNo);     // parent will map regNo -> vehicleId and sync URL
    setBusSearch(regNo);
    setShowSuggestions(false);
  };

  const notFound = busSearch.length > 0 && !busSuggestions.includes(busSearch);

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow border border-gray-200 dark:border-gray-700 space-y-6">
      {/* Bus Search with suggestions */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-100 mb-1">
          Search by Bus Registration No.
        </label>
        <div className="relative">
          <input
            type="text"
            value={busSearch}
            onChange={(e) => setBusSearch(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="e.g. UP32AB1234"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-4 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-900 dark:text-white"
            autoComplete="off"
          />
          {showSuggestions && (
            <ul className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-900 border dark:border-gray-700 rounded shadow max-h-60 overflow-auto">
              {filtered.length > 0 ? (
                filtered.map((reg) => (
                  <li
                    key={reg}
                    onMouseDown={() => handlePick(reg)}
                    className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    {reg}
                  </li>
                ))
              ) : (
                <li className="px-4 py-2 text-gray-500 dark:text-gray-400">No matches found</li>
              )}
            </ul>
          )}
          {busSearch && notFound && (
            <p className="text-sm text-red-500 mt-2">
              ⚠️ Bus not found. Please check the registration number.
            </p>
          )}
        </div>
      </div>

      {/* Time Range */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-100 mb-1">
          Time Range
        </label>
        <select
          value={timeRange}
          onChange={(e) => {
            const val = e.target.value;
            setTimeRange(val);
            if (val !== "custom") {
              setCustomStart("");
              setCustomEnd("");
              setShowStartPicker(false);
              setShowEndPicker(false);
            }
          }}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-4 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-900 dark:text-white"
          disabled={!selectedBusId}
        >
          {timeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Custom Range (DayPicker) */}
      {timeRange === "custom" && (
        <div className="flex flex-wrap gap-6 pt-2">
          {/* Start */}
          <div>
            <label className="text-sm font-medium dark:text-gray-100">Start Date</label>
            {showStartPicker ? (
              <DayPicker
                mode="single"
                selected={parsedStart}
                onSelect={(date) => {
                  if (date) setCustomStart(date.toISOString());
                  setShowStartPicker(false);
                }}
                fromDate={new Date(2020, 0, 1)}
                toDate={new Date()}
                captionLayout="dropdown"
                className="border rounded-md p-2 dark:bg-gray-900 dark:border-gray-600"
              />
            ) : (
              <>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                  Selected:{" "}
                  <span className="font-semibold">
                    {parsedStart ? format(parsedStart, "PPP") : "Not selected"}
                  </span>
                </p>
                <button
                  className="text-sm text-blue-600 dark:text-blue-400 underline mt-1"
                  onClick={() => setShowStartPicker(true)}
                  disabled={!selectedBusId}
                >
                  Change Start Date
                </button>
              </>
            )}
          </div>

          {/* End */}
          <div>
            <label className="text-sm font-medium dark:text-gray-100">End Date</label>
            {showEndPicker ? (
              <DayPicker
                mode="single"
                selected={parsedEnd}
                onSelect={(date) => {
                  if (date) setCustomEnd(date.toISOString());
                  setShowEndPicker(false);
                }}
                fromDate={new Date(2020, 0, 1)}
                toDate={new Date()}
                captionLayout="dropdown"
                className="border rounded-md p-2 dark:bg-gray-900 dark:border-gray-600"
              />
            ) : (
              <>
                <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                  Selected:{" "}
                  <span className="font-semibold">
                    {parsedEnd ? format(parsedEnd, "PPP") : "Not selected"}
                  </span>
                </p>
                <button
                  className="text-sm text-blue-600 dark:text-blue-400 underline mt-1"
                  onClick={() => setShowEndPicker(true)}
                  disabled={!selectedBusId}
                >
                  Change End Date
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default BusTimeFilter;
