// src/pages/Dashboard.tsx
import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import axios from "axios";
import { API_BASE_URL } from "../config";
import MonitoredBusCard from "../components/MonitoredBusCard";
import { getDateRange } from "../utils/dateRangeFromTimeOption";
import FuelChart from "../components/FuelChart";
import StatCards from "../components/StatCards";
// removed unused CountUp import
import busImage from "../assets/bus1.jpg";
import DashboardTimeFilter from "../components/DashboardTimeFilter";
import type { TimeRangeValue } from "../components/DashboardTimeFilter";
import type { FuelReading } from "../types/fuel";
import { markFuelEvents } from "../utils/markFuelEvents";
import { determineSensorStatus } from "../utils/sensorStatus";

interface Alert {
  id: string;
  timestamp: string;
  type: string;
  description?: string;
  bus?: {
    id?: string;
    registrationNumber?: string;
    registrationNo?: string;
  };
  vehicleId?: string;
  busId?: string;
}

// removed unused Bus interface

interface BusCard {
  busId: string;
  registrationNo: string;
  driverName: string;
  routeName: string;
  fuelLevel: number;
  status: "normal" | "alert" | "offline";
}

interface FuelUsageStats {
  totalFuelConsumed: number;
  totalFuelStolen: number;
  totalFuelRefueled: number;
  distanceTravelled: number;
  fuelEfficiency: number;
}

