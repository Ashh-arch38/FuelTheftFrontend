// src/components/FuelChart.tsx
import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import type { FuelReading } from "../types/fuel";

type EventType = "REFUEL" | "THEFT" | "NORMAL" | "SENSOR_OFFLINE";

interface FuelChartProps {
  fuelData: FuelReading[];
  busId: string;
  /** Use backend summary when available */
  theftTotalOverride?: number;
  /** Sensor status to determine if sensor is offline */
  sensorStatus?: "normal" | "alert" | "offline";
}

interface ParsedDataPoint {
  time: number;
  fuelLevel: number;
  event: EventType;
  fuelChange?: number;
  description?: string;
  originalTimestamp?: string; // Keep original timestamp for reference
}

// normalize to our event values
const normalizeEvent = (rawType?: string): EventType => {
  const upper = rawType?.toUpperCase();
  return (["REFUEL", "THEFT"].includes(upper || "")
    ? upper
    : "NORMAL") as EventType;
};

// Theft events
const THEFT_EVENTS = new Set<EventType>(["THEFT"]);
// const THEFT_EVENTS = new Set<EventType>(["THEFT", "DROP"]);

const EPS = 0.2;

/** Dot renderer (no nulls to satisfy Recharts typing) */
const DotRenderer: React.FC<any> = ({ cx, cy, payload, sensorStatus }) => {
  if (!payload) return <g />;
  const event: EventType = payload.event ?? "NORMAL";
  
  // If sensor is offline, make all dots gray
  if (sensorStatus === "offline") {
    return <circle cx={cx} cy={cy} r={4} fill="#6b7280" stroke="#fff" strokeWidth={1} />;
  }
  
  // Otherwise show original colors
  const fill =
    event === "THEFT"
      ? "#ef4444"
      : event === "REFUEL"
      ? "#10b981"
      : "#3b82f6";
  return <circle cx={cx} cy={cy} r={4} fill={fill} stroke="#fff" strokeWidth={1} />;
};

/** Active (hover) dot renderer */
const ActiveDotRenderer: React.FC<any> = ({ cx, cy, payload, sensorStatus }) => {
  if (!payload) return <g />;
  const event: EventType = payload.event ?? "NORMAL";
  
  // If sensor is offline, make all dots gray
  if (sensorStatus === "offline") {
    return <circle cx={cx} cy={cy} r={6} fill="#6b7280" stroke="#000" strokeWidth={1} />;
  }
  
  // Otherwise show original colors
  const fill =
    event === "THEFT"
      ? "#ef4444"
      : event === "REFUEL"
      ? "#10b981"
      : "#3b82f6";
  return <circle cx={cx} cy={cy} r={6} fill={fill} stroke="#000" strokeWidth={1} />;
};

