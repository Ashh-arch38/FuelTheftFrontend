// src/config.ts
const isProd = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.PROD);

// In production, always use the Vercel rewrite at /api to avoid mixed-content.
// In development, use VITE_API_BASE_URL if provided, otherwise fall back to the local/remote dev URL.
const rawBase = isProd
  ? "/api"
  : ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || "http://3.81.250.43:3000/");

// Normalize: trim whitespace and remove trailing slashes
export const API_BASE_URL = String(rawBase).trim().replace(/\/+$/, "");
