from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends # type: ignore
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel # pyright: ignore[reportMissingImports]
from ai_service import (
    check_hazard_risk, 
    get_chatbot_stream, 
    analyze_hazard_image, 
    get_evacuation_plan,
    get_strategic_advisory_text
)
from fastapi.responses import StreamingResponse
from weather_service import get_real_weather
from database import get_db, auth as firebase_auth
from firebase_admin import auth as fa_auth, messaging
from firebase_admin.exceptions import FirebaseError
from fastapi.middleware.cors import CORSMiddleware # type: ignore
from utils import calculate_distance
from datetime import datetime, timezone, timedelta
import asyncio
import logging
from typing import Optional, Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI App
app = FastAPI(
    title="Flood Alert System Backend",
    description="Backend for the Flood Alert App powered by FastAPI with Vertex AI Gemini",
    version="2.0.0"
)

# --- CACHE & DATA REFRESH SYSTEM ---
RISK_CACHE: Dict[str, Any] = {}
CACHE_EXPIRATION_MINUTES = 10

async def background_refresh_cache():
    while True:
        await asyncio.sleep(600)
        logger.info("[CRON] Refreshing Weather Data Cache...")
        for location in list(RISK_CACHE.keys()):
            try:
                live_weather_data = await get_real_weather(location)
                primary_hazard, risk_level, explanation = await check_hazard_risk(location, live_weather_data)
                RISK_CACHE[location] = {
                    "primary_hazard": primary_hazard,
                    "risk_level": risk_level,
                    "explanation": explanation,
                    "weather_data_used": live_weather_data,
                    "timestamp": datetime.now(timezone.utc)
                }
            except Exception as e:
                logger.error(f"[CRON] Failed to refresh {location}: {e}")

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(background_refresh_cache())

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://natures-event-zeta.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LocationRequest(BaseModel):
    location: str
    lat: Optional[float] = None
    lon: Optional[float] = None

class ChatRequest(BaseModel):
    message: str

class RegisterRequest(BaseModel):
    email: str
    password: str
    fcm_token: Optional[str] = None
    home_latitude: Optional[float] = None
    home_longitude: Optional[float] = None

class LoginRequest(BaseModel):
    email: str
    password: str

security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        decoded_token = fa_auth.verify_id_token(credentials.credentials)
        return decoded_token
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {str(e)}")

@app.get("/")
async def root():
    return {"message": "Welcome to the Flood Alert System API. Services are running!"}

@app.post("/api/risk")
async def get_risk(request: LocationRequest):
    loc_key = request.location.lower().strip()
    if loc_key in RISK_CACHE:
        cached_data = RISK_CACHE[loc_key]
        if datetime.now(timezone.utc) - cached_data["timestamp"] < timedelta(minutes=CACHE_EXPIRATION_MINUTES):
            return {
                "location": request.location, 
                "primary_hazard": cached_data["primary_hazard"],
                "risk_level": cached_data["risk_level"], 
                "explanation": cached_data["explanation"],
                "weather_data_used": cached_data["weather_data_used"],
                "cached": True
            }
    
    live_weather_data = await get_real_weather(request.location, lat=request.lat, lon=request.lon)
    primary_hazard, risk_level, explanation = await check_hazard_risk(request.location, live_weather_data)
    
    RISK_CACHE[loc_key] = {
        "primary_hazard": primary_hazard,
        "risk_level": risk_level,
        "explanation": explanation,
        "weather_data_used": live_weather_data,
        "timestamp": datetime.now(timezone.utc)
    }
    
    return {
        "location": request.location, 
        "primary_hazard": primary_hazard,
        "risk_level": risk_level, 
        "explanation": explanation,
        "weather_data_used": live_weather_data,
        "cached": False
    }

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """
    Ask emergency chatbot questions like "What should I do during flood?" (Streamed)
    """
    return StreamingResponse(get_chatbot_stream(request.message), media_type="text/plain")