const FuelChart: React.FC<FuelChartProps> = ({
  fuelData,
  busId,
  theftTotalOverride,
  sensorStatus,
}) => {
  const [isDark, setIsDark] = React.useState(false);
  React.useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const { parsedData, computedTheft, fromStr, toStr } = useMemo(() => {
    const sorted = [...(fuelData || [])]
      .filter(d =>
        d &&
        d.timestamp &&
        !Number.isNaN(new Date(d.timestamp as any).getTime())
      )
      .sort((a, b) =>
        new Date(a.timestamp as any).getTime() - new Date(b.timestamp as any).getTime()
      );
  
    let parsed: ParsedDataPoint[] = sorted
      .map((d) => {
        const t = new Date(d.timestamp as any).getTime();
        const ev = normalizeEvent((d as any).eventType || (d as any).type);
        const chRaw = (d as any).fuelChange;
        const ch =
          typeof chRaw === "number"
            ? chRaw
            : (typeof chRaw === "string" && chRaw.trim() !== "" ? Number(chRaw) : undefined);
  
        return {
          time: t,
          fuelLevel: Number((d as any).fuelLevel ?? (d as any).fuel_level ?? (d as any).level ?? 0),
          event: ev,
          fuelChange: Number.isFinite(ch as number) ? (ch as number) : undefined,
          description: (d as any).description,
          originalTimestamp: String(d.timestamp),
        };
      })
      // NEW: drop bad points so Recharts doesn't render an empty chart
      .filter(p => Number.isFinite(p.fuelLevel));
    

    
    // If there are no events but we have at least one point, ensure the chart still plots a line
    // by ensuring event defaults to NORMAL (already done in normalize) and keeping points.
  
    let theft = 0;
    for (let i = 0; i < parsed.length; i++) {
      if (THEFT_EVENTS.has(parsed[i].event)) {
        const fc = parsed[i].fuelChange;
        if (typeof fc === "number" && Math.abs(fc) > EPS) {
          theft += Math.abs(fc);
        }
      }
    }
  
    let fromStr = "N/A";
    let toStr = "N/A";
    if (parsed.length > 0) {
      try {
        fromStr = format(new Date(parsed[0].time), "PPpp");
        toStr = format(new Date(parsed[parsed.length - 1].time), "PPpp");
      } catch {}
    }
  
    return { parsedData: parsed, computedTheft: theft, fromStr, toStr };
  }, [fuelData, sensorStatus]);
  

  const totalTheft =
    typeof theftTotalOverride === "number"
      ? theftTotalOverride
      : computedTheft;

  if (!parsedData || parsedData.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 mt-10 text-center text-gray-500 dark:text-gray-400">
        No fuel data available for the selected date range or bus.
      </div>
    );
  }

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 mt-10">
      <div className="flex flex-wrap items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
          📈 Fuel Level Graph –{" "}
          <span className="text-blue-600 dark:text-blue-300">{busId}</span>
        </h3>
        <div className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 px-3 py-1.5 rounded-lg text-sm font-medium">
          🚩 Total Fuel Theft:{" "}
          <span className="font-bold">{totalTheft.toFixed(2)} L</span>
        </div>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Showing data from <strong>{fromStr}</strong> to{" "}
        <strong>{toStr}</strong> ({parsedData.length} data points)
      </p>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={parsedData}
          margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
        >
          <CartesianGrid
            stroke={isDark ? "#374151" : "#ccc"}
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="time"
            tickFormatter={(v) => {
              try {
                return format(new Date(v), "HH:mm");
              } catch {
                return "";
              }
            }}
            type="number"
            domain={["dataMin", "dataMax"]}
            scale="time"
            tick={{ fill: isDark ? "#d1d5db" : "#374151", fontSize: 12 }}
          />
          <YAxis
            domain={[0, "auto"]}
            label={{
              value: "Fuel (Litres)",
              angle: -90,
              position: "insideLeft",
              fill: isDark ? "#d1d5db" : "#374151",
            }}
            tick={{ fill: isDark ? "#d1d5db" : "#374151", fontSize: 12 }}
          />
          <Tooltip
            labelFormatter={(label) => {
              try {
                return format(new Date(label), "PPpp");
              } catch {
                return "";
              }
            }}
            formatter={(value: number, _name: string, props: any) => {
              const event = props?.payload?.event || "NORMAL";
              const description = props?.payload?.description;
              const fuelChange = props?.payload?.fuelChange as
                | number
                | undefined;

              if (event === "SENSOR_OFFLINE") {
                return [
                  `${value} L`,
                  `Sensor Offline: ${description || "No recent data"}`,
                ];
              } else if (event !== "NORMAL") {
                const eventLabel =
                  event.charAt(0) + event.slice(1).toLowerCase();
                const changeStr =
                  typeof fuelChange === "number" && !Number.isNaN(fuelChange)
                    ? ` (${fuelChange > 0 ? "+" : ""}${fuelChange.toFixed(
                        2
                      )} L)`
                    : "";
                return [
                  `${value} L`,
                  `${eventLabel}${changeStr}: ${
                    description || "Detected Event"
                  }`,
                ];
              }
              return [`${value} L`, "Fuel Level"];
            }}
            contentStyle={{
              backgroundColor: isDark ? "#1f2937" : "#fff",
              border: "none",
              color: isDark ? "#f3f4f6" : "#1f2937",
              fontSize: "14px",
            }}
            labelStyle={{ color: isDark ? "#d1d5db" : "#4b5563" }}
          />
          <Line
            type="monotone"
            dataKey="fuelLevel"
            stroke="#3b82f6"
            strokeWidth={2}
            // supply elements (not functions) to satisfy types; never return null
            dot={(props) => <DotRenderer {...props} sensorStatus={sensorStatus} />}
            activeDot={(props) => <ActiveDotRenderer {...props} sensorStatus={sensorStatus} />}
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="flex items-center gap-6 mt-4 text-sm text-gray-700 dark:text-gray-300">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: "#ef4444" }}
          />
          Theft
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: "#10b981" }}
          />
          Refuel
        </div>

        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm"
