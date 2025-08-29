// src/pages/FuelTheft.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE_URL } from "../config";
import BusTimeFilter from "../components/BusTimeFilter";
import FuelChart from "../components/FuelChart";
import MonitoredBusCard from "../components/MonitoredBusCard";
import { getDateRange } from "../utils/dateRangeFromTimeOption";
import FuelStatsGrid from "../components/FuelStatsGrid";
import { markFuelEvents } from "../utils/markFuelEvents";
import { determineSensorStatus } from "../utils/sensorStatus";
import type { FuelReading } from "../types/fuel";

// Backend expects `busId` for /sensor per API spec
const SENSOR_ID_PARAM = "busId" as const;

type ISODate = string;

interface FuelUsageStats {
  totalFuelConsumed: number;
  totalFuelStolen: number;
  totalFuelRefueled: number;
  distanceTravelled: number;
  fuelEfficiency: number;
}

interface Alert {
  id: string;
  timestamp: ISODate;
  type: string;
  description?: string;
}

interface VehicleDetailResponse {
  registrationNo?: string;
  driver?: { name?: string };
  route?: { name?: string };
  alerts?: Alert[];
  readings?: FuelReading[];
  sensor?: {
    Alert?: Alert[];
    alerts?: Alert[];
    readings?: FuelReading[];
    isActive?: boolean;
  };
}

interface Vehicle {
  id: string;
  registrationNo: string;
  driver?: { name?: string };
  route?: { name?: string };
}

interface BusDetails {
  registrationNo: string;
  driver: string;
  route: string;
  currentFuelLevel: number;
  status: "normal" | "offline";
  lastSeen?: string | null;
}