const Dashboard: React.FC = () => {
  const [topBuses, setTopBuses] = useState<BusCard[]>([]);
  const [totalBuses, setTotalBuses] = useState(0);
  const [selectedBus, setSelectedBus] = useState<string | null>(null);

  const [fuelData, setFuelData] = useState<FuelReading[]>([]);
  const [, setEvents] = useState<Alert[]>([]);
  const [fuelStats, setFuelStats] = useState<FuelUsageStats | null>(null);

  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string | null>(null);
  // Cache to preserve last good data while new fetch is in-flight or fails
  const lastGoodRef = useRef<{
    fuelData: FuelReading[];
    events: Alert[];
    fuelStats: FuelUsageStats | null;
    selectedBus: string | null;
  }>({ fuelData: [], events: [], fuelStats: null, selectedBus: null });

  // For testing, use August data where we know there are events
  const [timeRange, setTimeRange] = useState<TimeRangeValue>("today");
  const [customStart, setCustomStart] = useState("2025-08-01");
  const [customEnd, setCustomEnd] = useState("2025-08-31");

  const chartRef = useRef<HTMLDivElement | null>(null);

  // Map regNo -> busId for quick lookups (used when alerts reference registration)
  const regToId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of topBuses) map[b.registrationNo] = b.busId;
    return map;
  }, [topBuses]);

  // --- Fetch details for selected bus ---
  const fetchBusDetails = useCallback(
    async (busId: string, range: { startDate?: Date; endDate?: Date }) => {
      if (!busId || !range?.startDate || !range?.endDate) {
        setFuelData([]);
        setEvents([]);
        setFuelStats(null);
        return;
      }
      try {
        setLoading(true);

        // vehicle details + readings + alerts
        let detailsRes: any;
        try {
          detailsRes = await axios.get<any>(
            `${API_BASE_URL}/vehicles/${busId}/details`,
            {
              params: {
                include: "alerts,readings,histories,events,sensor",
                fromDate: range.startDate.toISOString(),
                toDate: range.endDate.toISOString(),
              },
            }
          );
        } catch (primaryErr: any) {
          // Fallback: retry with minimal include; some backends 404 if include list unknown
          if (primaryErr?.response?.status === 404) {
            detailsRes = await axios.get<any>(
              `${API_BASE_URL}/vehicles/${busId}/details`,
              {
                params: {
                  include: "alerts,readings,sensor",
                  fromDate: range.startDate.toISOString(),
                  toDate: range.endDate.toISOString(),
                },
              }
            );
          } else {
            throw primaryErr;
          }
        }
        const details = detailsRes.data;
        
        // Extract readings and alerts from the response
        const readingsRaw: FuelReading[] = details.sensor?.readings ?? details.readings ?? [];
        let alerts: Alert[] = details.sensor?.Alert ?? details.sensor?.alerts ?? details.alerts ?? [];
        
        // Use the new utility to process fuel data
        const mergedFuelData = mergeFuelData(readingsRaw, alerts);
        const validFuelData = filterValidFuelReadings(mergedFuelData);

        console.log("Raw readings:", readingsRaw);
        console.log("Raw alerts:", alerts);
        console.log("Processed fuel data:", validFuelData);
        console.log("API Response details:", details);
        console.log("Fuel data length:", validFuelData.length);

        // If no alerts found in vehicle details, try fetching from /history endpoint
        if (alerts.length === 0) {
          try {
            console.log("No alerts in vehicle details, fetching from /history endpoint...");
            // Try to lookup sensor id for this bus to further scope history when possible
            let sensorId: string | undefined;
            try {
              const sensorRes = await axios.get(`${API_BASE_URL}/sensor`, { params: { busId } });
              const sensors = Array.isArray(sensorRes.data) ? sensorRes.data : [];
              const idCandidate = sensors[0]?.id || sensors[0]?.sensorId || sensors[0]?.serial || sensors[0]?.name;
              sensorId = idCandidate ? String(idCandidate) : undefined;
            } catch {}
            const historyRes = await axios.get<any>(`${API_BASE_URL}/history`, {
              params: {
                // try both keys; backend may ignore but we will filter client-side too
                busId: busId,
                vehicleId: busId,
                sensorId,
                fromDate: range.startDate.toISOString(),
                toDate: range.endDate.toISOString(),
                startDate: range.startDate.toISOString(),
                endDate: range.endDate.toISOString(),
              },
            });
            let fetched = historyRes.data?.data || historyRes.data || [];
            // Client-side filter to the selected bus
            const onlyThisBus = fetched.filter((a: any) => {
              // Sensor filter first when known
              const aSensor = String(a?.sensorId || a?.sensor?.id || a?.sensor?.serial || "").trim();
              if (sensorId && aSensor && aSensor !== sensorId) return false;

              const idMatch =
                String(a?.bus?.id || "") === String(busId) ||
                String(a?.busId || "") === String(busId) ||
                String(a?.vehicleId || "") === String(busId);
              if (idMatch) return true;
              // fallback: match by registration number
              const reg = a?.bus?.registrationNumber || a?.bus?.registrationNo;
              const thisReg = topBuses.find(b => b.busId === busId)?.registrationNo;
              return thisReg && reg && String(reg) === String(thisReg);
            });
            alerts = onlyThisBus;
            console.log("Alerts from /history:", alerts);
          } catch (historyErr) {
            console.error("Failed to fetch alerts from /history:", historyErr);
          }
        }

        // Sort readings by timestamp
        const readingsSorted = [...validFuelData].sort(
          (a, b) => new Date(a.timestamp as any).getTime() - new Date(b.timestamp as any).getTime()
        );

        // Create a map of alerts by timestamp for quick lookup
        const alertsByTime = new Map<number, Alert[]>();
        alerts.forEach(alert => {
          const alertTime = new Date(alert.timestamp).getTime();
          if (!alertsByTime.has(alertTime)) {
            alertsByTime.set(alertTime, []);
          }
          alertsByTime.get(alertTime)!.push(alert);
        });

        // Process readings and attach events
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
            } else if (primaryAlert.description) {
              // Extract fuel change from description like "Δ=+7787.00L" or "Δ=-5.05L"
              const match = primaryAlert.description.match(/Δ=([+-])([\d.]+)L/);
              if (match) {
                const sign = match[1];
                const amount = parseFloat(match[2]);
                fuelChange = sign === '+' ? amount : -amount;
              }
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
        
        alerts.forEach(alert => {
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
            const alertType = String(alert.type || "").toUpperCase();
            
            // Skip system events for virtual points - they don't need visual representation
            if (["SENSOR_HEALTH", "LOW_FUEL"].includes(alertType)) {
              return; // Use return instead of continue in forEach
            }
            
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
              fuelChange: (() => {
                if (typeof (alert as any).fuelChange === "number") {
                  return (alert as any).fuelChange;
                } else if (alert.description) {
                  // Extract fuel change from description like "Δ=+7787.00L" or "Δ=-5.05L"
                  const match = alert.description.match(/Δ=([+-])([\d.]+)L/);
                  if (match) {
                    const sign = match[1];
                    const amount = parseFloat(match[2]);
                    return sign === '+' ? amount : -amount;
                  }
                }
                return undefined;
              })(),
            } as FuelReading);
          }
        });

        // Note: We're now using validFuelData directly instead of the complex merging logic