<<<<<<< HEAD
            style={{ backgroundColor: "#6b7280" }}
          />
          Sensor Health
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: "#f59e0b" }}
=======
            style={{ backgroundColor: "#3b82f6" }}
>>>>>>> c53db9d
          />
          Normal
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-sm"
            style={{ backgroundColor: "#6b7280" }}
          />
          Sensor Offline
        </div>
      </div>
    </section>
  );
};

export default FuelChart;



























// // src/components/FuelChart.tsx
// import React, { useMemo } from "react";
// import {
//   LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
// } from "recharts";
// import { format } from "date-fns";
// import type { FuelReading } from "../types/fuel";

// type EventType = "REFUEL" | "THEFT" | "DROP" | "NORMAL";

// interface FuelChartProps {
//   fuelData: FuelReading[];
//   busId: string;
//   /** NEW: use backend summary when available */
//   theftTotalOverride?: number;
// }

// interface ParsedDataPoint {
//   time: number;
//   fuelLevel: number;
//   event: EventType;
//   fuelChange?: number;
//   description?: string;
// }

// const normalizeEvent = (rawType?: string): EventType => {
//   const upper = rawType?.toUpperCase();
//   return (["REFUEL", "THEFT", "DROP"].includes(upper || "") ? upper : "NORMAL") as EventType;
// };

// // If your backend marks theft as DROP, switch to include it:
// const THEFT_EVENTS = new Set<EventType>(["THEFT"]);
// // const THEFT_EVENTS = new Set<EventType>(["THEFT", "DROP"]);

// const EPS = 0.2;

// const FuelChart: React.FC<FuelChartProps> = ({ fuelData, busId, theftTotalOverride }) => {
//   const [isDark, setIsDark] = React.useState(false);
//   React.useEffect(() => {
//     setIsDark(document.documentElement.classList.contains("dark"));
//   }, []);

//   const { parsedData, computedTheft, fromStr, toStr } = useMemo(() => {
//     const sorted = [...(fuelData || [])]
//       .filter(d => d && d.timestamp && !Number.isNaN(new Date(d.timestamp as any).getTime()))
//       .sort((a, b) => new Date(a.timestamp as any).getTime() - new Date(b.timestamp as any).getTime());

//     const parsed: ParsedDataPoint[] = sorted.map((d) => ({
//       time: new Date(d.timestamp as any).getTime(),
//       fuelLevel: Number(d.fuelLevel),
//       event: normalizeEvent((d as any).eventType || (d as any).type),
//       // coerce to number if string (e.g. "-12.4")
//       fuelChange: typeof (d as any).fuelChange === "number"
//         ? (d as any).fuelChange
//         : (typeof (d as any).fuelChange === "string" && (d as any).fuelChange.trim() !== ""
//             ? Number((d as any).fuelChange)
//             : undefined),
//       description: (d as any).description,
//     }));

//     // Strict: only sum provided fuelChange for theft-like events
//     let theft = 0;
//     for (let i = 0; i < parsed.length; i++) {
//       if (THEFT_EVENTS.has(parsed[i].event)) {
//         const fc = parsed[i].fuelChange;
//         if (typeof fc === "number" && Math.abs(fc) > EPS) {
//           theft += Math.abs(fc);
//         }
//       }
//     }

//     let fromStr = "N/A";
//     let toStr = "N/A";
//     if (parsed.length > 0) {
//       try {
//         fromStr = format(new Date(parsed[0].time), "PPpp");
//         toStr = format(new Date(parsed[parsed.length - 1].time), "PPpp");
//       } catch {}
//     }

//     return { parsedData: parsed, computedTheft: theft, fromStr, toStr };
//   }, [fuelData]);

//   // prefer backend summary when given
//   const totalTheft = typeof theftTotalOverride === "number"
//     ? theftTotalOverride
//     : computedTheft;

//   if (!parsedData || parsedData.length === 0) {
//     return (
//       <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 mt-10 text-center text-gray-500 dark:text-gray-400">
//         No fuel data available for the selected date range or bus.
//       </div>
//     );
//   }

