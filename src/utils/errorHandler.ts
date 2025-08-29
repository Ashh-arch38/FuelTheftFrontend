/**
 * Error handling and validation utilities
 */
import { IS_PRODUCTION } from "../config";

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

/**
 * Handle API errors with proper logging and user feedback
 */
export function handleApiError(error: any, context: string): ApiError {
  let apiError: ApiError = {
    message: "An unexpected error occurred"
  };

  if (error.response) {
    // Server responded with error status
    apiError.status = error.response.status;
    apiError.message = error.response.data?.message || `Server error (${error.response.status})`;
  } else if (error.request) {
    // Network error
    apiError.message = "Network error - please check your connection";
    apiError.code = "NETWORK_ERROR";
  } else {
    // Other error
    apiError.message = error.message || "Unknown error occurred";
  }

  // Log error in development or if explicitly enabled
  if (!IS_PRODUCTION) {
    console.error(`[${context}]`, error);
  }

  return apiError;
}

/**
 * Retry function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (i === maxRetries - 1) {
        throw error;
      }

      // Exponential backoff
      const delay = baseDelay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Validate API response data
 */
export function validateApiResponse(data: any, expectedFields: string[]): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }

  return expectedFields.every(field => data.hasOwnProperty(field));
}

/**
 * Safe number parsing with fallback
 */
export function safeParseNumber(value: any, fallback: number = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Safe date parsing with fallback
 */
export function safeParseDate(value: any, fallback: Date = new Date()): Date {
  if (value instanceof Date) {
    return value;
  }
  
  try {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export function validateDateRange(startDate: Date, endDate: Date): boolean {
  if (!startDate || !endDate) return false;
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false;
  if (startDate > endDate) return false;
  
  // Check if date range is reasonable (not more than 1 year)
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  if (endDate.getTime() - startDate.getTime() > oneYear) return false;
  
  return true;
}

export function validateVehicleId(vehicleId: string): boolean {
  if (!vehicleId || typeof vehicleId !== 'string') return false;
  if (vehicleId.trim().length === 0) return false;
  return true;
}

export function validateSensorData(sensorData: any): boolean {
  if (!sensorData) return false;
  if (typeof sensorData.sensorStatus !== 'string') return false;
  if (typeof sensorData.isActive !== 'boolean') return false;
  return true;
}

export function logError(context: string, error: any): void {
  console.error(`[${context}] Error:`, {
    message: error.message,
    status: error.response?.status,
    data: error.response?.data,
    timestamp: new Date().toISOString()
  });
}

export function logInfo(context: string, message: string, data?: any): void {
  console.log(`[${context}] ${message}`, data || '');
}
