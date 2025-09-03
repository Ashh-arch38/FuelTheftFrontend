import type { FuelReading } from "../types/fuel";

// Define EventType here since it's not exported from types/fuel
export type EventType = "NORMAL" | "REFUEL" | "THEFT" | "DROP";

const normalizeEvent = (t?: string | null): EventType => {
  const upper = String(t ?? "NORMAL").toUpperCase();
  return (upper === "REFUEL" || upper === "THEFT" || upper === "DROP"
    ? upper
    : "NORMAL") as EventType;
};

const EPS = 0.2;
const REFUEL_MIN = 10;
const THEFT_MIN  = 10;

type OutRow = FuelReading & { eventType: EventType; fuelChange?: number };

export function markFuelEvents(
  rows: FuelReading[],
  opts: { infer?: boolean; treatDropAsTheft?: boolean } = {}
): OutRow[] {
  const { infer = false, treatDropAsTheft = true } = opts; // <-- default ON

  if (!Array.isArray(rows) || rows.length === 0) return [];

  const sorted = [...rows]
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(a.timestamp as any).getTime() -
        new Date(b.timestamp as any).getTime()
    );

  return sorted.map((row, i, arr) => {
    const id = row.id ?? `${new Date(row.timestamp as any).getTime() || i}-${i}`;

    let event = normalizeEvent((row.eventType as string) ?? (row.type as string));
    const fuelChange = typeof row.fuelChange === "number" ? row.fuelChange : undefined;

    if (infer && event === "NORMAL") {
      if (typeof fuelChange === "number" && Math.abs(fuelChange) > EPS) {
        event = fuelChange > 0 ? "REFUEL" : "THEFT";
      } else if (i > 0 && typeof row.fuelLevel === "number") {
        const prevLevel = Number(arr[i - 1]?.fuelLevel);
        const currLevel = Number(row.fuelLevel);
        if (Number.isFinite(prevLevel) && Number.isFinite(currLevel)) {
          const delta = currLevel - prevLevel;
          if (delta >= REFUEL_MIN) event = "REFUEL";
          else if (delta <= -THEFT_MIN) event = "THEFT";
        }
      }
    }

    // 🔴 Map DROP → THEFT if desired
    if (treatDropAsTheft && event === "DROP") {
      event = "THEFT";
    }

    return {
      ...row,
      id,
      eventType: event,
      fuelChange,
    };
  });
}
