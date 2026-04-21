from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import logging
from datetime import datetime, timezone
from weather_service import get_real_weather
from ai_service import check_hazard_risk
from cache import RISK_CACHE, CACHE_EXPIRATION_MINUTES
from routers import auth, risk, news, chat

# Logging configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI App
app = FastAPI(
    title="Flood Alert System Backend (Modular)",
    description="Refactored modular backend for the Guardian App using Vertex AI Gemini",
    version="2.1.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "https://natures-event-zeta.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- BACKGROUND REFRESH SYSTEM ---
async def background_refresh_cache():
    """Periodically refreshes weather data in the shared RISK_CACHE."""
    while True:
        await asyncio.sleep(600)  # Every 10 minutes
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

# --- ROUTER REGISTRATION ---
app.include_router(auth.router)
app.include_router(risk.router)
app.include_router(news.router)
app.include_router(chat.router)

@app.get("/")
async def root():
    return {
        "message": "Guardian Tactical Backend is online.",
        "version": "2.1.0",
        "status": "Operational"
    }

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
