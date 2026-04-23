/**
 * GEOLOCATION SERVICE
 * Centralized logic for interacting with external geocoding and browser location APIs.
 */

/**
 * Perform reverse geocoding via OpenStreetMap Nominatim
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<string>} - Human-readable city/location name
 */
export async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
    if (!res.ok) throw new Error("Reverse geocoding failed");
    const data = await res.json();
    
    // Attempt to extract the most relevant location name
    const address = data.address || {};
    const city = address.city || address.town || address.village || address.state || "Malaysia";
    const district = address.city_district || address.county || address.suburb || address.neighbourhood;
    
    return {
      city,
      district,
      full: data.display_name
    };
  } catch (err) {
    console.error("Geocoding Service Error:", err);
    return { city: "Malaysia", district: null };
  }
}

/**
 * Wrapper for navigator.geolocation
 * @returns {Promise<{lat: number, lon: number}>}
 */
export async function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err)
    );
  });
}
