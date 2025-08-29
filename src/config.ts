// src/config.ts
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://3.81.250.43:3000";

// Environment-specific configurations
export const IS_PRODUCTION = import.meta.env.PROD;
export const IS_DEVELOPMENT = import.meta.env.DEV;

// API timeout configuration
export const API_TIMEOUT = 30000; // 30 seconds

// Auto-reload configuration
export const AUTO_RELOAD_INTERVAL = 15 * 60 * 1000; // 15 minutes

// Sensor status thresholds
export const SENSOR_OFFLINE_THRESHOLD = 30; // minutes
export const SENSOR_ALERT_THRESHOLD = 10; // minutes
