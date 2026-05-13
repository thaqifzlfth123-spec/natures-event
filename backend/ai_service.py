import os
import httpx
import logging
import asyncio
import json
from google import genai  # pyright: ignore[reportMissingImports]
from google.genai import types  # pyright: ignore[reportMissingImports]
from dotenv import load_dotenv # type: ignore

load_dotenv()
from weather_service import get_real_weather

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================
# AI ARCHITECTURE: Vertex AI Gemini only
# ============================================================
# Gemini -> All chat, evacuation plans, hazard analysis, and vision.
# ============================================================

# --- Initialize Gemini Vertex AI Client (New google-genai SDK) ---
gcp_project = os.getenv("GCP_PROJECT_ID")
gcp_location = os.getenv("GCP_LOCATION", "asia-southeast1")
gemini_client_vertex = None
api_key_fallback = os.getenv("GEMINI_API_KEY")

# 🚀 1. Attempt Vertex AI (Uses GCP Credits or Default Environment Credentials)
try:
    # Initialize Client. If project is None, SDK will try to auto-detect from environment (Cloud Run/Vertex AI)
    gemini_client_vertex = genai.Client(vertexai=True, project=gcp_project, location=gcp_location)
    logger.info(f"🚀 Gemini Vertex AI Ready (Project: {gcp_project or 'Auto-detected'})")
except Exception as e:
    logger.error(f"⚠️ Vertex AI initialization failed: {e}")
    if api_key_fallback:
        try:
            gemini_client_vertex = genai.Client(api_key=api_key_fallback)
            logger.info("🚀 Gemini API Key Client Ready (Fallback)")
        except Exception as e2:
            logger.error(f"⚠️ API Key fallback also failed: {e2}")

GEMINI_MODEL = "gemini-2.5-flash"

# Helper to get the Vertex Gemini client
def get_gemini_client():
    if gemini_client_vertex:
        return gemini_client_vertex, True # True means it's Vertex
    return None, False


# ============================================================
# 1. EVACUATION PLAN — Powered by Gemini Vertex AI
# ============================================================
async def get_evacuation_plan(lat: float, lon: float, hazard: str) -> dict:
    client, is_vertex = get_gemini_client()
    if not client:
        return {
            "instruction": "Please move to higher ground and seek the nearest hospital or police station.",
            "safe_zone_name": "Nearest official safe zone",
            "lat": lat + 0.01,
            "lon": lon + 0.01
        }
    
    # Query OpenStreetMap (Overpass API) for nearest hospital or safe zone within 5km
    query = f"""
    [out:json];
    (
      node["amenity"="hospital"](around:5000,{lat},{lon});
      node["amenity"="police"](around:5000,{lat},{lon});
      node["amenity"="community_centre"](around:5000,{lat},{lon});
    );
    out body 1;
    """
    
    safe_zone_name = "the nearest official safe zone"
    target_lat = lat + 0.005 # Default slightly away if API fails
    target_lon = lon + 0.005
    
    try:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.post("https://overpass-api.de/api/interpreter", data=query, timeout=5.0)
            data = resp.json()
            if data and "elements" in data and len(data["elements"]) > 0:
                element = data["elements"][0]
                tags = element.get("tags", {})
                safe_zone_name = tags.get("name", "Nearest Safe facility")
                target_lat = element.get("lat", lat + 0.005)
                target_lon = element.get("lon", lon + 0.005)
    except Exception as e:
        logger.error(f"Overpass API error: {e}")
        
    prompt = f"There is a High severity {hazard} reported near {lat}, {lon}. We found a safe zone: {safe_zone_name}. Draft a brief, 1-sentence urgent emergency evacuation instruction directed at the user, telling them to evacuate to {safe_zone_name}."
    
    instruction = f"Urgent: {hazard} detected. Please evacuate to {safe_zone_name}."

    try:
        response = await client.aio.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type='application/json'
            )
        )
        data = json.loads(response.text)
        logger.info("✅ Evacuation Plan by Gemini (Vertex)")
        return data
    except Exception as e:
        logger.error(f"Gemini error on evacuation plan: {e}")
        return {
            "instruction": instruction,
            "safe_zone_name": safe_zone_name,
            "lat": target_lat,
            "lon": target_lon
        }