<<<<<<< HEAD
        // Use the processed fuel data directly
        const finalized = markFuelEvents(validFuelData, { infer: true, treatDropAsTheft: true });
        
        console.log("Finalized fuel data:", finalized);
        console.log("Event breakdown:", finalized.reduce((acc, reading) => {
          const eventType = (reading as any).eventType || "NORMAL";
          acc[eventType] = (acc[eventType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>));
=======
        // Apply final processing with markFuelEvents
        const finalized = markFuelEvents(allDataPoints, { infer: false, treatDropAsTheft: true });
>>>>>>> c53db9d
        
        setFuelData(finalized);
        setEvents(alerts);

        // Calculate from alerts as verification/fallback
        let alertBasedRefueled = 0;
        let alertBasedStolen = 0;
        
        if (alerts.length > 0) {
          // Calculate refuel amount from alerts
          const refuelAlerts = alerts.filter(alert => 
            alert.type === "REFUEL" || alert.type === "REFILL"
          );
          
          if (refuelAlerts.length > 0) {
            refuelAlerts.forEach(alert => {
              // Extract fuel amount from description like "Δ=+107.83L"
              const match = alert.description?.match(/Δ=\+([\d.]+)L/);
              if (match) {
                alertBasedRefueled += parseFloat(match[1]);
              }
            });
            console.log("Alert-based refuel calculation:", alertBasedRefueled);
          }
          
          // Calculate theft amount from alerts
          const theftAlerts = alerts.filter(alert => 
            alert.type === "THEFT" || alert.type === "DROP"
          );
          
          if (theftAlerts.length > 0) {
            theftAlerts.forEach(alert => {
              // Extract fuel amount from description like "Δ=-5.05L"
              const match = alert.description?.match(/Δ=-([\d.]+)L/);
              if (match) {
                alertBasedStolen += parseFloat(match[1]);
              }
            });
            console.log("Alert-based theft calculation:", alertBasedStolen);
            console.log("Theft alerts processed:", theftAlerts.length);
          }
        }
        
        // Try to fetch backend usage, but do NOT fail the whole flow if it 404s
        let finalStats: FuelUsageStats = {
          totalFuelConsumed: 0,
          totalFuelRefueled: alertBasedRefueled,
          totalFuelStolen: alertBasedStolen,
          distanceTravelled: 0,
          fuelEfficiency: 0,
        };
        try {
          const usage = await axios.get<FuelUsageStats>(`${API_BASE_URL}/fuelusage`, {
            params: {
              busId: busId,
              fromDate: range.startDate.toISOString(),
              toDate: range.endDate.toISOString(),
            },
          });
          const backend = usage.data || ({} as FuelUsageStats);
          finalStats = {
            totalFuelConsumed: backend.totalFuelConsumed ?? 0,
            totalFuelRefueled: backend.totalFuelRefueled ?? alertBasedRefueled,
            totalFuelStolen: backend.totalFuelStolen ?? alertBasedStolen,
            distanceTravelled: backend.distanceTravelled ?? 0,
            fuelEfficiency: backend.fuelEfficiency ?? 0,
          };
        } catch (usageErr) {
          console.warn("Fuel usage unavailable, using alert-based fallback", usageErr);
        }

        setFuelStats(finalStats);

        // update cache of last good data
        lastGoodRef.current = {
          fuelData: finalized,
          events: alerts,
          fuelStats: finalStats,
          selectedBus: busId,
        };
        setError(null);
      } catch (err) {
        console.error("Bus detail fetch error:", err);
        // On failure, keep previous good data instead of clearing UI
        if (lastGoodRef.current.selectedBus === busId) {
          setFuelData(lastGoodRef.current.fuelData);
          setEvents(lastGoodRef.current.events);
          setFuelStats(lastGoodRef.current.fuelStats);
          setError(null);
        } else {
          setFuelData([]);
          setEvents([]);
          setFuelStats(null);
          setError(null);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

<<<<<<< HEAD
  // --- Fetch dashboard buses function ---
  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get<any>(`${API_BASE_URL}/vehicles`);
      const buses = res.data?.data || res.data;

      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - 24 * 60 * 60 * 1000);
      
      // For testing, use August data where we know there are events
      // const toDate = new Date('2025-08-31T23:59:59.999Z');
      // const fromDate = new Date('2025-08-01T00:00:00.000Z');

      const enriched: BusCard[] = await Promise.all(
        buses.map(async (bus: any) => {
          try {
            // Get sensor status from the sensor API (primary endpoint for this backend)
            let sensorStatus = "offline";
            let lastSeen = null;
            try {
              const sensorRes = await axios.get<any>(`${API_BASE_URL}/sensor`, {
                params: { busId: bus.id }
              });
              const sensorData = sensorRes.data?.data?.[0];
              if (sensorData) {
                // Use the proper status values from the API
                if (sensorData.sensorStatus === "OK") {
                  sensorStatus = "normal";
                } else if (sensorData.sensorStatus === "OFFLINE") {
                  sensorStatus = "offline";
                } else if (sensorData.sensorStatus === "FAULTY") {
                  sensorStatus = "offline";
                } else {
                  sensorStatus = "offline";
                }
                lastSeen = sensorData.lastSeen;
              }
            } catch (sensorErr) {
              console.warn(`Failed to fetch sensor status for bus ${bus.id}:`, sensorErr);
              // Fallback to vehicle details method
              sensorStatus = "offline";
=======
  // --- Fetch dashboard buses on mount and auto-reload every 15 minutes ---
  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        setLoading(true);
        const res = await axios.get<any>(`${API_BASE_URL}/vehicles`);
        const buses = res.data?.data || res.data;

        // For testing, use August data where we know there are events
        const toDate = new Date('2025-08-31T23:59:59.999Z');
        const fromDate = new Date('2025-08-01T00:00:00.000Z');
        
        // const toDate = new Date();
        // const fromDate = new Date(toDate.getTime() - 24 * 60 * 60 * 1000);

        const enriched: BusCard[] = await Promise.all(
          buses.map(async (bus: any) => {
            try {
              // Determine sensor status using utility function
              const sensorStatus = determineSensorStatus({
                sensorStatus: bus.sensorStatus,
                sensorLastSeen: bus.sensorLastSeen
              });
              const lastSeen = bus.sensorLastSeen;

              // Get vehicle details for fuel level and other info
              const detailsRes = await axios.get<any>(
                `${API_BASE_URL}/vehicles/${bus.id}/details`,
                {
                  params: {
                    include: "readings,alerts,sensor",
                    fromDate: fromDate.toISOString(),
                    toDate: toDate.toISOString(),
                    startDate: fromDate.toISOString(),
                    endDate: toDate.toISOString(),
                  },
                }
              );
              const details = detailsRes.data;
              const readings: FuelReading[] =
                details.sensor?.readings ?? details.readings ?? [];
              const latestFuel =
                readings.length > 0
                  ? Number(readings[readings.length - 1].fuelLevel) || 0
                  : 0;

              return {
                busId: bus.id,
                registrationNo: bus.registrationNo,
                driverName: bus.driver || details.driver?.name || "Unknown",
                routeName: bus.route || details.route?.name || "Unknown",
                fuelLevel: latestFuel,
                status: sensorStatus,
                lastSeen,
              };
            } catch {
              return {
                busId: bus.id,
                registrationNo: bus.registrationNo,
                driverName: bus.driver || "Unknown",
                routeName: bus.route || "Unknown",
                fuelLevel: 0,
                status: "offline",
                lastSeen: null,
              };
>>>>>>> c53db9d
            }

            // Get vehicle details for fuel level and other info
            const detailsRes = await axios.get<any>(
              `${API_BASE_URL}/vehicles/${bus.id}/details`,
              {
                params: {
                  include: "readings,alerts,sensor",
                  fromDate: fromDate.toISOString(),
                  toDate: toDate.toISOString(),
                  startDate: fromDate.toISOString(),
                  endDate: toDate.toISOString(),
                },
              }
            );
            const details = detailsRes.data;
            const readings: FuelReading[] =
              details.sensor?.readings ?? details.readings ?? [];
            const latestFuel =
              readings.length > 0
                ? Number(readings[readings.length - 1].fuelLevel) || 0
                : 0;

            return {
              busId: bus.id,
              registrationNo: bus.registrationNo,
              driverName: bus.driver || details.driver?.name || "Unknown",
              routeName: bus.route || details.route?.name || "Unknown",
              fuelLevel: latestFuel,
              status: sensorStatus,
              lastSeen,
            };
          } catch {
            return {
              busId: bus.id,
              registrationNo: bus.registrationNo,
              driverName: bus.driver || "Unknown",
              routeName: bus.route || "Unknown",
              fuelLevel: 0,
              status: "offline",
              lastSeen: null,
            };
          }
        })
      );

      setTopBuses(enriched);
      setTotalBuses(Array.isArray(buses) ? buses.length : 0);

      if (enriched.length > 0 && !selectedBus) {
        setSelectedBus(enriched[0].busId);
      }

<<<<<<< HEAD
      setError(null);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
      // Do not block the page; show empty states instead
      setTopBuses([]);
      setTotalBuses(0);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [selectedBus, setError]);

  // --- Auto-reload functionality ---
  useAutoReload({
    interval: 10 * 60 * 1000, // 10 minutes
    enabled: true,
    onReload: fetchDashboard,
    onError: (error) => {
      console.error("Auto-reload error:", error);
    }
  });

  // --- Fetch dashboard buses on mount ---
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // --- Auto-reload every 10 minutes ---
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('Auto-reload: Refreshing dashboard data...');
      fetchDashboard();
    }, 10 * 60 * 1000); // 10 minutes

    return () => clearInterval(interval);
  }, [fetchDashboard]);
=======
    // Initial fetch
    fetchDashboard();

    // Set up auto-reload every 15 minutes (900,000 milliseconds)
    const intervalId = setInterval(fetchDashboard, 15 * 60 * 1000);

    // Cleanup interval on component unmount
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
>>>>>>> c53db9d

  // --- Build date range (and validate) ---
  const range = useMemo(() => {
    if (timeRange === "custom") {
      // Create dates in UTC to match API expectations
      const startDate = customStart ? new Date(customStart + 'T00:00:00.000Z') : undefined;
      const endDate = customEnd ? new Date(customEnd + 'T23:59:59.999Z') : undefined;
      return { startDate, endDate };
    }
    return getDateRange(timeRange);
  }, [timeRange, customStart, customEnd]);

  // --- Fetch selected bus details when range changes ---
  useEffect(() => {
    if (
      !selectedBus ||
      !range?.startDate ||
      !range?.endDate ||
      isNaN(range.startDate.getTime()) ||
      isNaN(range.endDate.getTime())
    ) {
      setFuelData([]);
      setEvents([]);
      setFuelStats(null);
      return;
    }
    fetchBusDetails(selectedBus, range);
  }, [selectedBus, range?.startDate, range?.endDate, fetchBusDetails]);

  // --- Fetch theft events for current window (to highlight cards) ---
  const [theftBusIds, setTheftBusIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchThefts = async () => {
      if (!range?.startDate || !range?.endDate) {
        setTheftBusIds(new Set());
        return;
      }
      try {
        const res = await axios.get<any>(`${API_BASE_URL}/history`, {
          params: {
            type: "THEFT",
            fromDate: range.startDate.toISOString(),
            toDate: range.endDate.toISOString(),
            startDate: range.startDate.toISOString(),
            endDate: range.endDate.toISOString(),
          },
        });

        const rows = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);

        const ids = new Set<string>();
        for (const a of rows) {
          const directId = a.bus?.id || a.busId || a.vehicleId;
          if (directId) {
            ids.add(String(directId));
            continue;
          }
          const reg =
            a.bus?.registrationNumber ||
            a.bus?.registrationNo ||
            "";
          if (reg && regToId[reg]) {
            ids.add(regToId[reg]);
          }
        }
        setTheftBusIds(ids);
      } catch (e) {
        console.error("Failed to fetch theft events", e);
        setTheftBusIds(new Set());
      }
    };
    fetchThefts();
  }, [range?.startDate, range?.endDate, regToId]);

  // When a card is clicked, set the bus and scroll to the chart
  const handleBusCardClick = (busId: string) => {
    setSelectedBus(busId);
    requestAnimationFrame(() => {
      chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  // Also scroll if selectedBus changes in other ways
  useEffect(() => {
    if (selectedBus && chartRef.current) {
      chartRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedBus]);

  if (loading && topBuses.length === 0) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin h-12 w-12 border-t-2 border-b-2 border-blue-500 rounded-full"></div>
      </div>
    );
  }

  // Never hard-stop rendering due to error; render with empty states

  return (
    <div className="space-y-10 px-6 py-8 max-w-7xl mx-auto text-gray-800 dark:text-gray-100">
      <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-6">
        <p className="text-xl font-medium">
          Welcome to{" "}
          <span className="font-signord font-semibold text-blue-600 dark:text-blue-300">
            FuelSafe
          </span>{" "}
          — your centralized platform to monitor fuel usage, detect theft, and
          track refueling activities.
        </p>
        <div className="flex justify-center gap-3 flex-wrap">
          <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-4 py-2 rounded-full text-sm font-medium">
            🔍 Real-time Monitoring
          </span>
          <span className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100 px-4 py-2 rounded-full text-sm font-medium">
            ⚠️ Anomaly Detection
          </span>
          <span className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 px-4 py-2 rounded-full text-sm font-medium">
            ✅ {totalBuses} Buses Monitored
          </span>
        </div>
      </div>

      <DashboardTimeFilter
        range={timeRange}
        customStart={customStart}
        customEnd={customEnd}
        onRangeChange={setTimeRange}
        onCustomDateChange={(start, end) => {
          setCustomStart(start);
          setCustomEnd(end);
        }}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCards
          title="Total Buses"
          icon="bus"
          color="from-blue-500 to-blue-700"
          apiPath="" // No API call needed, just show totalBuses
          timeRange={timeRange}
          customStart={customStart}
          customEnd={customEnd}
          countOverride={totalBuses}
        />

        <StatCards
          title="Ongoing Alerts"
          icon="alert"
          color="from-red-500 to-red-700"
<<<<<<< HEAD
          apiPath="/history?type=THEFT,DROP,REFUEL"
=======
          apiPath="/history?type=THEFT,REFUEL,DROP"
>>>>>>> c53db9d
          timeRange={timeRange}
          customStart={customStart}
          customEnd={customEnd}
        />
        <StatCards
          title="Fuel Theft Events"
          icon="fuel"
          color="from-yellow-500 to-yellow-700"
          apiPath="/history?type=THEFT"
          timeRange={timeRange}
          customStart={customStart}
          customEnd={customEnd}
        />
        <StatCards
          title="Refueling Events"
          icon="refuel"
          color="from-green-500 to-green-700"
          apiPath="/history?type=REFUEL"
          timeRange={timeRange}
          customStart={customStart}
          customEnd={customEnd}
        />
      </div>

      <h3 className="text-xl font-semibold mt-10">🚌 Monitored Buses</h3>
      <div className="flex flex-wrap gap-6 justify-center">
        {topBuses.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-400 py-6">No buses found.</div>
        ) : (
          topBuses.map((bus) => (
          <MonitoredBusCard
            key={bus.busId}
            className="w-full sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] max-w-md"
            busId={bus.busId}
            regNumber={bus.registrationNo}
            driver={bus.driverName}
            route={bus.routeName}
            fuelLevel={bus.fuelLevel}
            status={bus.status}
            hasTheft={theftBusIds.has(bus.busId)}
            imageUrl={busImage}
            onClick={() => handleBusCardClick(bus.busId)}
            selected={selectedBus === bus.busId}
          />
        ))
        )}
      </div>

      {selectedBus && (
        <div className="mt-10 space-y-6" ref={chartRef}>
          <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
            <h4 className="font-semibold text-lg mb-3">
              Fuel Level –{" "}
              {topBuses.find((b) => b.busId === selectedBus)?.registrationNo ||
                selectedBus}
            </h4>
            <FuelChart
              fuelData={Array.isArray(fuelData) ? fuelData : []}
              busId={selectedBus}
              theftTotalOverride={fuelStats?.totalFuelStolen}
              sensorStatus={topBuses.find((b) => b.busId === selectedBus)?.status}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