//   const getDotColor = (event: EventType) => {
//     switch (event) {
//       case "THEFT": return "#ef4444";
//       case "REFUEL": return "#10b981";
//       case "DROP": return "#f59e0b";
//       default: return "#3b82f6";
//     }
//   };

//   return (
//     <section className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 mt-10">
//       <div className="flex flex-wrap items-center justify-between mb-4">
//         <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
//           📈 Fuel Level Graph – <span className="text-blue-600 dark:text-blue-300">{busId}</span>
//         </h3>
//         <div className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 px-3 py-1.5 rounded-lg text-sm font-medium">
//           🚩 Total Fuel Theft: <span className="font-bold">{totalTheft.toFixed(2)} L</span>
//         </div>
//       </div>

//       <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
//         Showing data from <strong>{fromStr}</strong> to <strong>{toStr}</strong> ({parsedData.length} data points)
//       </p>

//       <ResponsiveContainer width="100%" height={300}>
//         <LineChart data={parsedData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
//           <CartesianGrid stroke={isDark ? "#374151" : "#ccc"} strokeDasharray="3 3" />
//           <XAxis
//             dataKey="time"
//             tickFormatter={(v) => { try { return format(new Date(v), "HH:mm"); } catch { return ""; } }}
//             type="number"
//             domain={["dataMin", "dataMax"]}
//             scale="time"
//             tick={{ fill: isDark ? "#d1d5db" : "#374151", fontSize: 12 }}
//           />
//           <YAxis
//             domain={[0, "auto"]}
//             label={{ value: "Fuel (Litres)", angle: -90, position: "insideLeft", fill: isDark ? "#d1d5db" : "#374151" }}
//             tick={{ fill: isDark ? "#d1d5db" : "#374151", fontSize: 12 }}
//           />
//           <Tooltip
//             labelFormatter={(label) => { try { return format(new Date(label), "PPpp"); } catch { return ""; } }}
//             formatter={(value: number, _name: string, props: any) => {
//               const event = props?.payload?.event || "NORMAL";
//               const description = props?.payload?.description;
//               const fuelChange = props?.payload?.fuelChange as number | undefined;

//               if (event !== "NORMAL") {
//                 const eventLabel = event.charAt(0) + event.slice(1).toLowerCase();
//                 const changeStr =
//                   typeof fuelChange === "number" && !Number.isNaN(fuelChange)
//                     ? ` (${fuelChange > 0 ? "+" : ""}${fuelChange.toFixed(2)} L)`
//                     : "";
//                 return [`${value} L`, `${eventLabel}${changeStr}: ${description || "Detected Event"}`];
//               }
//               return [`${value} L`, "Fuel Level"];
//             }}
//             contentStyle={{ backgroundColor: isDark ? "#1f2937" : "#fff", border: "none", color: isDark ? "#f3f4f6" : "#1f2937", fontSize: "14px" }}
//             labelStyle={{ color: isDark ? "#d1d5db" : "#4b5563" }}
//           />
//           <Line
//             type="monotone"
//             dataKey="fuelLevel"
//             stroke="#3b82f6"
//             strokeWidth={2}
//             dot={(props: any) => {
//               const { cx, cy, payload, index } = props;
//               const event = payload?.event ?? "NORMAL";
//               return (
//                 <circle
//                   key={`dot-${index}`}
//                   cx={cx}
//                   cy={cy}
//                   r={4}
//                   fill={getDotColor(event)}
//                   stroke="#fff"
//                   strokeWidth={1}
//                 />
//               );
//             }}
//             activeDot={(props: any) => {
//               const { cx, cy, index } = props;
//               return <circle key={`activedot-${index}`} cx={cx} cy={cy} r={6} fill="#3b82f6" stroke="#000" strokeWidth={1} />;
//             }}
//           />
//         </LineChart>
//       </ResponsiveContainer>

//       <div className="flex items-center gap-6 mt-4 text-sm text-gray-700 dark:text-gray-300">
//         <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#ef4444" }} />Theft</div>
//         <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#10b981" }} />Refuel</div>
//         <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#f59e0b" }} />Drop</div>
//         <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#3b82f6" }} />Normal</div>
//       </div>
//     </section>
//   );
// };

// export default FuelChart;
