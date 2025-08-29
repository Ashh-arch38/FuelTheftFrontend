/**
 * Utility for processing fuel data and handling sensor readings
 */

import type { FuelReading } from "../types/fuel";

export interface Alert {
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

/**
 * Normalize fuel readings from various API response formats
 */
export function normalizeFuelReadings(readingsRaw: any[]): FuelReading[] {
  if (!Array.isArray(readingsRaw)) return [];

  return readingsRaw
    .map((r: any, idx: number) => {
      // Extract timestamp
      const ts = r.timestamp || r.time || r.createdAt || r.date;
      const tsNum = typeof ts === "number" ? ts : Date.parse(ts || "");
      const iso = Number.isFinite(tsNum) ? new Date(tsNum).toISOString() : new Date().toISOString();
      
      // Extract fuel level
      const levelRaw = r.fuelLevel ?? r.fuel_level ?? r.level ?? r.value ?? r.fuel;
      let level = Number(levelRaw);
      
      // Handle invalid fuel levels (like 32767 from uncalibrated sensors)
      if (!Number.isFinite(level) || level <= 0 || level > 1000) {
        level = 0; // Set to 0 for invalid readings
      }
      
      return {
        ...r,
        id: r.id ?? `${tsNum || Date.now()}-${idx}`,
        timestamp: iso,
        fuelLevel: level,
      } as FuelReading;
    })
    .filter(reading => {
      // Filter out readings with invalid timestamps
      const timestamp = new Date(reading.timestamp);
      return !isNaN(timestamp.getTime());
    });
}

/**
 * Convert sensor alerts to fuel readings
 */
export function convertAlertsToReadings(alerts: Alert[]): FuelReading[] {
  if (!Array.isArray(alerts)) return [];

  return alerts
    .map((alert, index) => {
      // Extract timestamp
      const timestamp = alert.timestamp || new Date().toISOString();
      
      // Extract fuel level from description if available
      let fuelLevel = 0;
      if (alert.description) {
        // Try to extract fuel level from description like "fuel_diff=0.00L"
        const fuelMatch = alert.description.match(/fuel_diff=([-\d.]+)L/);
        if (fuelMatch) {
          const extracted = parseFloat(fuelMatch[1]);
          if (Number.isFinite(extracted) && extracted > 0 && extracted < 1000) {
            fuelLevel = extracted;
          }
        }
      }
      
      // Determine event type - include ALL event types
      const eventType = alert.type?.toUpperCase() || 'NORMAL';
      
      return {
        id: alert.id || `alert-${index}`,
        timestamp,
        fuelLevel,
        eventType,
        description: alert.description,
        originalAlert: alert,
      } as FuelReading;
    })
    .filter(reading => {
      // Include ALL readings with valid timestamps
      const hasValidTimestamp = reading.timestamp && !isNaN(new Date(reading.timestamp).getTime());
      
      // If fuel level is invalid, set it to 0 but keep the reading
      if (reading.fuelLevel > 1000 || reading.fuelLevel < 0) {
        reading.fuelLevel = 0;
      }
      
      return hasValidTimestamp;
    });
}

/**
 * Merge readings and alerts into a single dataset
 */
export function mergeFuelData(readings: FuelReading[], alerts: Alert[]): FuelReading[] {
  const normalizedReadings = normalizeFuelReadings(readings);
  const alertReadings = convertAlertsToReadings(alerts);
  
  // Combine both datasets
  const combined = [...normalizedReadings, ...alertReadings];
  
  // Sort by timestamp
  return combined.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

/**
 * Filter fuel readings to only include valid data points
 */
export function filterValidFuelReadings(readings: FuelReading[]): FuelReading[] {
  return readings.filter(reading => {
    const timestamp = new Date(reading.timestamp);
    
    // Check for valid timestamp
    const hasValidTimestamp = !isNaN(timestamp.getTime());
    
    // Handle invalid fuel levels by setting them to 0
    if (!Number.isFinite(reading.fuelLevel) || reading.fuelLevel < 0 || reading.fuelLevel > 1000) {
      reading.fuelLevel = 0;
    }
    
    return hasValidTimestamp;
  });
}

/**
 * Calculate fuel statistics from readings
 */
export function calculateFuelStats(readings: FuelReading[]) {
  const validReadings = filterValidFuelReadings(readings);
  
  let totalFuelConsumed = 0;
  let totalFuelStolen = 0;
  let totalFuelRefueled = 0;
  
  for (let i = 1; i < validReadings.length; i++) {
    const prev = validReadings[i - 1];
    const curr = validReadings[i];
    
    if (prev.fuelLevel > 0 && curr.fuelLevel > 0) {
      const change = curr.fuelLevel - prev.fuelLevel;
      
      if (change < 0) {
        // Fuel level decreased
        if (curr.eventType === 'THEFT' || curr.eventType === 'DROP') {
          totalFuelStolen += Math.abs(change);
        } else {
          totalFuelConsumed += Math.abs(change);
        }
      } else if (change > 0) {
        // Fuel level increased
        if (curr.eventType === 'REFUEL' || curr.eventType === 'REFILL') {
          totalFuelRefueled += change;
        }
      }
    }
  }
  
  return {
    totalFuelConsumed,
    totalFuelStolen,
    totalFuelRefueled,
    readingCount: validReadings.length,
  };
}