@app.get("/api/external-hazards", summary="Fetch Real-time External Hazards")
async def get_external_hazards():
    from external_apis import get_all_external_hazards
    events = await get_all_external_hazards()
    return events

@app.post("/api/report")
async def report_hazard(
    location: str = Form(...), 
    latitude: float = Form(...),
    longitude: float = Form(...),
    image: UploadFile = File(...)
):
    if not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File provided is not an image.")
    image_bytes = await image.read()
    hazard, severity, analysis, confidence = await analyze_hazard_image(image_bytes, location, image.content_type)
    
    parsed_conf = 100
    try:
        conf_str = confidence.replace("%", "").strip()
        if conf_str.isdigit():
            parsed_conf = int(conf_str)
    except Exception: pass
        
    if parsed_conf < 70 and "high" in severity.lower():
        severity = "Medium"
        analysis += "\n\n\u26a0\ufe0f **System Note:** Severity downgraded due to low confidence."
        
    if hazard.lower() != "none" and "high" in severity.lower():
        evac_data = await get_evacuation_plan(latitude, longitude, hazard)
        instruction = evac_data.get("instruction", "Please evacuate.")
        analysis += f"\n\n\ud83d\udea8 **Actionable Evacuation Plan:** {instruction}"
        evacuation_target = {"name": evac_data.get("safe_zone_name"), "lat": evac_data.get("lat"), "lon": evac_data.get("lon")}
    else:
        evacuation_target = None
    
    db = get_db()
    if db:
        try:
            db.collection("reports").add({
                "location": location, "latitude": latitude, "longitude": longitude,
                "hazard": hazard, "severity": severity, "analysis": analysis,
                "timestamp": datetime.now(timezone.utc)
            })
        except Exception as e: logger.error(f"Firestore Error: {e}")

    return {
        "location": location, "hazard": hazard, "severity": severity,
        "confidence": confidence, "analysis": analysis, "evacuation_target": evacuation_target
    }

