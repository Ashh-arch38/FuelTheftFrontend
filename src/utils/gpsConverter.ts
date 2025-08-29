/**
 * GPS Coordinate Converter for Teltonika FMB920
 * 
 * Teltonika FMB920 sends coordinates as integers multiplied by 10^-7
 * So instead of 26.8467, it sends 268467000
 * 
 * This utility converts the raw values to proper decimal degrees
 */

/**
 * Convert raw GPS coordinate from Teltonika FMB920 format to decimal degrees
 * @param rawCoordinate - Raw coordinate value from sensor (integer * 10^-7)
 * @returns Proper decimal degrees coordinate
 */
export function convertGpsCoordinate(rawCoordinate: number): number {
  if (typeof rawCoordinate !== 'number' || !Number.isFinite(rawCoordinate)) {
    return 0;
  }

  // Teltonika FMB920 sends coordinates as integers multiplied by 10^-7
  // So we need to divide by 10^7 to get the proper decimal degrees
  const DECIMAL_PLACES = 7;
  const divisor = Math.pow(10, DECIMAL_PLACES);
  
  return rawCoordinate / divisor;
}

/**
 * Convert GPS coordinates from Teltonika FMB920 format
 * @param latitude - Raw latitude value
 * @param longitude - Raw longitude value
 * @returns Object with converted latitude and longitude
 */
export function convertGpsCoordinates(latitude: number, longitude: number): {
  latitude: number;
  longitude: number;
} {
  return {
    latitude: convertGpsCoordinate(latitude),
    longitude: convertGpsCoordinate(longitude)
  };
}

/**
 * Check if coordinates are in the expected range for Lucknow area
 * @param latitude - Latitude in decimal degrees
 * @param longitude - Longitude in decimal degrees
 * @returns true if coordinates are in reasonable range for Lucknow
 */
export function isValidLucknowCoordinates(latitude: number, longitude: number): boolean {
  // Lucknow coordinates: ~26.85°N, ~80.95°E
  // Allow some tolerance for nearby areas
  const LUCKNOW_LAT_MIN = 26.0;
  const LUCKNOW_LAT_MAX = 27.5;
  const LUCKNOW_LON_MIN = 80.0;
  const LUCKNOW_LON_MAX = 82.0;

  return (
    latitude >= LUCKNOW_LAT_MIN && latitude <= LUCKNOW_LAT_MAX &&
    longitude >= LUCKNOW_LON_MIN && longitude <= LUCKNOW_LON_MAX
  );
}

/**
 * Smart GPS coordinate converter that handles both raw and already-converted values
 * @param rawLat - Raw latitude value
 * @param rawLon - Raw longitude value
 * @returns Converted coordinates
 */
export function smartGpsConverter(rawLat: number, rawLon: number): {
  latitude: number;
  longitude: number;
} {
  // First, try converting as if they're raw Teltonika values
  let converted = convertGpsCoordinates(rawLat, rawLon);
  
  // Check if the converted values make sense for Lucknow
  if (isValidLucknowCoordinates(converted.latitude, converted.longitude)) {
    return converted;
  }
  
  // If not, the values might already be converted or in a different format
  // Check if they're already in the right range
  if (isValidLucknowCoordinates(rawLat, rawLon)) {
    return { latitude: rawLat, longitude: rawLon };
  }
  
  // If still not valid, try multiplying by 100 (in case of double division)
  const multiplied = {
    latitude: rawLat * 100,
    longitude: rawLon * 100
  };
  
  if (isValidLucknowCoordinates(multiplied.latitude, multiplied.longitude)) {
    return multiplied;
  }
  
  // If nothing works, return the original values but log a warning
  console.warn('GPS coordinates could not be properly converted:', { rawLat, rawLon });
  return { latitude: rawLat, longitude: rawLon };
}
