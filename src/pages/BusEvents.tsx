import React, { useEffect, useState, useMemo, useCallback } from "react";
import axios from "axios";
import { format, isWithinInterval } from "date-fns";
import { useLocation } from "react-router-dom";
import { API_BASE_URL } from "../config";
import { getDateRange } from "../utils/dateRangeFromTimeOption";
import LocationMapModal from "../components/LocationMapModal";
import { smartGpsConverter } from "../utils/gpsConverter";

interface AlertRow {
  id: string;
  type: "THEFT" | "REFUEL" | "SENSOR_HEALTH" | string;
  timestamp: string;
  description: string;
  location: { latitude: number; longitude: number } | null;
  bus: {
    id: string;
    registrationNumber: string;
    driverName: string;
    routeName: string;
  } | null;
  fuelDropLitres?: number | null;
  fuelAddedLitres?: number | null;
}

interface Vehicle {
  id: string;
  registrationNo: string;
  driver?: { name?: string };
  route?: { name?: string };
}

const BusEvents: React.FC = () => {
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const initialBus = query.get("bus");

  // Data
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [regToId, setRegToId] = useState<Record<string, string>>({});

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBus, setSelectedBus] = useState<string | null>(null); // registration number
  const [typeFilter, setTypeFilter] = useState<string>("");
  // For testing, use August data where we know there are events
  const [dateFilter, setDateFilter] = useState<string>("today"); // all|today|yesterday|week|month|custom
  const [customStartDate, setCustomStartDate] = useState("2025-08-01");
  const [customEndDate, setCustomEndDate] = useState("2025-08-31");
  const [currentPage, setCurrentPage] = useState(1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [mapCoords, setMapCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const itemsPerPage = 10;

  // Load vehicles for suggestions and enrichment
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get<any>(`${API_BASE_URL}/vehicles`);
        const vehiclesData = res.data?.data || res.data;
        setVehicles(vehiclesData);
        const map: Record<string, string> = {};
        vehiclesData.forEach((v: any) => { map[v.registrationNo] = v.id; });
        setRegToId(map);
      } catch (e) {
        console.error("Failed to load vehicles", e);
      }
    })();
  }, []);

  // Initialize from URL (?bus=REGNO)
  useEffect(() => {
    if (initialBus) {
      setSelectedBus(initialBus);
      setSearchTerm(initialBus);
    }
  }, [initialBus]);

  // Build suggestions from vehicles list
  const busSuggestions = useMemo(() => {
    return vehicles.map(v => v.registrationNo);
  }, [vehicles]);

  // Compute date range to send to backend
  const computeRange = useCallback((): { fromDate?: string; toDate?: string } => {
    if (dateFilter === "all") return {};
    if (dateFilter === "custom") {
      const s = customStartDate ? new Date(customStartDate + 'T00:00:00.000Z') : undefined;
      const e = customEndDate ? new Date(customEndDate + 'T23:59:59.999Z') : undefined;
      if (s && e) return { fromDate: s.toISOString(), toDate: e.toISOString() };
      return {};
    }
    const range = getDateRange(dateFilter); // <-- no title-casing
    if (range.startDate && range.endDate) {
      return { fromDate: range.startDate.toISOString(), toDate: range.endDate.toISOString() };
    }
    return {};
  }, [dateFilter, customStartDate, customEndDate]);

  // Fetch alerts/history from backend when filters change
  useEffect(() => {
    const fetchHistory = async () => {
      if (!selectedBus) {
        setAlerts([]);
        return;
      }
      const vehicleId = regToId[selectedBus];
      if (!vehicleId) {
        // if user typed a reg not in list, clear results
        setAlerts([]);
        return;
      }
      try {
        setLoading(true);
        setError(null);

        const { fromDate, toDate } = computeRange();

        const res = await axios.get<any>(`${API_BASE_URL}/history`, {
          params: {
            vehicleId,               // align with backend
            type: typeFilter || undefined,
            fromDate,
            toDate,
          },
        });

        const v = vehicles.find(v => v.id === vehicleId);
        const historyData = res.data?.data || res.data || [];

        const formatted: AlertRow[] = historyData.map((a: any) => {
          // location shape normalization
          const loc = a.location || a.gps || null;
          const rawLatitude =
            loc?.latitude ?? loc?.lat ?? (typeof a.latitude === "number" ? a.latitude : undefined);
          const rawLongitude =
            loc?.longitude ?? loc?.long ?? (typeof a.longitude === "number" ? a.longitude : undefined);

          // Convert GPS coordinates from Teltonika FMB920 format
          let location = null;
          if (rawLatitude != null && rawLongitude != null) {
            const converted = smartGpsConverter(rawLatitude, rawLongitude);
            location = { latitude: converted.latitude, longitude: converted.longitude };
          }

          // fuel change normalization
          const fuelChange: number | undefined =
            typeof a.fuelChange === "number"
              ? a.fuelChange
              : undefined;

          return {
            id: a.id,
            type: (a.type || "").toUpperCase(),
            timestamp: a.timestamp,
            description: a.description || "",
            location,
            bus: {
              id: vehicleId,
              registrationNumber: v?.registrationNo || selectedBus,
              driverName: v?.driver?.name || "Unknown",
              routeName: v?.route?.name || "Unknown",
            },
            fuelDropLitres: fuelChange && fuelChange < 0 ? Math.abs(fuelChange) : undefined,
            fuelAddedLitres: fuelChange && fuelChange > 0 ? fuelChange : undefined,
          };
        });

        setAlerts(formatted);
      } catch (err) {
        console.error("Error fetching history:", err);
        setError("Failed to load alerts. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();

    // Set up auto-reload every 15 minutes (900,000 milliseconds) if a bus is selected
    let intervalId: NodeJS.Timeout | null = null;
    if (selectedBus) {
      intervalId = setInterval(fetchHistory, 15 * 60 * 1000);
    }

    // Cleanup interval on component unmount or when dependencies change
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [selectedBus, typeFilter, dateFilter, customStartDate, customEndDate, regToId, vehicles, computeRange]);

  // Client-side filtered view (kept to support text search and extra filters)
  const filteredAlerts = useMemo(() => {
    let result = alerts;

    // Ensure only the selected bus
    if (selectedBus) {
      result = result.filter(a =>
        a.bus?.registrationNumber?.toLowerCase().includes(selectedBus.toLowerCase())
      );
    } else {
      return [];
    }

    // Redundant with server filter but harmless if user toggles type on UI quickly
    if (typeFilter) {
      result = result.filter(a => a.type === typeFilter);
    }

    // If user chose "custom" but dates partially missing, skip date filter
    if (dateFilter !== "all") {
      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (dateFilter === "custom") {
        if (customStartDate) startDate = new Date(customStartDate + 'T00:00:00.000Z');
        if (customEndDate) endDate = new Date(customEndDate + 'T23:59:59.999Z');
      } else {
        const range = getDateRange(dateFilter); // <-- no title-casing
        startDate = range.startDate;
        endDate = range.endDate;
      }

      if (startDate && endDate) {
        result = result.filter(a => {
          const eventDate = new Date(a.timestamp);
          return isWithinInterval(eventDate, { start: startDate!, end: endDate! });
        });
      }
    }

    return result;
  }, [alerts, selectedBus, typeFilter, dateFilter, customStartDate, customEndDate]);

  const paginatedAlerts = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAlerts.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAlerts, currentPage]);
  const pageCount = Math.ceil(filteredAlerts.length / itemsPerPage);

  // Handlers
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setShowSuggestions(e.target.value.length > 0);
  };

  const selectBus = (bus: string) => {
    setSelectedBus(bus);
    setSearchTerm(bus);
    setShowSuggestions(false);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSelectedBus(null);
    setSearchTerm("");
    setTypeFilter("");
    setDateFilter("all");
    setCustomStartDate("");
    setCustomEndDate("");
    setCurrentPage(1);
  };

  const eventIcon = (type: string) => {
    switch (type) {
      case "REFUEL": return "⛽";
      case "THEFT": return "🚨";
      case "SENSOR_HEALTH": return "🛠️";
      default: return "🔻";
    }
  };

  return (
    <div className="px-4 py-6 max-w-6xl mx-auto space-y-6 text-gray-800 dark:text-gray-100">
      <h2 className="text-3xl font-bold">🛑 Alerts History</h2>

      {/* Filter Box */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 border border-gray-100 dark:border-gray-700 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Bus Search */}
          <div className="relative">
            <label className="block text-sm font-medium mb-1">Bus Registration*</label>
            <input
              type="text"
              value={searchTerm}
              placeholder="Search bus..."
              onChange={handleSearchChange}
              onFocus={() => setShowSuggestions(true)}
              className="border px-3 py-2 rounded shadow-sm w-full dark:bg-gray-900 dark:border-gray-700 dark:text-white"
            />
            {showSuggestions && (
              <ul className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-900 border dark:border-gray-700 rounded shadow max-h-60 overflow-auto">
                {busSuggestions
                  .filter(bus => !searchTerm || bus.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((bus, index) => (
                    <li
                      key={index}
                      onClick={() => selectBus(bus)}
                      className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      {bus}
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {/* Event Type */}
          <div>
            <label className="block text-sm font-medium mb-1">Event Type</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="border rounded px-3 py-2 w-full dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              disabled={!selectedBus}
            >
              <option value="">All Types</option>
              <option value="THEFT">Theft</option>
              <option value="REFUEL">Refuel</option>
              <option value="SENSOR_HEALTH">Sensor Health</option>
            </select>
          </div>

          {/* Date Filter */}
          <div>
            <label className="block text-sm font-medium mb-1">Date Range</label>
            <select
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="border rounded px-3 py-2 w-full dark:bg-gray-900 dark:border-gray-700 dark:text-white"
              disabled={!selectedBus}
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="week">Last 7 Days</option>
              <option value="month">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Clear Button */}
          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 dark:text-white text-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 w-full"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* Custom Date Pickers */}
        {dateFilter === "custom" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="border rounded px-3 py-2 w-full dark:bg-gray-900 dark:border-gray-700 dark:text-white"
                disabled={!selectedBus}
                max={customEndDate || undefined}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Date</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="border rounded px-3 py-2 w-full dark:bg-gray-900 dark:border-gray-700 dark:text-white"
                disabled={!selectedBus}
                min={customStartDate || undefined}
              />
            </div>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-xl shadow p-6 text-center text-red-500 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Content */}
      {!loading && !error && (
        <>
          {!selectedBus && (
            <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow p-6 text-center text-gray-500 dark:text-gray-400">
              Please select a bus to view alerts.
            </div>
          )}

          {selectedBus && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-100 dark:border-gray-700">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                  <thead className="bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-300 uppercase">
                    <tr>
                      <th className="px-6 py-3 text-left">Type</th>
                      <th className="px-6 py-3 text-left">Bus</th>
                      <th className="px-6 py-3 text-left">Driver</th>
                      <th className="px-6 py-3 text-left">Route</th>
                      <th className="px-6 py-3 text-left">Description</th>
                      <th className="px-6 py-3 text-left">Location</th>
                      <th className="px-6 py-3 text-left">Time</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
                    {paginatedAlerts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                          No alerts found for the selected filters.
                        </td>
                      </tr>
                    ) : (
                      paginatedAlerts.map((alert) => (
                        <tr key={alert.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{eventIcon(alert.type)}</span>
                              <span className="capitalize text-sm">{alert.type.toLowerCase().replace('_', ' ')}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">{alert.bus?.registrationNumber || 'N/A'}</td>
                          <td className="px-6 py-4">{alert.bus?.driverName || 'Unknown'}</td>
                          <td className="px-6 py-4">{alert.bus?.routeName || 'Unknown'}</td>
                          <td className="px-6 py-4">
                            {alert.description}
                            {alert.fuelDropLitres != null && (
                              <span className="block text-xs text-red-500">Lost: {alert.fuelDropLitres}L</span>
                            )}
                            {alert.fuelAddedLitres != null && (
                              <span className="block text-xs text-green-500">Added: {alert.fuelAddedLitres}L</span>
                            )}
                          </td>
                          <td
                            className="px-6 py-4 text-sm text-blue-600 dark:text-blue-400 underline cursor-pointer"
                            onClick={() => {
                              if (alert.location) {
                                setMapCoords(alert.location);
                                setShowMap(true);
                              }
                            }}
                          >
                            {alert.location
                              ? `${alert.location.latitude.toFixed(3)}, ${alert.location.longitude.toFixed(3)}`
                              : 'N/A'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {format(new Date(alert.timestamp), "PPpp")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {pageCount > 1 && (
                <div className="flex justify-between items-center px-6 py-4">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm text-gray-800 dark:text-white disabled:opacity-50"
                  >
                    Previous
                  </button>

                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    Page {currentPage} of {pageCount}
                  </div>

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, pageCount))}
                    disabled={currentPage === pageCount}
                    className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm text-gray-800 dark:text-white disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Map Modal */}
      <LocationMapModal
        isOpen={showMap}
        onClose={() => setShowMap(false)}
        latitude={mapCoords?.latitude || 0}
        longitude={mapCoords?.longitude || 0}
      />
    </div>
  );
};

export default BusEvents;






// pages/BusEvents.tsx
// import React, { useEffect, useState, useMemo } from "react";
// import axios from "axios";
// import { format, isWithinInterval } from "date-fns";
// import { useLocation } from "react-router-dom";
// import { API_BASE_URL } from "../config";
// import { getDateRange } from "../utils/dateRangeFromTimeOption";
// import LocationMapModal from "../components/LocationMapModal";

// interface Alert {
//   id: string;
//   type: "THEFT" | "REFUEL" | "SENSOR_HEALTH" | string;
//   timestamp: string;
//   description: string;
//   location: { latitude: number; longitude: number } | null;
//   bus: {
//     id: string;
//     registrationNumber: string;
//     driverName: string;
//     routeName: string;
//   } | null;
//   fuelDropLitres?: number | null;
//   fuelAddedLitres?: number | null;
// }

// const BusEvents: React.FC = () => {
//   const location = useLocation();
//   const query = new URLSearchParams(location.search);
//   const initialBus = query.get("bus");

//   const [alerts, setAlerts] = useState<Alert[]>([]);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [searchTerm, setSearchTerm] = useState("");
//   const [selectedBus, setSelectedBus] = useState<string | null>(null);
//   const [typeFilter, setTypeFilter] = useState<string>("");
//   const [dateFilter, setDateFilter] = useState<string>("all");
//   const [customStartDate, setCustomStartDate] = useState("");
//   const [customEndDate, setCustomEndDate] = useState("");
//   const [currentPage, setCurrentPage] = useState(1);
//   const [showSuggestions, setShowSuggestions] = useState(false);
//   const [showMap, setShowMap] = useState(false);
//   const [mapCoords, setMapCoords] = useState<{ latitude: number; longitude: number } | null>(null);

//   const itemsPerPage = 10;

//   useEffect(() => {
//     if (initialBus) {
//       setSelectedBus(initialBus);
//       setSearchTerm(initialBus);
//     }
//   }, [initialBus]);

//   useEffect(() => {
//     const fetchAlerts = async () => {
//       try {
//         setLoading(true);
//         setError(null);
//         const res = await axios.get<Alert[]>(`${API_BASE_URL}/alerts/all`);

//         const formattedAlerts = res.data.map((alert: any) => ({
//           id: alert.id,
//           type: alert.type,
//           timestamp: alert.timestamp,
//           description: alert.description,
//           location: alert.location ? {
//             latitude: alert.location.lat || alert.location.latitude,
//             longitude: alert.location.long || alert.location.longitude
//           } : null,
//           bus: alert.bus ? {
//             id: alert.bus.id,
//             registrationNumber: alert.bus.registrationNumber || alert.bus.registrationNo,
//             driverName: alert.bus.driverName || alert.bus.driver,
//             routeName: alert.bus.routeName || alert.bus.route
//           } : null,
//           fuelDropLitres: alert.fuelDropLitres,
//           fuelAddedLitres: alert.fuelAddedLitres
//         }));

//         setAlerts(formattedAlerts);
//       } catch (err) {
//         console.error("Error fetching alerts:", err);
//         setError("Failed to load alerts. Please try again.");
//       } finally {
//         setLoading(false);
//       }
//     };

//     fetchAlerts();
//   }, []);

//   const busSuggestions = useMemo(() => {
//     const buses = alerts
//       .map(alert => alert.bus?.registrationNumber)
//       .filter(Boolean) as string[];
//     return [...new Set(buses)];
//   }, [alerts]);

//   const filteredAlerts = useMemo(() => {
//     let result = alerts;

//     if (selectedBus) {
//       result = result.filter(alert =>
//         alert.bus?.registrationNumber?.toLowerCase().includes(selectedBus.toLowerCase())
//       );
//     } else {
//       return [];
//     }

//     if (typeFilter) {
//       result = result.filter(alert => alert.type === typeFilter);
//     }

//     if (dateFilter !== "all") {
//       let startDate: Date | undefined;
//       let endDate: Date | undefined;

//       if (dateFilter === "custom") {
//         if (customStartDate) startDate = new Date(customStartDate);
//         if (customEndDate) endDate = new Date(customEndDate);
//       } else {
//         const range = getDateRange(
//           dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)
//         );
//         startDate = range.startDate;
//         endDate = range.endDate;
//       }

//       if (startDate && endDate) {
//         result = result.filter(alert => {
//           const eventDate = new Date(alert.timestamp);
//           return isWithinInterval(eventDate, { start: startDate, end: endDate });
//         });
//       }
//     }

//     return result;
//   }, [alerts, selectedBus, typeFilter, dateFilter, customStartDate, customEndDate]);

//   const paginatedAlerts = useMemo(() => {
//     const startIndex = (currentPage - 1) * itemsPerPage;
//     return filteredAlerts.slice(startIndex, startIndex + itemsPerPage);
//   }, [filteredAlerts, currentPage]);

//   const pageCount = Math.ceil(filteredAlerts.length / itemsPerPage);

//   const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//     setSearchTerm(e.target.value);
//     setShowSuggestions(e.target.value.length > 0);
//   };

//   const selectBus = (bus: string) => {
//     setSelectedBus(bus);
//     setSearchTerm(bus);
//     setShowSuggestions(false);
//     setCurrentPage(1);
//   };

//   const clearFilters = () => {
//     setSelectedBus(null);
//     setSearchTerm("");
//     setTypeFilter("");
//     setDateFilter("all");
//     setCustomStartDate("");
//     setCustomEndDate("");
//     setCurrentPage(1);
//   };

//   const eventIcon = (type: string) => {
//     switch (type) {
//       case "REFUEL": return "⛽";
//       case "THEFT": return "🚨";
//       case "SENSOR_HEALTH": return "🛠️";
//       default: return "🔻";
//     }
//   };

//   return (
//     <div className="px-4 py-6 max-w-6xl mx-auto space-y-6 text-gray-800 dark:text-gray-100">
//       <h2 className="text-3xl font-bold">🛑 Alerts History</h2>

//       {/* Filter Box */}
//       <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 border border-gray-100 dark:border-gray-700 space-y-4">
//         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
//           {/* Bus Search */}
//           <div className="relative">
//             <label className="block text-sm font-medium mb-1">Bus Registration*</label>
//             <input
//               type="text"
//               value={searchTerm}
//               placeholder="Search bus..."
//               onChange={handleSearchChange}
//               onFocus={() => setShowSuggestions(true)}
//               className="border px-3 py-2 rounded shadow-sm w-full dark:bg-gray-900 dark:border-gray-700 dark:text-white"
//             />
//             {showSuggestions && searchTerm && (
//               <ul className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-900 border dark:border-gray-700 rounded shadow max-h-60 overflow-auto">
//                 {busSuggestions
//                   .filter(bus => bus.toLowerCase().includes(searchTerm.toLowerCase()))
//                   .map((bus, index) => (
//                     <li
//                       key={index}
//                       onClick={() => selectBus(bus)}
//                       className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
//                     >
//                       {bus}
//                     </li>
//                   ))}
//               </ul>
//             )}
//           </div>

//           {/* Event Type */}
//           <div>
//             <label className="block text-sm font-medium mb-1">Event Type</label>
//             <select
//               value={typeFilter}
//               onChange={(e) => {
//                 setTypeFilter(e.target.value);
//                 setCurrentPage(1);
//               }}
//               className="border rounded px-3 py-2 w-full dark:bg-gray-900 dark:border-gray-700 dark:text-white"
//               disabled={!selectedBus}
//             >
//               <option value="">All Types</option>
//               <option value="THEFT">Theft</option>
//               <option value="REFUEL">Refuel</option>
//               <option value="SENSOR_HEALTH">Sensor Health</option>
//             </select>
//           </div>

//           {/* Date Filter */}
//           <div>
//             <label className="block text-sm font-medium mb-1">Date Range</label>
//             <select
//               value={dateFilter}
//               onChange={(e) => {
//                 setDateFilter(e.target.value);
//                 setCurrentPage(1);
//               }}
//               className="border rounded px-3 py-2 w-full dark:bg-gray-900 dark:border-gray-700 dark:text-white"
//               disabled={!selectedBus}
//             >
//               <option value="all">All Time</option>
//               <option value="today">Today</option>
//               <option value="yesterday">Yesterday</option>
//               <option value="week">Last 7 Days</option>
//               <option value="month">Last 30 Days</option>
//               <option value="custom">Custom Range</option>
//             </select>
//           </div>

//           {/* Clear Button */}
//           <div className="flex items-end">
//             <button
//               onClick={clearFilters}
//               className="px-4 py-2 bg-gray-200 dark:bg-gray-700 dark:text-white text-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600 w-full"
//             >
//               Clear Filters
//             </button>
//           </div>
//         </div>

//         {/* Custom Date Pickers */}
//         {dateFilter === "custom" && (
//           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
//             <div>
//               <label className="block text-sm font-medium mb-1">Start Date</label>
//               <input
//                 type="date"
//                 value={customStartDate}
//                 onChange={(e) => setCustomStartDate(e.target.value)}
//                 className="border rounded px-3 py-2 w-full dark:bg-gray-900 dark:border-gray-700 dark:text-white"
//                 disabled={!selectedBus}
//                 max={customEndDate || undefined}
//               />
//             </div>
//             <div>
//               <label className="block text-sm font-medium mb-1">End Date</label>
//               <input
//                 type="date"
//                 value={customEndDate}
//                 onChange={(e) => setCustomEndDate(e.target.value)}
//                 className="border rounded px-3 py-2 w-full dark:bg-gray-900 dark:border-gray-700 dark:text-white"
//                 disabled={!selectedBus}
//                 min={customStartDate || undefined}
//               />
//             </div>
//           </div>
//         )}
//       </div>

//       {/* Loading State */}
//       {loading && (
//         <div className="flex justify-center items-center py-20">
//           <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
//         </div>
//       )}

//       {/* Error State */}
//       {error && !loading && (
//         <div className="bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-xl shadow p-6 text-center text-red-500 dark:text-red-400">
//           {error}
//         </div>
//       )}

//       {/* Content */}
//       {!loading && !error && (
//         <>
//           {/* No Bus Selected */}
//           {!selectedBus && (
//             <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow p-6 text-center text-gray-500 dark:text-gray-400">
//               Please select a bus to view alerts.
//             </div>
//           )}

//           {/* Bus Selected */}
//           {selectedBus && (
//             <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-100 dark:border-gray-700">
//               <div className="overflow-x-auto">
//                 <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
//                   <thead className="bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-300 uppercase">
//                     <tr>
//                       <th className="px-6 py-3 text-left">Type</th>
//                       <th className="px-6 py-3 text-left">Bus</th>
//                       <th className="px-6 py-3 text-left">Driver</th>
//                       <th className="px-6 py-3 text-left">Route</th>
//                       <th className="px-6 py-3 text-left">Description</th>
//                       <th className="px-6 py-3 text-left">Location</th>
//                       <th className="px-6 py-3 text-left">Time</th>
//                     </tr>
//                   </thead>
//                   <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
//                     {paginatedAlerts.length === 0 ? (
//                       <tr>
//                         <td colSpan={7} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
//                           No alerts found for the selected filters.
//                         </td>
//                       </tr>
//                     ) : (
//                       paginatedAlerts.map((alert) => (
//                         <tr key={alert.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
//                           <td className="px-6 py-4 whitespace-nowrap">
//                             <div className="flex items-center gap-2">
//                               <span className="text-lg">{eventIcon(alert.type)}</span>
//                               <span className="capitalize text-sm">{alert.type.toLowerCase().replace('_', ' ')}</span>
//                             </div>
//                           </td>
//                           <td className="px-6 py-4">{alert.bus?.registrationNumber || 'N/A'}</td>
//                           <td className="px-6 py-4">{alert.bus?.driverName || 'N/A'}</td>
//                           <td className="px-6 py-4">{alert.bus?.routeName || 'N/A'}</td>
//                           <td className="px-6 py-4">
//                             {alert.description}
//                             {alert.fuelDropLitres && (
//                               <span className="block text-xs text-red-500">Lost: {alert.fuelDropLitres}L</span>
//                             )}
//                             {alert.fuelAddedLitres && (
//                               <span className="block text-xs text-green-500">Added: {alert.fuelAddedLitres}L</span>
//                             )}
//                           </td>
//                           <td 
//                             className="px-6 py-4 text-sm text-blue-600 dark:text-blue-400 underline cursor-pointer"
//                             onClick={() => {
//                               if (alert.location) {
//                                 setMapCoords(alert.location);
//                                 setShowMap(true);
//                               }
//                             }}
//                           >
//                             {alert.location ? 
//                               `${alert.location.latitude.toFixed(3)}, ${alert.location.longitude.toFixed(3)}` : 
//                               'N/A'}
//                           </td>
//                           <td className="px-6 py-4 text-sm text-gray-500">
//                             {format(new Date(alert.timestamp), "PPpp")}
//                           </td>
//                         </tr>
//                       ))
//                     )}
//                   </tbody>
//                 </table>
//               </div>

//               {/* Pagination */}
//               {pageCount > 1 && (
//                 <div className="flex justify-between items-center px-6 py-4">
//                   <button
//                     onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
//                     disabled={currentPage === 1}
//                     className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm text-gray-800 dark:text-white disabled:opacity-50"
//                   >
//                     Previous
//                   </button>

//                   <div className="text-sm text-gray-700 dark:text-gray-300">
//                     Page {currentPage} of {pageCount}
//                   </div>

//                   <button
//                     onClick={() => setCurrentPage(prev => Math.min(prev + 1, pageCount))}
//                     disabled={currentPage === pageCount}
//                     className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm text-gray-800 dark:text-white disabled:opacity-50"
//                   >
//                     Next
//                   </button>
//                 </div>
//               )}
//             </div>
//           )}
//         </>
//       )}

//       {/* Map Modal */}
//       <LocationMapModal
//         isOpen={showMap}
//         onClose={() => setShowMap(false)}
//         latitude={mapCoords?.latitude || 0}
//         longitude={mapCoords?.longitude || 0}
//       />
//     </div>
//   );
// };

// export default BusEvents;



