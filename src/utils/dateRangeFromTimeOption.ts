// utils/dateRangeFromTimeOption.ts
import {
  startOfToday, endOfToday, subDays, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, startOfDay, endOfDay,
} from "date-fns";

export function getDateRange(timeRange: string): { startDate?: Date; endDate?: Date } {
  const key = (timeRange || "").toLowerCase();
  const now = new Date();

  switch (key) {
    case "last 24 hours":
    case "last24hours":
    case "24h":
      return { startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000), endDate: now };

    case "today":
      return { startDate: startOfToday(), endDate: endOfToday() };

    case "yesterday": {
      const y = subDays(now, 1);
      return { startDate: startOfDay(y), endDate: endOfDay(y) }; // <-- FIXED key
    }

    // Rolling windows (true trailing periods)
    case "week":
    case "last 7 days":
      return { startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), endDate: now };

    case "month":
    case "last 30 days":
      return { startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), endDate: now };

    // Calendar windows
    case "this week":
      return { startDate: startOfWeek(now, { weekStartsOn: 1 }), endDate: endOfWeek(now, { weekStartsOn: 1 }) };

    case "last week": {
      const s = subDays(startOfWeek(now, { weekStartsOn: 1 }), 7);
      const e = subDays(endOfWeek(now, { weekStartsOn: 1 }), 7);
      return { startDate: s, endDate: e };
    }

    case "this month":
      return { startDate: startOfMonth(now), endDate: endOfMonth(now) };

    case "last month": {
      const lm = subDays(startOfMonth(now), 1);
      return { startDate: startOfMonth(lm), endDate: endOfMonth(lm) };
    }

    case "all time":
    case "custom":
    default:
      return {};
  }
}