# ============================================================
# 2. HAZARD RISK ANALYSIS — Powered by GEMINI (Superior Reasoning)
# ============================================================
async def check_hazard_risk(location: str, weather_data: str):
    client, is_vertex = get_gemini_client()
    if not client:
        return "None", "High", "Mocked response (No AI keys set): High risk due to simulated extreme conditions."
        
    prompt = f"""
    Given the location {location} and current weather: {weather_data},
    determine the primary natural hazard risk (e.g., Flood, Heatwave, Drought, Storm, Forest Burning, or None)
    and the overall risk level (Low, Medium, High). 
    * Note: For Forest Burning risk (Wildfire), emulate the MET Malaysia FDRS (Fire Danger Rating System) by carefully analyzing if the temperature is high (>32 C), humidity is very low (<60%), and precipitation is 0mm. Explain the risk factor briefly.
    * IMPORTANT: In your Explanation, you MUST BOLD every numerical weather metric (e.g., **32 C**, **85% humidity**, **10 kph**, **1.2mm precipitation**). This is for user readability.
    
    CRITICAL RULE: The weather data contains a [CONFIRMED LOCATION]. You MUST ONLY discuss that exact location name in your explanation. NEVER use Chinese characters (Hanzi). Use only English or Malay names. Do NOT hallucinate or assume Kuala Lumpur unless the confirmed location is explicitly Kuala Lumpur. Keep your explanation focused on the confirmed location.

    Format:
    Hazard: <hazard_type>
    Risk: <level>
    Explanation: <text>
    """

    try:
        response = await client.aio.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        text = response.text
        logger.info("✅ Hazard Analysis by Gemini (Vertex)")
        return _parse_hazard_response(text)
    except Exception as e:
        logger.error(f"Gemini error on hazard risk: {e}")
        return "Unknown", "Unknown", f"Error: Gemini failed to analyze hazard risk. {e}"


def _parse_hazard_response(text: str):
    """Shared parser for hazard risk responses from any AI model."""
    risk_level = "Unknown"
    primary_hazard = "None"
    explanation = text

    for line in text.split("\n"):
        if "Risk:" in line:
            risk_level = line.replace("Risk:", "").strip()
        elif "Hazard:" in line:
            primary_hazard = line.replace("Hazard:", "").strip()
        elif "Explanation:" in line:
            explanation = line.replace("Explanation:", "").strip()

    return primary_hazard, risk_level, explanation


# ============================================================
# 3. EMERGENCY CHATBOT — Powered by Gemini Vertex AI
# ============================================================
async def get_chatbot_stream(message: str):
    client, _ = get_gemini_client()
    if not client:
        yield "System: AI provider keys not configured. Please listen to local authorities and head to higher ground if instructed." if "malaysia" not in message.lower() else "Sistem: Kunci penyedia AI tidak dikonfigurasi. Sila dengar arahan pihak berkuasa tempatan dan pergi ke kawasan tinggi jika diarahkan."
        return
        
    # --- RAG IMPLEMENTATION ---
    rag_context = ""
    try:
        kb_path = os.path.join(os.path.dirname(__file__), "knowledge_base.txt")
        with open(kb_path, "r", encoding="utf-8") as f:
            rag_context = f.read()
    except Exception as e:
        print(f"RAG Knowledge Base not found or unreadable: {e}")

    # --- LIVE SENSOR FUSION ---
    live_weather_data = "No specific location mentioned, no live radar data pulled."
    
    # Use Vertex Gemini for location extraction
    extraction = "NONE"
    try:
        response = await client.aio.models.generate_content(
            model=GEMINI_MODEL,
            contents=f"Extract the specific city or location requested in this message. Reply ONLY with the location name. If no location is mentioned, reply EXACTLY with the word 'NONE'.\n\nMessage: {message}",
        )
        extraction = response.text.strip()
        logger.info("✅ Location Extraction by Gemini (Vertex)")
    except Exception as e:
        logger.warning(f"Gemini location extraction failed: {e}")

    if extraction and extraction.upper() != "NONE" and "NONE" not in extraction.upper():
        try:
            live_weather_data = await get_real_weather(extraction)
        except Exception as e:
            logger.warning(f"Weather data fetch failed: {e}")

    system_prompt = f"""You are VAI — an expert National Emergency and Survival Assistant for Malaysia.

    AUTHORITY HIERARCHY (follow in this order):
    1. PRIMARY SOURCE — NADMA Official Guidelines (use for major Malaysian disasters: floods, landslides, earthquakes, haze):
    [OFFICIAL NADMA GUIDELINES]
    {rag_context}
    [END NADMA GUIDELINES]

    2. SECONDARY SOURCE — General international survival, first-aid, and emergency preparedness knowledge.
       Use this tier ONLY for questions not covered by NADMA (e.g., "how to use a fire extinguisher",
       "how to treat a burn", "what to do during a chemical spill", "how to perform CPR").
       Answer these helpfully and concisely — do NOT refuse them.

    [LIVE SENSOR / WEATHER DATA]
    {live_weather_data}
    * If the user asks about flood/emergency status in a location, use this live data to answer directly.
    * If precipitation is low and risk is minimal, simply confirm the area is currently safe.
      Do NOT recite emergency numbers or evacuation procedures if the area is safe.
    [END SENSOR DATA]

    RESPONSE RULES:
    - Match the user's language EXACTLY: English → English only, Bahasa Melayu → Malay only.
    - NEVER use Chinese characters (Hanzi). Use only English or Malay.
    - Be concise, direct, and actionable. Avoid bureaucratic filler.
    - For life-threatening situations, always recommend contacting emergency services (999 / Bomba 994)."""

    try:
        full_prompt = f"{system_prompt}\n\nUser question: {message}"
        response = await client.aio.models.generate_content_stream(
            model=GEMINI_MODEL,
            contents=full_prompt,
        )
        async for chunk in response:
            if chunk.text:
                yield chunk.text
        logger.info("✅ Chatbot Response Stream completed by Gemini (Vertex)")
    except Exception as e:
        logger.error(f"Gemini chatbot streaming error: {e}")
        yield "Error: Vertex Gemini service is unavailable. Please try again later." if "malaysia" not in message.lower() else "Ralat: Perkhidmatan Vertex Gemini tidak tersedia. Sila cuba sebentar lagi."


