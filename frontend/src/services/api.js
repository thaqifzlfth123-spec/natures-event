// =============================================================================
// API SERVICE — Centralized connection to the FastAPI Backend
// =============================================================================
// Automatically connect to the Live Backend if deployed on Vercel, otherwise Localhost.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

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
    // Return fallback mock data so the UI still works without the backend
    return {
      location,
      primary_hazard: "Flood",
      risk_level: "High",
      explanation: "Backend offline — showing mock data. Start the FastAPI server to get live AI analysis.",
      weather_data_used: "LOCATION: MALAYSIA - CLIMATE BASELINE. Temperature: 31.5 C. Humidity: 85%. Wind Speed: 15 kph. Precipitation: 45mm.",
    };
  }
}

// -----------------------------------------------------------------------------
// 2. CHATBOT — POST /api/chat
//    Sends a message string, returns: { message, response }
// -----------------------------------------------------------------------------
export async function sendChatMessage(message) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error(`Chat API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("sendChatMessage failed:", err);
    return {
      message,
      response: "Backend offline — showing mock response. Start the FastAPI server for live Groq AI chat.",
    };
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
    return {
      location,
      hazard: "Flood",
      severity: "High",
      analysis: "Backend offline — showing mock analysis. Start the FastAPI server for live Groq AI image analysis.",
    };
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
    console.error("getLiveNews failed:", err);
    return [];
  }
}
