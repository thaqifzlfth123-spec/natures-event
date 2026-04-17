from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends # type: ignore
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel # pyright: ignore[reportMissingImports]
from ai_service import check_hazard_risk, get_chatbot_response, analyze_hazard_image, get_evacuation_plan
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
    description="Backend for the Flood Alert App powered by FastAPI with Hybrid AI (Groq + Google Gemini)",
    version="2.0.0"
)

# --- CACHE & DATA REFRESH SYSTEM ---
RISK_CACHE: Dict[str, Any] = {}
CACHE_EXPIRATION_MINUTES = 10

async def background_refresh_cache():
    """
    Cron Job: Runs every 10 minutes in the background.
    Refreshes the weather/AI risk for all previously searched locations to keep the cache fully updated.
    """
    while True:
        await asyncio.sleep(600)  # Wait 10 minutes
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
                logger.info(f"[CRON] Successfully refreshed {location}")
            except Exception as e:
                logger.error(f"[CRON] Failed to refresh {location}: {e}")

@app.on_event("startup")
async def startup_event():
    # Start the background cron job when the server boots up
    asyncio.create_task(background_refresh_cache())
# -----------------------------------

# Allow CORS for frontend integration (React/Flutter)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to your actual frontend domain, (https://something.vercel.app)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic Models for Request validation
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