# ============================================================
# 4. IMAGE ANALYSIS — Powered by GEMINI (Superior Vision)
# ============================================================
async def analyze_hazard_image(image_bytes: bytes, location: str, content_type: str):
    client, is_vertex = get_gemini_client()
    if not client:
        return "Unknown", "High", f"Mocked analysis (No AI keys set): The reported hazard at {location} appears severe.", "100%"
        
    prompt = f"Analyze this image from {location} for any natural hazards (Flood, Fire, Storm damage, Drought) and state your estimated detection accuracy as a percentage. Return exactly in this format:\nHazard: <hazard_type>\nSeverity: <level>\nConfidence: <0-100%>\nAnalysis: <text>"

    try:
        image_part = types.Part.from_bytes(
            data=image_bytes,
            mime_type=content_type,
        )
        response = await client.aio.models.generate_content(
            model=GEMINI_MODEL,
            contents=[prompt, image_part],
        )
        text = response.text
        logger.info("✅ Image Vision by Gemini (Vertex)")
        return _parse_image_response(text)
    except Exception as e:
        logger.error(f"Gemini Vision error: {e}")
        return "Unknown", "Unknown", f"Image analysis failed: Vertex Gemini is unavailable. {e}", "0%"


def _parse_image_response(text: str):
    """Shared parser for image analysis responses from any AI model."""
    severity = "Unknown"
    hazard = "Unknown"
    confidence = "Unknown"
    analysis = text

    for line in text.split("\n"):
        if "Severity:" in line:
            severity = line.replace("Severity:", "").strip()
        elif "Hazard:" in line:
            hazard = line.replace("Hazard:", "").strip()
        elif "Confidence:" in line:
            confidence = line.replace("Confidence:", "").strip()
        elif "Analysis:" in line:
            analysis = line.replace("Analysis:", "").strip()

    return hazard, severity, analysis, confidence
# ============================================================
# 4. STRATEGIC SITREP — Powered by Gemini 1.5 Flash
# ============================================================
async def get_strategic_advisory_text(
    news_items: list,
    lang: str = "en",
    location: str = None,
    lat: float = None,
    lon: float = None,
) -> str:
    """
    Synthesizes news items into a single mission SITREP.
    When a location is provided, the SITREP focuses on that specific area.
    """
    client, is_vertex = get_gemini_client()
    if not client:
        return "Intelligence stream offline. Manual monitoring required." if lang == "en" else "Aliran perisikan luar talian. Pemantauan manual diperlukan."

    news_context = "\n".join([f"- {item['tag']}: {item['text']}" for item in news_items])

    # Build location context block — injected only when available
    if location:
        coord_str = f" (coordinates: {lat:.4f}, {lon:.4f})" if lat is not None and lon is not None else ""
        location_context = f"""
    PRIORITY FOCUS AREA: {location}{coord_str}
    The user is actively monitoring this location. Prioritize any intelligence that is
    geographically relevant to {location} or its surrounding region.
    If no news items are directly relevant to {location}, summarize the nearest active
    threat and note the current status of the priority area."""
    else:
        location_context = "    FOCUS: General Malaysia-wide threat overview."

    prompt = f"""
    You are the Senior Intelligence Officer for Guardian Elite National Disaster Platform.
    Synthesize the following situation reports into a single tactical SITREP.

    {location_context}

    NEWS FEED:
    {news_context}

    RESPONSE REQUIREMENTS:
    1. Language: {lang}
    2. Format: Single paragraph, max 280 characters.
    3. Tone: Professional, mission-critical, authoritative.
    4. Content: Highlight active threats and responder priority for the focus area.
    5. NO CHINESE: Never use Chinese characters (Hanzi).

    Output exactly the SITREP text, no preamble.
    """

    try:
        response = await client.aio.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt
        )
        logger.info("✅ SITREP Generation successful by Gemini (Vertex)")
        return response.text.strip()
    except Exception as e:
        logger.error(f"SITREP Generation failed: {e}")
        return "Strategic advisory triage failed." if lang == "en" else "Gagal triaj penasihat strategik."
