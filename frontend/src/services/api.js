// =============================================================================
// API SERVICE — Centralized connection to the FastAPI Backend
// =============================================================================
// Automatically connect to the Live Backend if deployed on Vercel, otherwise Localhost.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

// -----------------------------------------------------------------------------
// 1. HAZARD RISK CHECK — POST /api/risk
//    Sends a location string, returns: { primary_hazard, risk_level, explanation, weather_data_used }
// -----------------------------------------------------------------------------
export async function checkHazardRisk(location, lat = null, lon = null) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location, lat, lon }),
    });
    if (!res.ok) throw new Error(`Risk API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("checkHazardRisk failed:", err);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// 2. CHATBOT — POST /api/chat (Streaming)
// -----------------------------------------------------------------------------
export async function sendChatMessage(message) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error(`Chat API error: ${res.status}`);
    return res; // Return the raw response so the component can read the stream
  } catch (err) {
    console.error("sendChatMessage failed:", err);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// 3. REPORT HAZARD (Image Upload) — POST /api/report
//    Sends: FormData with { location, latitude, longitude, image (file) }
//    Returns: { hazard, severity, analysis }
// -----------------------------------------------------------------------------
export async function reportHazard(location, latitude, longitude, imageFile) {
  try {
    const formData = new FormData();
    formData.append("location", location);
    formData.append("latitude", latitude);
    formData.append("longitude", longitude);
    formData.append("image", imageFile);

    const res = await fetch(`${API_BASE_URL}/api/report`, {
      method: "POST",
      body: formData,
      // NOTE: Do NOT set Content-Type header — the browser sets it with the boundary automatically
    });
    if (!res.ok) throw new Error(`Report API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("reportHazard failed:", err);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// 4. REGISTER — POST /api/auth/register
//    Sends: { email, password, fcm_token?, home_latitude?, home_longitude? }
//    Returns: { message, uid }
// -----------------------------------------------------------------------------
export async function registerUser(email, password, fcmToken = null, homeLat = null, homeLon = null) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        fcm_token: fcmToken,
        home_latitude: homeLat,
        home_longitude: homeLon,
      }),
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.detail || `Register error: ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error("registerUser failed:", err);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// 5. GET AUTHENTICATED USER — GET /api/auth/me
//    Requires: Bearer token in Authorization header
//    Returns: { message, uid, email }
// -----------------------------------------------------------------------------
export async function getAuthenticatedUser(idToken) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    if (!res.ok) throw new Error(`Auth error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("getAuthenticatedUser failed:", err);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// 6. LIVE AI NEWS FEED — GET /api/news
//    Returns: Array of formatted incident objects from Firestore
// -----------------------------------------------------------------------------
export async function getLiveNews() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/news`, {
      method: "GET",
    });
    if (!res.ok) throw new Error(`News API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("getLiveNews failed (offline):", err);
    return [];
  }
}

// -----------------------------------------------------------------------------
// 7. EXTERNAL HAZARDS — GET /api/external-hazards
//    Returns: NASA EONET and USGS Earthquake points
// -----------------------------------------------------------------------------
export async function fetchExternalHazards() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/external-hazards`, {
      method: "GET",
    });
    if (!res.ok) throw new Error(`External Hazards API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("fetchExternalHazards failed:", err);
    return [];
  }
}

/**
 * Fetches AI-generated Strategic Situation Report (SITREP)
 * @param {string} lang       - 'en' or 'bm'
 * @param {string} location   - Active location name (e.g. "Johor Bahru")
 * @param {number|null} lat   - Latitude from GPS or map click
 * @param {number|null} lon   - Longitude from GPS or map click
 */
export async function getStrategicAdvisory(lang = 'en', location = null, lat = null, lon = null) {
  try {
    const params = new URLSearchParams({ lang });
    if (location) params.append('location', location);
    if (lat !== null) params.append('lat', lat);
    if (lon !== null) params.append('lon', lon);

    const res = await fetch(`${API_BASE_URL}/api/advisory?${params.toString()}`);
    if (!res.ok) throw new Error("Strategic Advisory API returned error");
    return await res.json();
  } catch (error) {
    console.error("Advisory Error:", error);
    return { advisory: lang === 'en' ? "Strategic advisory triage failed." : "Gagal triaj penasihat strategik." };
  }
}

// -----------------------------------------------------------------------------
// 9. HISTORICAL HAZARDS — GET /api/historical-hazards (location-string only)
// -----------------------------------------------------------------------------
export async function fetchHistoricalHazards(location) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/historical-hazards?location=${encodeURIComponent(location)}`);
    if (!res.ok) throw new Error(`Historical Hazards error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("fetchHistoricalHazards failed:", err);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// 10. LIVE LOCATION DATA — GET /api/live-location-data
//     Requires lat/lon. Returns real Open-Meteo monthly precipitation + hazard trends.
//     Falls back to seed-based data server-side if Open-Meteo is unavailable.
// -----------------------------------------------------------------------------
export async function fetchLiveLocationData(lat, lon, location = '') {
  try {
    const params = new URLSearchParams({
      lat,
      lon,
      ...(location ? { location } : {}),
    });
    const res = await fetch(`${API_BASE_URL}/api/live-location-data?${params.toString()}`);
    if (!res.ok) throw new Error(`Live Location Data error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('fetchLiveLocationData failed:', err);
    return null; // Caller should fall back to fetchHistoricalHazards
  }
}
