// src/components/StatCards.tsx
import React, { useEffect, useState } from "react";
import { getDateRange } from "../utils/dateRangeFromTimeOption";
import axios from "axios";
import { API_BASE_URL } from "../config";
import { AlertCircle, Fuel, RefreshCcw, Bus } from "lucide-react";
import CountUp from "react-countup";

interface Props {
  title: string;
  icon: "alert" | "fuel" | "refuel" | "bus";
  color: string;       // e.g. "from-red-500 to-red-700"
  apiPath: string;     // e.g. "/history?type=THEFT" or "/history?type=THEFT,DROP"
  timeRange: string;   // "today" | "yesterday" | "week" | "month" | "custom"
  customStart: string; // "YYYY-MM-DD"
  customEnd: string;   // "YYYY-MM-DD"
  countOverride?: number; // Optional override for static values like total buses
}

const getIcon = (name: string) => {
  const baseClass = "w-10 h-10 text-white/90";
  switch (name) {
    case "alert":
      return <AlertCircle className={baseClass} />;
    case "fuel":
      return <Fuel className={baseClass} />;
    case "refuel":
      return <RefreshCcw className={baseClass} />;
    case "bus":
      return <Bus className={baseClass} />;
    default:
      return null;
  }
};

const StatCards: React.FC<Props> = ({
  title,
  icon,
  color,
  apiPath,
  timeRange,
  customStart,
  customEnd,
  countOverride,
}) => {
  const [count, setCount] = useState<number | null>(countOverride ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Update count when countOverride changes
  useEffect(() => {
    if (countOverride !== undefined) {
      setCount(countOverride);
    }
  }, [countOverride]);

  useEffect(() => {
    // Skip API call if countOverride is provided
    if (countOverride !== undefined) {
      return;
    }

    let cancelled = false;

    const fetchCount = async () => {
      // 1) Resolve date range
      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (timeRange === "custom") {
        if (!customStart || !customEnd) {
          setCount(null);
          return;
        }
        // Create dates in UTC to match API expectations
        startDate = new Date(customStart + 'T00:00:00.000Z');
        endDate = new Date(customEnd + 'T23:59:59.999Z');
      } else {
        const rangeObj = getDateRange(timeRange);
        startDate = rangeObj?.startDate;
        endDate = rangeObj?.endDate;
      }

      setLoading(true);
      setError(null);

      try {
        // 2) Parse apiPath and build params
        let url = `${API_BASE_URL}${apiPath}`;
        const params: Record<string, any> = {};

        if (apiPath.includes("?")) {
          const [base, query] = apiPath.split("?");
          url = `${API_BASE_URL}${base}`;
          query.split("&").forEach((kv) => {
            const [key, value] = kv.split("=");
            if (key) params[key] = decodeURIComponent(value || "");
          });
        }

        // 3) Use backend's expected date param names
        if (startDate) params.fromDate = startDate.toISOString();
        if (endDate) params.toDate = endDate.toISOString();

        const res = await axios.get<any>(url, { params });
        if (cancelled) return;

        // 4) Normalize response shapes
        let data: any[] = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.data)
          ? res.data.data
          : [];

        // 5) Support comma-separated type filters (e.g. "THEFT,DROP")
        if (typeof params.type === "string" && params.type.trim()) {
          const wanted = params.type
            .split(",")
            .map((t: string) => t.trim().toUpperCase())
            .filter(Boolean);

          if (wanted.length) {
            data = data.filter((item) => {
              const t =
                (item?.type ?? item?.eventType ?? "")
                  .toString()
                  .toUpperCase();
              return wanted.includes(t);
            });
          }
        }

        // 6) Prefer server-provided count, else use filtered array length
        const serverCount =
          res?.data && typeof res.data.count === "number"
            ? res.data.count
            : undefined;

        let newCount = typeof serverCount === "number" ? serverCount : data.length;
        if (!Number.isFinite(newCount)) newCount = 0;
        setCount(newCount);
      } catch (err) {
        if (cancelled) return;
        console.error(`Error fetching ${title} count`, err);
        // Graceful fallback: show 0 instead of error, per requirement
        setError(null);
        setCount(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCount();
    return () => {
      cancelled = true;
    };
  }, [apiPath, title, timeRange, customStart, customEnd, countOverride]);

  return (
    <div
      className={`bg-gradient-to-br ${color} text-white p-6 rounded-2xl shadow-lg hover:shadow-xl 
                 transition-all duration-300 hover:scale-[1.02] overflow-hidden relative group
                 border border-white/10 backdrop-blur-sm`}
    >
      {/* Background pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      
      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex justify-between items-start gap-3 mb-4">
          <div className="flex-shrink-0 p-2 bg-white/10 rounded-xl backdrop-blur-sm">
            {getIcon(icon)}
          </div>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-white/90 mb-2 uppercase tracking-wide">
          {title}
        </h3>

        {/* Count */}
        <div className="flex items-baseline gap-2">
          <p className="text-4xl font-bold min-h-[3rem] flex items-center">
            {loading ? (
              <div className="flex items-center gap-2">
                <span className="animate-spin inline-block w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />
                <span className="text-lg text-white/70">Loading...</span>
              </div>
            ) : error ? (
              <span className="text-red-200 text-lg font-medium">{error}</span>
            ) : count !== null ? (
              <CountUp 
                end={count} 
                duration={1.2} 
                separator=","
                className="text-white"
              />
            ) : (
              <span className="text-white/60 text-lg">No data</span>
            )}
          </p>
        </div>

        {/* Subtle animation on hover */}
        <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-white/20 to-white/10 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left"></div>
      </div>
    </div>
  );
};

export default StatCards;