const FuelTheft: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const query = new URLSearchParams(location.search);
  const initialRegNo = query.get("bus"); // bus query param = registration number

  // bootstrap vehicles for suggestions + id mapping
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const regToId = useMemo(() => {
    const map: Record<string, string> = {};
    vehicles.forEach((v) => {
      map[v.registrationNo] = v.id;
    });
    return map;
  }, [vehicles]);

  // UI State
  const [selectedReg, setSelectedReg] = useState<string | null>(null); // registration number for UI/URL
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null); // internal id for API calls
  const [search, setSearch] = useState("");
  // For testing, use August data where we know there are events
  const [timeRange, setTimeRange] = useState("today");
  const [customStart, setCustomStart] = useState<string>("2025-08-01");
  const [customEnd, setCustomEnd] = useState<string>("2025-08-31");

  const [fuelData, setFuelData] = useState<FuelReading[]>([]);
  const [busDetails, setBusDetails] = useState<BusDetails | null>(null);
  const [fuelStats, setFuelStats] = useState<FuelUsageStats | null>(null);
  const [, setNoData] = useState(false);
  // Cache last successful data to avoid flashing errors when sensor data missing
  const lastGoodRef = React.useRef<{
    fuelData: FuelReading[];
    busDetails: BusDetails | null;
    fuelStats: FuelUsageStats | null;
    selectedVehicleId: string | null;
  }>({ fuelData: [], busDetails: null, fuelStats: null, selectedVehicleId: null });

  // Load vehicles once
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get<any>(`${API_BASE_URL}/vehicles`);
        setVehicles(res.data?.data || res.data || []);
      } catch (e) {
        console.error("Failed to load vehicles", e);
      }
    })();
  }, []);

  // Initialize selection from URL (?bus=REGNO)
  useEffect(() => {
    if (!initialRegNo || vehicles.length === 0) return;
    setSelectedReg(initialRegNo);
    setSearch(initialRegNo);
    const id = regToId[initialRegNo];
    setSelectedVehicleId(id || null);
    
    // Set basic bus details immediately
    const vehicle = vehicles.find(v => v.registrationNo === initialRegNo);
    if (vehicle) {
      setBusDetails({
        registrationNo: vehicle.registrationNo,
        driver: vehicle.driver?.name || "Unassigned",
        route: vehicle.route?.name || "Unknown",
        currentFuelLevel: 0, // Will be updated when data is fetched
        status: "normal", // Will be updated when data is fetched
      });
    }
  }, [initialRegNo, vehicles, regToId]);

  // Suggestions (sorted & de-duped)
  const busSuggestions = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.registrationNo))).sort(),
    [vehicles]
  );

  // When the user picks a bus in the filter
  // handleSelectBus kept for future usage; suppress unused by referencing conditionally
  // remove unused local handler to satisfy linter

  useEffect(() => {
    if (!selectedVehicleId) {
      setFuelData([]);
      setBusDetails(null);
      setFuelStats(null);
      setNoData(false);
      return;
    }

    // date range
    const range =
      timeRange === "custom"
        ? {
            startDate: customStart ? new Date(customStart + 'T00:00:00.000Z') : undefined,
            endDate: customEnd ? new Date(customEnd + 'T23:59:59.999Z') : undefined,
          }
        : getDateRange(timeRange);

    const startDate = range?.startDate;
    const endDate = range?.endDate;

    const fetchBusData = async () => {
      try {
        // Require both dates; if missing, default to today
        const now = new Date();
        const fromDate = (startDate ?? new Date(now.setHours(0, 0, 0, 0))).toISOString();
        const toDate = (endDate ?? new Date()).toISOString();

        // 1) Get vehicle info to determine sensor status
        let sensorStatus = "offline";
        let allowedSensorIds: string[] = [];
        let lastSeen = null;
        
        try {
          const vehicleRes = await axios.get<any>(`${API_BASE_URL}/vehicles`);
          const vehicles = vehicleRes.data?.data || vehicleRes.data;
          const vehicle = vehicles.find((v: any) => v.id === selectedVehicleId);
          
          if (vehicle) {
            lastSeen = vehicle.sensorLastSeen;
            sensorStatus = determineSensorStatus({
              sensorStatus: vehicle.sensorStatus,
              sensorLastSeen: vehicle.sensorLastSeen
            });
          }
        } catch (vehicleErr) {
          console.warn(`Failed to fetch vehicle info for ${selectedVehicleId}:`, vehicleErr);
          sensorStatus = "offline";
        }

        let res: { data: VehicleDetailResponse };
        try {
          res = await axios.get<VehicleDetailResponse>(
            `${API_BASE_URL}/vehicles/${selectedVehicleId}/details`,
            {
              params: {
                include: "alerts,readings,histories,events,sensor",
                fromDate,
                toDate,
              },
            }
          );
        } catch (primaryErr: any) {
          // Fallback for 404: retry with minimal include
          if (primaryErr?.response?.status === 404) {
            res = await axios.get<VehicleDetailResponse>(
              `${API_BASE_URL}/vehicles/${selectedVehicleId}/details`,
              {
                params: {
                  include: "alerts,readings,sensor",
                  fromDate,
                  toDate,
                },
              }
            );
          } else {
            throw primaryErr;
          }
        }

        const data = res.data;
        let alerts = data.sensor?.Alert ?? data.sensor?.alerts ?? data.alerts ?? [];
        const rawReadings = (data.sensor?.readings ?? data.readings ?? []) as FuelReading[];
        const normalizedReadings: FuelReading[] = (Array.isArray(rawReadings) ? rawReadings : [])
          .map((r: any, idx: number) => {
            const ts = r.timestamp || r.time || r.createdAt || r.date;
            const tsNum = typeof ts === "number" ? ts : Date.parse(ts || "");
            const iso = Number.isFinite(tsNum) ? new Date(tsNum).toISOString() : new Date().toISOString();
            const levelRaw = r.fuelLevel ?? r.fuel_level ?? r.level ?? r.value ?? r.fuel;
            const level = Number(levelRaw);
            return {
              ...r,
              id: r.id ?? `${tsNum || Date.now()}-${idx}`,
              timestamp: iso,
              fuelLevel: Number.isFinite(level) ? level : 0,
            } as FuelReading;
          });

        console.log("FuelTheft - Raw readings:", rawReadings.length);
        console.log("FuelTheft - Raw alerts:", alerts.length);

        // If no alerts found in vehicle details, try fetching from /history endpoint
        if (alerts.length === 0) {
          try {
            console.log("FuelTheft - No alerts in vehicle details, fetching from /history endpoint...");
            const historyRes = await axios.get<any>(`${API_BASE_URL}/history`, {
              params: {
                busId: selectedVehicleId,
                vehicleId: selectedVehicleId,
                // If there is a single known sensor, pass it to tight-scope results
                sensorId: allowedSensorIds.length === 1 ? allowedSensorIds[0] : undefined,
                fromDate,
                toDate,
              },
            });
            const fetched = historyRes.data?.data || historyRes.data || [];
            alerts = fetched.filter((a: any) => {
              // Sensor filter first when known
              const aSensor = String(a?.sensorId || a?.sensor?.id || a?.sensor?.serial || "").trim();
              if (allowedSensorIds.length > 0 && aSensor) {
                if (!allowedSensorIds.includes(aSensor)) return false;
              }

              const idMatch =
                String(a?.bus?.id || "") === String(selectedVehicleId) ||
                String(a?.busId || "") === String(selectedVehicleId) ||
                String(a?.vehicleId || "") === String(selectedVehicleId);
              if (idMatch) return true;
              const reg = a?.bus?.registrationNumber || a?.bus?.registrationNo;
              return selectedReg && reg && String(reg) === String(selectedReg);
            });
            console.log("FuelTheft - Alerts from /history:", alerts.length);
          } catch (historyErr) {
            console.error("FuelTheft - Failed to fetch alerts from /history:", historyErr);
          }
        }

        // Sort readings by timestamp
        const readingsSorted = [...normalizedReadings].sort(
          (a, b) => new Date(a.timestamp as any).getTime() - new Date(b.timestamp as any).getTime()
        );

        // Create a map of alerts by timestamp for quick lookup
        const alertsByTime = new Map<number, Alert[]>();
        alerts.forEach((alert: Alert) => {
          const alertTime = new Date(alert.timestamp).getTime();
          if (!alertsByTime.has(alertTime)) {
            alertsByTime.set(alertTime, []);
          }
          alertsByTime.get(alertTime)!.push(alert);
        });

        // Process readings and attach events (same logic as Dashboard)
        const enrichedReadings: FuelReading[] = readingsSorted.map((reading, index) => {
          const readingTime = new Date(reading.timestamp as any).getTime();
          
          // Extract event information from the reading's raw data
          const rawData = (reading as any).raw?.sim;
          let eventType = "NORMAL";
          let description = "";
          let fuelChange: number | undefined;

          if (rawData) {
            // Get event type from raw data
            const rawEventType = String(rawData.eventType || "").toUpperCase();
            if (rawEventType === "THEFT" || rawEventType === "DROP") {
              eventType = "THEFT";
            } else if (rawEventType === "REFUEL" || rawEventType === "REFILL") {
              eventType = "REFUEL";
            } else {
              eventType = rawEventType;
            }
            
            // Get fuel change from raw data
            if (typeof rawData.fuel_diff === "number") {
              fuelChange = rawData.fuel_diff;
            }
            
            description = `${eventType} event detected`;
          }

          // Also check for alerts that are close to this reading (within 5 minutes)
          const MATCH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
          let matchedAlerts: Alert[] = [];
          
          // Check exact time match first
          if (alertsByTime.has(readingTime)) {
            matchedAlerts = alertsByTime.get(readingTime)!;
          } else {
            // Check for nearby alerts
            for (const [alertTime, alertList] of alertsByTime.entries()) {
              if (Math.abs(alertTime - readingTime) <= MATCH_WINDOW_MS) {
                matchedAlerts.push(...alertList);
              }
            }
          }

          // If we found alerts, use their information to override
          if (matchedAlerts.length > 0) {
            // Prioritize fuel-related events over system events
            const fuelEventPriority = ["REFUEL", "REFILL", "THEFT", "DROP"];
            let primaryAlert = matchedAlerts[0];
            
            // Find the highest priority fuel event if multiple alerts exist
            for (const alert of matchedAlerts) {
              const alertType = String(alert.type || "").toUpperCase();
              if (fuelEventPriority.includes(alertType)) {
                primaryAlert = alert;
                break;
              }
            }
            
            const alertType = String(primaryAlert.type || "").toUpperCase();
            
            // Map alert types to event types
            if (alertType === "THEFT" || alertType === "DROP") {
              eventType = "THEFT";
            } else if (alertType === "REFUEL" || alertType === "REFILL") {
              eventType = "REFUEL";
            } else {
              eventType = alertType;
            }
            
            description = primaryAlert.description || `${eventType} detected`;
            
            // Try to extract fuel change from alert
            if (typeof (primaryAlert as any).fuelChange === "number") {
              fuelChange = (primaryAlert as any).fuelChange;
            }
          }

          return {
            ...reading,
            id: reading.id ?? `${readingTime}-${index}`,
            eventType,
            description: description || undefined,
            fuelChange,
          } as FuelReading;
        });

        // Add virtual points for alerts that don't have nearby readings
        const virtualPoints: FuelReading[] = [];
        const processedAlertTimes = new Set<number>();
        
        alerts.forEach((alert: Alert) => {
          const alertTime = new Date(alert.timestamp).getTime();
          
          // Check if this alert was already processed with a reading
          let wasProcessed = false;
          for (const reading of enrichedReadings) {
            const readingTime = new Date(reading.timestamp as any).getTime();
            if (Math.abs(alertTime - readingTime) <= 5 * 60 * 1000) { // 5 minutes
              wasProcessed = true;
              break;
            }
          }
          
          if (!wasProcessed && !processedAlertTimes.has(alertTime)) {
            processedAlertTimes.add(alertTime);
            
            // Find the closest reading to get fuel level
            let closestReading: FuelReading | null = null;
            let minDiff = Infinity;
            
            for (const reading of readingsSorted) {
              const readingTime = new Date(reading.timestamp as any).getTime();
              const diff = Math.abs(alertTime - readingTime);
              if (diff < minDiff) {
                minDiff = diff;
                closestReading = reading;
              }
            }
            
            const alertType = String(alert.type || "").toUpperCase();
            
            // Skip system events for virtual points - they don't need visual representation
            if (["SENSOR_HEALTH", "LOW_FUEL"].includes(alertType)) {
              return; // Use return instead of continue in forEach
            }
            
            let eventType = "NORMAL";
            if (alertType === "THEFT" || alertType === "DROP") {
              eventType = "THEFT";
            } else if (alertType === "REFUEL" || alertType === "REFILL") {
              eventType = "REFUEL";
            } else {
              eventType = alertType;
            }
            
            virtualPoints.push({
              id: `virt-${alert.id || alertTime}`,
              timestamp: new Date(alertTime).toISOString(),
              fuelLevel: closestReading ? Number(closestReading.fuelLevel) : 0,
              eventType,
              description: alert.description || `${eventType} detected`,
              fuelChange: typeof (alert as any).fuelChange === "number" ? (alert as any).fuelChange : undefined,
            } as FuelReading);
          }
        });

        // Merge and sort all data points
        const allDataPoints = [...enrichedReadings, ...virtualPoints].sort(
          (a, b) => new Date(a.timestamp as any).getTime() - new Date(b.timestamp as any).getTime()
        );

        // Apply final processing with markFuelEvents
        const readings = markFuelEvents(allDataPoints, { infer: true, treatDropAsTheft: true });
        
        console.log("FuelTheft - Finalized fuel data:", readings.length);
        console.log("FuelTheft - Event breakdown:", readings.reduce((acc, reading) => {
          const eventType = (reading as any).eventType || "NORMAL";
          acc[eventType] = (acc[eventType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>));

        setFuelData(readings);
        setNoData(readings.length === 0);

        const v = vehicles.find((x) => x.id === selectedVehicleId);
        
        // Get current fuel level from the most recent reading
        let currentFuelLevel = 0;
        if (readings.length > 0) {
          // Use the most recent reading from finalized data
          const latestReading = readings[readings.length - 1];
          currentFuelLevel = Number(latestReading.fuelLevel) || 0;
        } else if (normalizedReadings.length > 0) {
          // Fallback to normalized readings if no finalized data
          const latestNormalized = normalizedReadings[normalizedReadings.length - 1];
          currentFuelLevel = Number(latestNormalized.fuelLevel) || 0;
        }
        
        // Update bus details with current fuel level and status
        setBusDetails(prev => ({
          ...prev!,
          currentFuelLevel,
          status: sensorStatus as "normal" | "offline",
          lastSeen,
        }));

        const usage = await axios.get<FuelUsageStats>(`${API_BASE_URL}/fuelusage`, {
          params: {
            busId: selectedVehicleId, // per backend route
            fromDate,
            toDate,
          },
        });

        // Use backend stats as primary source, with alert-based calculation as fallback
        let finalStats = { ...usage.data, fuelEfficiency: usage.data.fuelEfficiency ?? 0 };
        
        // Verify backend stats are reasonable, use alert-based calculation as fallback if needed
        const backendRefueled = usage.data.totalFuelRefueled || 0;
        const backendStolen = usage.data.totalFuelStolen || 0;
        
        // Calculate from alerts as verification/fallback
        let alertBasedRefueled = 0;
        let alertBasedStolen = 0;
        
        if (alerts.length > 0) {
          // Calculate refuel amount from alerts
          const refuelAlerts = alerts.filter((alert: Alert) => 
            alert.type === "REFUEL" || alert.type === "REFILL"
          );
          
          if (refuelAlerts.length > 0) {
            refuelAlerts.forEach((alert: Alert) => {
              // Extract fuel amount from description like "Δ=+107.83L"
              const match = alert.description?.match(/Δ=\+([\d.]+)L/);
              if (match) {
                alertBasedRefueled += parseFloat(match[1]);
              }
            });
            console.log("FuelTheft - Alert-based refuel calculation:", alertBasedRefueled);
          }
          
          // Calculate theft amount from alerts
          const theftAlerts = alerts.filter((alert: Alert) => 
            alert.type === "THEFT" || alert.type === "DROP"
          );
          
          if (theftAlerts.length > 0) {
            theftAlerts.forEach((alert: Alert) => {
              // Extract fuel amount from description like "Δ=-5.05L"
              const match = alert.description?.match(/Δ=-([\d.]+)L/);
              if (match) {
                alertBasedStolen += parseFloat(match[1]);
              }
            });
            console.log("FuelTheft - Alert-based theft calculation:", alertBasedStolen);
            console.log("FuelTheft - Theft alerts processed:", theftAlerts.length);
          }
        }
        
        // Use backend stats if they're reasonable, otherwise fall back to alert-based calculation
        if (backendRefueled > 0 && Math.abs(backendRefueled - alertBasedRefueled) < 5) {
          // Backend refuel amount is reasonable (within 5L tolerance)
          finalStats.totalFuelRefueled = backendRefueled;
          console.log("FuelTheft - Using backend refuel amount:", backendRefueled);
        } else if (alertBasedRefueled > 0) {
          // Fall back to alert-based calculation
          finalStats.totalFuelRefueled = alertBasedRefueled;
          console.log("FuelTheft - Using alert-based refuel amount (fallback):", alertBasedRefueled);
        }
        
        if (backendStolen > 0 && Math.abs(backendStolen - alertBasedStolen) < 5) {
          // Backend theft amount is reasonable (within 5L tolerance)
          finalStats.totalFuelStolen = backendStolen;
          console.log("FuelTheft - Using backend theft amount:", backendStolen);
        } else if (alertBasedStolen > 0) {
          // Fall back to alert-based calculation
          finalStats.totalFuelStolen = alertBasedStolen;
          console.log("FuelTheft - Using alert-based theft amount (fallback):", alertBasedStolen);
        }
        
        setFuelStats(finalStats);

        // Update cache of last good data
        lastGoodRef.current = {
          fuelData: readings,
          busDetails: {
            registrationNo: busDetails?.registrationNo || v?.registrationNo || "",
            driver: busDetails?.driver || v?.driver?.name || "Unassigned",
            route: busDetails?.route || v?.route?.name || "Unknown",
            currentFuelLevel: (rawReadings.at(-1)?.fuelLevel as number) ?? 0,
            status: sensorStatus ? "normal" : "offline",
          },
          fuelStats: finalStats,
          selectedVehicleId,
        };
      } catch (error) {
        console.error("Error fetching fuel data:", error);
        // Preserve last good data if for the same vehicle
        if (lastGoodRef.current.selectedVehicleId === selectedVehicleId) {
          setFuelData(lastGoodRef.current.fuelData);
          setBusDetails(lastGoodRef.current.busDetails);
          setFuelStats(lastGoodRef.current.fuelStats);
          setNoData((lastGoodRef.current.fuelData || []).length === 0);
        } else {
          setFuelData([]);
          setBusDetails(null);
          setFuelStats(null);
          setNoData(true);
        }
      }
    };

    fetchBusData();

    // Set up auto-reload every 15 minutes (900,000 milliseconds) if a bus is selected
    let intervalId: NodeJS.Timeout | null = null;
    if (selectedVehicleId) {
      intervalId = setInterval(fetchBusData, 15 * 60 * 1000);
    }

    // Cleanup interval on component unmount or when dependencies change
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [selectedVehicleId, timeRange, customStart, customEnd, vehicles]);

  return (
    <div className="px-6 py-12 max-w-6xl mx-auto space-y-10 font-sans text-gray-800 dark:text-gray-100">
      <div className="text-center space-y-2">
        <h2 className="text-4xl sm:text-5xl font-extrabold text-blue-900 dark:text-blue-200">
          🚨 Fuel Theft Monitoring
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Monitor your fleet's fuel activity with real-time detection & analysis
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl shadow-lg p-6">
        <BusTimeFilter
          busSearch={search}
          setBusSearch={setSearch}
          selectedBusId={selectedReg}
          setSelectedBusId={(val: string | null) => {
            if (val && regToId[val]) {
              setSelectedReg(val);
              setSearch(val);
              setSelectedVehicleId(regToId[val]);
              
              // Set basic bus details immediately
              const vehicle = vehicles.find(v => v.registrationNo === val);
              if (vehicle) {
                setBusDetails({
                  registrationNo: vehicle.registrationNo,
                  driver: vehicle.driver?.name || "Unassigned",
                  route: vehicle.route?.name || "Unknown",
                  currentFuelLevel: 0, // Will be updated when data is fetched
                  status: "normal", // Will be updated when data is fetched
                });
              }
              
              navigate(`?bus=${encodeURIComponent(val)}`, { replace: false });
            } else {
              setSelectedReg(null);
              setSearch("");
              setSelectedVehicleId(null);
              setBusDetails(null);
              navigate(`?`, { replace: false });
            }
          }}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          customStart={customStart}
          customEnd={customEnd}
          setCustomStart={setCustomStart}
          setCustomEnd={setCustomEnd}
          busSuggestions={busSuggestions}
        />
      </div>

      {!selectedVehicleId && (
        <div className="text-center py-24 px-4 border rounded-xl bg-gradient-to-br from-white to-blue-50 dark:from-gray-800 dark:to-gray-700 dark:border-gray-600 text-gray-600 dark:text-gray-300 animate-fade-in">
          <h3 className="text-2xl font-semibold mb-2">No Bus Selected</h3>
          <p>
            Please select a <span className="font-semibold text-blue-600 dark:text-blue-400">bus</span> to view analytics.
          </p>
        </div>
      )}

      {/* Show bus card immediately when bus is selected */}
      {selectedVehicleId && (
        <MonitoredBusCard
          busId={selectedVehicleId}
          regNumber={busDetails?.registrationNo || selectedReg || selectedVehicleId}
          driver={busDetails?.driver || "Unassigned"}
          route={busDetails?.route || "Unknown"}
          fuelLevel={busDetails?.currentFuelLevel ?? 0}
          status={busDetails?.status || "normal"}
          imageUrl="/src/assets/temp_bus.avif"
        />
      )}

      {/* Chart and stats area - always show chart; it contains its own empty state */}
      {selectedVehicleId && (
        <>
          <FuelChart
            fuelData={Array.isArray(fuelData) ? fuelData : []}
            busId={selectedVehicleId}
            theftTotalOverride={fuelStats?.totalFuelStolen}
            sensorStatus={busDetails?.status}
          />
          {fuelStats && (
            <FuelStatsGrid
              stats={{
                total_fuel_consumed: fuelStats.totalFuelConsumed,
                total_fuel_stolen: fuelStats.totalFuelStolen,
                total_fuel_refueled: fuelStats.totalFuelRefueled,
                distance_traveled: fuelStats.distanceTravelled,
                fuel_efficiency: fuelStats.fuelEfficiency,
              }}
            />
          )}
        </>
      )}
    </div>
  );
};

export default FuelTheft;