# Security scheme for expecting Bearer tokens from the Frontend
security = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Validates the Firebase ID Token sent by the frontend's login.
    """
    try:
        decoded_token = fa_auth.verify_id_token(credentials.credentials)
        return decoded_token
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {str(e)}")

@app.get("/")
async def root():
    return {"message": "Welcome to the Flood Alert System API. Services are running!"}

@app.post("/api/risk", summary="1. Hazard Risk Checker") #/api/risk
async def get_risk(request: LocationRequest):
    """
    User enters location. System checks the Cache first. If missing/old, fetches live weather 
    and returns the Primary Hazard, Risk Level, and AI explanation.
    """
    loc_key = request.location.lower().strip()
    
    # 1. CHECK CACHE FIRST (The Data Refresh System)
    if loc_key in RISK_CACHE:
        cached_data = RISK_CACHE[loc_key]
        time_diff = datetime.now(timezone.utc) - cached_data["timestamp"]
        
        if time_diff < timedelta(minutes=CACHE_EXPIRATION_MINUTES):
            logger.info(f"[CACHE HIT] Instantly returning saved data for {loc_key}")
            return {
                "location": request.location, 
                "primary_hazard": cached_data["primary_hazard"],
                "risk_level": cached_data["risk_level"], 
                "explanation": cached_data["explanation"],
                "weather_data_used": cached_data["weather_data_used"],
                "cached": True
            }
            
    logger.info(f"[CACHE MISS] Fetching fresh API data for {loc_key}...")
    
    # 2. FETCH REAL DATA IF NO CACHE
    live_weather_data = await get_real_weather(request.location, lat=request.lat, lon=request.lon)
    primary_hazard, risk_level, explanation = await check_hazard_risk(request.location, live_weather_data)
    
    # 3. SAVE TO CACHE FOR NEXT 10 MINUTES
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

@app.post("/api/chat", summary="4. Emergency Chatbot") #/api/chat
async def chat(request: ChatRequest):
    """
    Ask emergency chatbot questions like "What should I do during flood?"
    """
    response = await get_chatbot_response(request.message)
    return {"message": request.message, "response": response}

@app.post("/api/report", summary=" Report Hazard Incident") #/api/report
async def report_hazard(
    location: str = Form(...), 
    latitude: float = Form(...),
    longitude: float = Form(...),
    image: UploadFile = File(...)
):
    """
    User uploads an image of an emergency event. AI analyzes hazard type and its severity.
    If severity is High, triggers Push Notification alerts to nearby users!
    """
    if not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File provided is not an image.")
        
    image_bytes = await image.read()
    hazard, severity, analysis, confidence = await analyze_hazard_image(image_bytes, location, image.content_type)
    
    # --- INTELLIGENCE LAYER (CONFIDENCE FAIL-SAFE) ---
    parsed_conf = 100
    try:
        conf_str = confidence.replace("%", "").strip()
        if conf_str.isdigit():
            parsed_conf = int(conf_str)
    except Exception as e:
        logger.warning(f"Failed to parse confidence value '{confidence}': {e}")
        
    if parsed_conf < 70 and "high" in severity.lower():
        severity = "Medium"
        analysis += "\n\n⚠️ **System Note:** Severity automatically downgraded from High to Medium due to low AI confidence (<70%)."
        logger.warning(f"Downgraded severity to Medium for {location}. Confidence was {parsed_conf}%.")

    # --- AUTONOMOUS AGENTIC WORKFLOW ---
    smart_alert_body = f"A High-severity {hazard} was just reported nearby in {location}."
    
    if hazard.lower() != "none" and "high" in severity.lower():
        # Call the Agent to find the nearest safe zone and draft an evacuation response
        evac_data = await get_evacuation_plan(latitude, longitude, hazard)
        instruction = evac_data.get("instruction", f"Please evacuate to {evac_data.get('safe_zone_name')}")
        smart_alert_body = f"EMERGENCY: {instruction}"
        
        # Append to the AI Analysis so the frontend displays it automatically
        analysis += f"\n\n🚨 **Actionable Evacuation Plan:** {instruction}"
        
        # Add evacuation coordinates for the frontend Map to draw the path
        evacuation_target = {
            "name": evac_data.get("safe_zone_name"),
            "lat": evac_data.get("lat"),
            "lon": evac_data.get("lon")
        }
    else:
        evacuation_target = None
    
    # Save the report to Firebase Firestore
    db = get_db()
    if db:
        try:
            db.collection("reports").add({
                "location": location, 
                "latitude": latitude,
                "longitude": longitude,
                "hazard": hazard,
                "severity": severity, 
                "confidence": confidence,
                "analysis": analysis,
                "status": "pending_review",
                "timestamp": datetime.now(timezone.utc)
            })
            
            # TRIGGER REAL-TIME FCM PUSH NOTIFICATIONS IF SEVERITY IS HIGH
            if hazard.lower() != "none" and "high" in severity.lower():
                users_ref = db.collection("users").stream()
                for user_doc in users_ref:
                    user_data = user_doc.to_dict()
                    user_lat = user_data.get("home_latitude")
                    user_lon = user_data.get("home_longitude")
                    fcm_token = user_data.get("fcm_token")
                    
                    if user_lat and user_lon and fcm_token:
                        dist = calculate_distance(latitude, longitude, user_lat, user_lon)
                        if dist <= 10.0:  # 10km proximity rule
                            # Send Smart Push Notification
                            message = messaging.Message(
                                notification=messaging.Notification(
                                    title=f"EMERGENCY ALERT: {hazard}",
                                    body=smart_alert_body
                                ),
                                token=fcm_token,
                            )
                            try:
                                messaging.send(message)
                                logger.info(f"Sent 10km Push Notification to user {user_doc.id}")
                            except Exception as e:
                                logger.error(f"Error sending FCM to {user_doc.id}: {e}")

        except Exception as e:
            logger.error(f"Error saving to Firestore: {e}")

    return {
        "location": location, 
        "hazard": hazard,
        "severity": severity,
        "confidence": confidence,
        "analysis": analysis,
        "evacuation_target": evacuation_target
    }

@app.post("/api/auth/register", summary="Register a New User")
async def register(request: RegisterRequest):
    """
    Register a user using Firebase Authentication.
    Saves their email and password to Identity Toolkit.
    """
    try:
        user = firebase_auth.create_user(
            email=request.email,
            password=request.password
        )
        # Optionally, save user profile in Firestore
        db = get_db()
        if db:
            db.collection("users").document(user.uid).set({
                "email": request.email,
                "role": "user",
                "fcm_token": request.fcm_token,
                "home_latitude": request.home_latitude,
                "home_longitude": request.home_longitude
            })
        return {"message": "User registered successfully", "uid": user.uid}
    except fa_auth.EmailAlreadyExistsError:
        raise HTTPException(status_code=400, detail="Email already exists.")
    except FirebaseError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auth/login", summary="Login Placeholder")
async def login(request: LoginRequest):
    """
    Note: Firebase 'Login' (verifying email/pwd and getting an ID Token) 
    is natively meant to be done on the Client-side (Streamlit/React) using the Firebase SDK.
    The backend usually just receives the ID Token and verifies it using `firebase_admin.auth.verify_id_token()`.
    
    Alternatively, through the backend, you can use the Identity Toolkit REST API
    using an API key. For now, this is a placeholder.
    """
    return {"message": "In Firebase, Login is handled by the frontend which sends the Token here. See comments for details."}


@app.get("/api/auth/me", summary="Check Verified User (Protected Route)")
async def get_me(token: dict = Depends(verify_token)):
    """
    This endpoint is protected! It requires a valid Firebase Bearer token.
    You can use this to get the user's ID securely.
    """
    return {
        "message": "You are securely authenticated!", 
        "uid": token.get("uid"), 
        "email": token.get("email")
    }

@app.get("/api/news", summary="Hybrid AI News Feed (Archived & Real-time)")
async def get_news_feed():
    import httpx
    import xml.etree.ElementTree as ET
    from hashlib import md5
    
    gdacs_url = "https://www.gdacs.org/xml/rss.xml"
    bernama_url = "https://bernama.com/en/rssfeed.php"
    headers = {"User-Agent": "flood-alert-system/1.0"}
    
    live_items = []
    db = get_db()

    async with httpx.AsyncClient() as client:
        # 1. FETCH BERNAMA (MALAYSIAN LOCAL)
        try:
            res_my = await client.get(bernama_url, headers=headers, timeout=5.0)
            if res_my.status_code == 200:
                root = ET.fromstring(res_my.content)
                items = root.findall(".//item")
                for item in items[:6]:
                    title = item.find("title").text if item.find("title") is not None else "Local Update"
                    link = item.find("link").text if item.find("link") is not None else "#"
                    # Include current timestamp for fresh items
                    live_items.append({
                        "id": md5(link.encode()).hexdigest(),
                        "time": "MALAYSIA NEWS",
                        "text": title,
                        "url": link,
                        "tag": "MY: BERNAMA",
                        "tagColor": "var(--accent-cyan)",
                        "timestamp": datetime.now(timezone.utc)
                    })
        except Exception as e:
            logger.error(f"Bernama Fetch failed: {e}")

        # 2. FETCH GDACS (GLOBAL DISASTER ALERTS)
        try:
            res_intl = await client.get(gdacs_url, headers=headers, timeout=5.0)
            if res_intl.status_code == 200:
                root = ET.fromstring(res_intl.content)
                items = root.findall(".//item")
                for item in items[:6]:
                    title = item.find("title").text if item.find("title") is not None else "Global Alert"
                    link = item.find("link").text if item.find("link") is not None else "#"
                    clean_title = title.replace("Green ", "").replace("Orange ", "🚨 ").replace("Red ", "🔥 ")
                    live_items.append({
                        "id": md5(link.encode()).hexdigest(),
                        "time": "INTERNATIONAL",
                        "text": clean_title,
                        "url": link,
                        "tag": "GLOBAL ALERT",
                        "tagColor": "var(--accent-red)",
                        "timestamp": datetime.now(timezone.utc)
                    })
        except Exception as e:
            logger.error(f"GDACS Fetch failed: {e}")

    # 3. ARCHIVE TO FIRESTORE (DE-DUPLICATED)
    if db:
        try:
            batch = db.batch()
            for item in live_items:
                doc_ref = db.collection("news_archive").document(item["id"])
                # Only save if URL is valid
                if item["url"] != "#":
                    # We use set with merge=True to update timestamp but keep old ones if needed
                    batch.set(doc_ref, {
                        "text": item["text"],
                        "url": item["url"],
                        "tag": item["tag"],
                        "tagColor": item["tagColor"],
                        "timestamp": item["timestamp"],
                        "source": "RSS_AUTO"
                    }, merge=True)
            batch.commit()
        except Exception as e:
            logger.error(f"Firestore Archive Failed: {e}")

    # 4. RETRIEVE BEST DATA (ARCHIVE-FIRST)
    try:
        if db:
            # Query the archive for the top 12 most recent items across history
            archive_ref = db.collection("news_archive").order_by("timestamp", direction="DESCENDING").limit(12).stream()
            archived_items = []
            for doc in archive_ref:
                d = doc.to_dict()
                # Format time string for UI (e.g. 2 DAYS AGO if old)
                ts = d.get("timestamp")
                time_str = "LIVE DATA"
                if ts:
                    diff = datetime.now(timezone.utc) - ts
                    if diff > timedelta(hours=24):
                        time_str = f"{diff.days} DAYS AGO"
                    elif diff > timedelta(hours=1):
                        time_str = f"{int(diff.seconds // 3600)}H AGO"
                    else:
                        time_str = "RECENT"
                
                archived_items.append({
                    "time": time_str,
                    "text": d.get("text"),
                    "url": d.get("url"),
                    "tag": d.get("tag"),
                    "tagColor": d.get("tagColor")
                })
            
            if archived_items:
                return archived_items
    except Exception as e:
        logger.error(f"Archive Retrieval Failed: {e}")

    # Fallback to live items if DB fails
    return live_items if live_items else [{"time": "OFFLINE", "text": "Disaster feeds temporarily unavailable.", "url": "#", "tag": "SYSTEM", "tagColor": "var(--accent-gray)"}]

@app.get("/api/advisory")
async def get_strategic_advisory(lang: str = "en"):
    """
    TACTICAL SITREP ENGINE:
    Generates a mission-briefing summary based on the latest 10 news items in the archive.
    Uses Gemini AI to consolidate data into a strategic situation report.
    """
    if not db:
        return {"advisory": "Strategic advisory offline. Database connection required." if lang == "en" else "Penasihat strategik luar talian. Sambungan pangkalan data diperlukan."}

    try:
        # Fetch the last 10 news items for context
        docs = db.collection("news_archive").order_by("timestamp", direction="DESCENDING").limit(10).stream()
        news_context = []
        for doc in docs:
            d = doc.to_dict()
            news_context.append(f"- {d.get('text')} ({d.get('tag')})")
        
        if not news_context:
            return {"advisory": "Intelligence channels quiet. No immediate strategic threats identified." if lang == "en" else "Saluran perisikan tenang. Tiada ancaman strategik dikesan."}

        context_str = "\n".join(news_context)
        prompt = f"""
        ACT AS: A National Disaster Intelligence Officer (NADMA Malaysia).
        TASK: Provide a high-density Strategic Situation Report (SITREP) based on these news items:
        
        {context_str}
        
        REQUIREMENTS:
        1. Keep it under 150 words.
        2. Use professional, tactical tone.
        3. Identify priority regions and response actions.
        4. Language: {'English' if lang == 'en' else 'Bahasa Melayu'}.
        5. DO NOT use emojis. Format as plain tactical text.
        """
        
        model = genai.GenerativeModel('gemini-1.5-flash')
        response = model.generate_content(prompt)
        
        return {"advisory": response.text.strip()}
    except Exception as e:
        logger.error(f"Advisory Generation Failed: {e}")
        return {"advisory": "Strategic triage error. Intelligence processing interrupted." if lang == "en" else "Ralat triaj strategik. Pemprosesan perisikan terganggu."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
