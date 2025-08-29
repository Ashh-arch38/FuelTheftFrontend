export interface FuelReading {
  id?: string;
  timestamp: string | number | Date;
  fuelLevel: number;
  // NEW: the backend’s ground-truth label on the reading
  eventId?: number | null; // 1=theft, 2=refuel, else normal
  // Existing optional label fields (keep as-is)
  eventType?: string;
  type?: string;
  fuelChange?: number;
  description?: string | null;
  // NEW: seed stores deltas inside raw
  raw?: { appliedDelta?: number } & Record<string, unknown>;
}


