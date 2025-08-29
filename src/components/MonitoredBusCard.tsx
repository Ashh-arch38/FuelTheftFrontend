// src/components/MonitoredBusCard.tsx
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { getStatusBadgeClasses, getStatusText } from "../utils/sensorStatus";

interface MonitoredBusCardProps {
  imageUrl?: string;
  regNumber: string;
  driver: string;
  route: string;
  busId: string;
  fuelLevel?: number | string;
  status: "normal" | "alert" | "offline";
  onClick?: () => void;
  selected?: boolean;
  hasTheft?: boolean;
  /** NEW: allow external styling from Dashboard */
  className?: string;
}

const MonitoredBusCard: React.FC<MonitoredBusCardProps> = ({
  imageUrl = "/src/assets/temp_bus.avif",
  regNumber,
  driver,
  route,
  busId,
  fuelLevel = 0,
  status = "normal",
  onClick,
  selected = false,
  hasTheft = false,
  className = "",
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isFuelTheftPage = location.pathname === "/fuel-theft";

  const go = () => {
    if (onClick) onClick();
    else if (!isFuelTheftPage) {
      navigate(`/fuel-theft?bus=${encodeURIComponent(regNumber)}`);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if ((onClick || !isFuelTheftPage) && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      go();
    }
  };

<<<<<<< HEAD
  const getStatusBadge = () => {
    switch (status) {
      case "alert": return "bg-red-500 text-white";
      case "offline": return "bg-gray-500 text-white";
      default: return "bg-green-500 text-white";
    }
  };
=======
  const statusBadgeClasses = getStatusBadgeClasses(status);
  const statusDisplayText = getStatusText(status);
>>>>>>> c53db9d

  const fuelNum = typeof fuelLevel === "string" ? Number(fuelLevel) : (fuelLevel as number);
  const fuelDisplay = Number.isFinite(fuelNum) ? fuelNum.toFixed(1) : "0.0";

  const theftClasses = hasTheft
    ? "border-red-500 ring-2 ring-red-300/60 dark:ring-red-400/50 bg-red-50/40 dark:bg-red-900/20"
    : "";
  const selectedClasses = selected && !hasTheft
    ? "border-blue-600 ring-2 ring-blue-400/60 dark:ring-blue-300/60"
    : "";

  return (
    <div
      role={onClick || !isFuelTheftPage ? "button" : undefined}
      aria-pressed={selected || undefined}
      tabIndex={onClick || !isFuelTheftPage ? 0 : -1}
      onClick={isFuelTheftPage ? undefined : go}
      onKeyDown={handleKeyDown}
      aria-label={`Bus ${regNumber}, driver ${driver}, route ${route}, fuel ${fuelDisplay} liters, status ${status}${hasTheft ? ", theft detected in range" : ""}`}
      data-theft={hasTheft ? "true" : "false"}
      data-bus-id={busId}
      className={[
        // << merge external className first to allow width control from parent
        className,
        "group relative flex items-center border-2 rounded-2xl shadow transition-all",
        onClick || !isFuelTheftPage ? "cursor-pointer" : "cursor-default",
        "bg-white text-gray-800 dark:bg-gray-900 dark:text-white",
        "hover:shadow-lg hover:scale-[1.02]",
        "border-gray-200 dark:border-gray-700",
        theftClasses,
        selectedClasses,
        !hasTheft ? "hover:border-blue-500 dark:hover:border-blue-400" : "",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400",
      ].join(" ")}
    >
      {hasTheft && (
        <div className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200 shadow">
          <AlertTriangle className="w-3.5 h-3.5" />
          Theft
        </div>
      )}

      <div className="w-32 h-32 overflow-hidden rounded-l-2xl shrink-0">
        <img
          src={imageUrl}
          alt={`Bus ${regNumber}`}
          className="w-full h-full object-cover transition-transform duration-300 ease-in-out group-hover:scale-110"
          loading="lazy"
        />
      </div>

      <div className="flex flex-col justify-between p-4 h-full flex-1">
        <div className={`text-lg font-semibold ${hasTheft ? "text-red-600 dark:text-red-300" : ""}`}>
          {regNumber}
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-300">Driver: {driver}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Route: {route}</div>
        <div className="flex justify-between items-center mt-3">
          <div className="text-xs text-blue-600 dark:text-blue-300 font-medium">
            ⛽ Fuel: {fuelDisplay} L
          </div>
<<<<<<< HEAD
          <div className={`px-2 py-0.5 text-[10px] rounded-full font-bold uppercase ${getStatusBadge()}`}>
            {status}
=======
          <div className={`px-2 py-0.5 text-[10px] rounded-full font-bold uppercase ${statusBadgeClasses}`}>
            {statusDisplayText}
>>>>>>> c53db9d
          </div>

        </div>
      </div>
    </div>
  );
};

export default MonitoredBusCard;