@app.post("/api/auth/register")
async def register(request: RegisterRequest):
    try:
        user = firebase_auth.create_user(email=request.email, password=request.password)
        db = get_db()
        if db:
            db.collection("users").document(user.uid).set({
                "email": request.email, "fcm_token": request.fcm_token,
                "home_latitude": request.home_latitude, "home_longitude": request.home_longitude
            })
        return {"message": "User registered successfully", "uid": user.uid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/auth/me")
async def get_me(token: dict = Depends(verify_token)):
    return {"uid": token.get("uid"), "email": token.get("email")}

def is_relevant_disaster_news(text: str) -> bool:
    """
    Checks if the news text is related to a natural disaster or emergency event.
    """
    keywords = [
        "flood", "disaster", "storm", "rain", "emergency", "monsoon", 
        "banjir", "hujan", "kilat", "tsunami", "earthquake", "gempa", 
        "landslide", "runtuh", "weather", "cuaca", "hazard", "nadma", "metmalaysia"
    ]
    text_lower = text.lower()
    return any(k in text_lower for k in keywords)

@app.get("/api/news", summary="Tactical Malaysia-Only News Feed")
async def get_news_feed():
    import httpx
    from hashlib import md5
    import xml.etree.ElementTree as ET
    
    met_malaysia_url = "https://api.data.gov.my/weather/warning"
    bernama_url = "https://bernama.com/en/rssfeed.php"
    headers = {"User-Agent": "flood-alert-system/1.0"}
    
    live_items = []
    db = get_db()

    async with httpx.AsyncClient() as client:
        # 1. FETCH MET MALAYSIA WARNINGS (OFFICIAL)
        try:
            res_met = await client.get(met_malaysia_url, timeout=5.0)
            if res_met.status_code == 200:
                data = res_met.json()
                warnings = data if isinstance(data, list) else [data]
                for w in warnings:
                    title = w.get("warning_issue", {}).get("title_en", "Weather Warning")
                    text = w.get("heading_en", "Active Warning")
                    issued = w.get("warning_issue", {}).get("issued", "")
                    item_id = md5(f"met_{issued}_{title}".encode()).hexdigest()
                    
                    live_items.append({
                        "id": item_id,
                        "time": "MET MALAYSIA",
                        "text": f"{title}: {text}",
                        "url": "https://www.met.gov.my",
                        "tag": "OFFICIAL ALERT",
                        "tagColor": "var(--accent-red)",
                        "timestamp": datetime.now(timezone.utc)
                    })
        except Exception as e:
            logger.error(f"MetMalaysia Fetch failed: {e}")

        # 2. FETCH BERNAMA (MALAYSIAN LOCAL)
        try:
            res_my = await client.get(bernama_url, headers=headers, timeout=5.0)
            if res_my.status_code == 200:
                root = ET.fromstring(res_my.content)
                items = root.findall(".//item")
                for item in items:
                    title = item.find("title").text if item.find("title") is not None else "Local Update"
                    link = item.find("link").text if item.find("link") is not None else "#"
                    
                    if is_relevant_disaster_news(title):
                        secure_link = link.replace("http://", "https://")
                        live_items.append({
                            "id": md5(secure_link.encode()).hexdigest(),
                            "time": "MALAYSIA NEWS",
                            "text": title,
                            "url": secure_link,
                            "tag": "MY: BERNAMA",
                            "tagColor": "var(--accent-cyan)",
                            "timestamp": datetime.now(timezone.utc)
                        })
        except Exception as e:
            logger.error(f"Bernama Fetch failed: {e}")

    if db:
        try:
            batch = db.batch()
            for item in live_items:
                if item["url"] != "#":
                    batch.set(db.collection("news_archive").document(item["id"]), {
                        "text": item["text"], "url": item["url"], "tag": item["tag"], "tagColor": item["tagColor"],
                        "timestamp": item["timestamp"], "source": "RSS_AUTO"
                    }, merge=True)
            batch.commit()
        except Exception: pass

    try:
        if db:
            docs = db.collection("news_archive").order_by("timestamp", direction="DESCENDING").limit(12).stream()
            archived = []
            for doc in docs:
                d = doc.to_dict()
                ts = d.get("timestamp")
                diff = datetime.now(timezone.utc) - ts if ts else None
                time_str = f"{diff.days}D AGO" if diff and diff.days > 0 else "RECENT"
                archived.append({"time": time_str, "text": d.get("text"), "url": d.get("url"), "tag": d.get("tag"), "tagColor": d.get("tagColor")})
            return archived if archived else live_items
    except Exception: pass
    
    return live_items if live_items else [{"time": "OFFLINE", "text": "Disaster feeds temporarily unavailable.", "url": "#", "tag": "SYSTEM", "tagColor": "var(--accent-gray)"}]

@app.get("/api/advisory")
async def get_strategic_advisory(lang: str = "en"):
    db = get_db()
    if not db:
        return {"advisory": "Strategic advisory offline." if lang == "en" else "Penasihat strategik luar talian."}

    try:
        docs = db.collection("news_archive").order_by("timestamp", direction="DESCENDING").limit(10).stream()
        news_items = [{"text": d.to_dict().get("text"), "tag": d.to_dict().get("tag")} for d in docs]
        
        if not news_items:
            return {"advisory": "No active intelligence reports found." if lang == "en" else "Tiada laporan perisikan ditemui."}

        advisory_text = await get_strategic_advisory_text(news_items, lang)
        return {"advisory": advisory_text}
    except Exception as e:
        logger.error(f"Advisory Generation Failed: {e}")
        return {"advisory": "Strategic advisory triage failed." if lang == "en" else "Gagal triaj strategik."}

if __name__ == "__main__":
    import uvicorn
    import os
    # Cloud Run dynamically assigns a port via the PORT environment variable.
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)

