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
from typing import Optional, Dict, Any

# Initialize FastAPI App
app = FastAPI(
    title="Flood Alert System Backend",
    description="Backend for the Flood Alert App powered by FastAPI and GROQ AI",
    version="1.0.0"
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
        print("[CRON] Refreshing Weather Data Cache...")
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
                print(f"[CRON] Successfully refreshed {location}")
            except Exception as e:
                print(f"[CRON] Failed to refresh {location}: {e}")

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
            print(f"[CACHE HIT] Instantly returning saved data for {loc_key}")
            return {
                "location": request.location, 
                "primary_hazard": cached_data["primary_hazard"],
                "risk_level": cached_data["risk_level"], 
                "explanation": cached_data["explanation"],
                "weather_data_used": cached_data["weather_data_used"],
                "cached": True
            }
            
    print(f"[CACHE MISS] Fetching fresh API data for {loc_key}...")
    
    # 2. FETCH REAL DATA IF NO CACHE
    live_weather_data = await get_real_weather(request.location)
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
    
    # --- AUTONOMOUS AGENTIC WORKFLOW ---
    smart_alert_body = f"A High-severity {hazard} was just reported nearby in {location}."
    
    if hazard.lower() != "none" and "high" in severity.lower():
        # Call the Agent to find the nearest safe zone and draft an evacuation response
        evac_plan = await get_evacuation_plan(latitude, longitude, hazard)
        smart_alert_body = f"EMERGENCY: {evac_plan}"
        
        # Append to the AI Analysis so the frontend displays it automatically
        analysis += f"\n\n🚨 **Actionable Evacuation Plan:** {evac_plan}"
    
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
                                print(f"Sent 10km Push Notification to user {user_doc.id}")
                            except Exception as e:
                                print(f"Error sending FCM to {user_doc.id}: {e}")

        except Exception as e:
            print(f"Error saving to Firestore: {e}")

    return {
        "location": location, 
        "hazard": hazard,
        "severity": severity,
        "confidence": confidence,
        "analysis": analysis
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

