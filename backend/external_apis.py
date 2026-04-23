import httpx
import logging
import os
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

# MALAYSIA BOUNDING BOX
# Approx Lat: 0.85 to 7.35
# Approx Lon: 99.6 to 119.3
MIN_LAT = 0.85
MAX_LAT = 7.35
MIN_LON = 99.6
MAX_LON = 119.3

def is_in_malaysia(lat: float, lon: float) -> bool:
    """Filter coordinates to ensure they fall within the Malaysian geographic region."""
    return MIN_LAT <= lat <= MAX_LAT and MIN_LON <= lon <= MAX_LON

async def fetch_metmalaysia() -> List[Dict[str, Any]]:
    """
    MetMalaysia: For local weather forecasts and monsoon warnings.
    Placeholder API fetch setup.
    """
    METMALAYSIA_API_KEY = "YOUR_METMALAYSIA_API_KEY"
    events = []
    # Placeholder logic for when MetMalaysia credentials are added
    # url = f"https://api.met.gov.my/v2.1/data?datasetid=FORECAST&token={METMALAYSIA_API_KEY}"
    # try:
    #     async with httpx.AsyncClient() as client:
    #         resp = await client.get(url, timeout=5.0)
    #         # Parse logic...
    # except Exception as e:
    #     logger.error(f"MetMalaysia Fetch Failed: {e}")
    
    return events

async def fetch_usgs_earthquakes() -> List[Dict[str, Any]]:
    """Fetch recent earthquakes from USGS Earthquake Catalog, filtered to Malaysia."""
    url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson"
    events = []
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                for feature in data.get("features", []):
                    # GeoJSON point: [longitude, latitude, depth]
                    coords = feature["geometry"]["coordinates"]
                    lon, lat = coords[0], coords[1]
                    if is_in_malaysia(lat, lon):
                        props = feature["properties"]
                        events.append({
                            "source": "USGS",
                            "type": "Earthquake",
                            "title": props.get("title", "Earthquake"),
                            "lat": lat,
                            "lon": lon,
                            "mag": props.get("mag"),
                            "time": props.get("time"), # timestamp in ms
                            "url": props.get("url")
                        })
    except Exception as e:
        logger.error(f"USGS Fetch Failed: {e}")
    return events

async def fetch_nasa_eonet() -> List[Dict[str, Any]]:
    """Fetch active global natural events from NASA EONET, filtered to Malaysia."""
    url = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open"
    NASA_API_KEY = os.getenv("NASA_API_KEY", "GnTVGyn2g9ecjg9rNtPyJd8jrSlVJipRytB0cOtR")
    events = []
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params={"api_key": NASA_API_KEY}, timeout=8.0)
            if resp.status_code == 200:
                data = resp.json()
                for event in data.get("events", []):
                    for geo in event.get("geometry", []):
                        if geo.get("type") == "Point":
                            coords = geo.get("coordinates")
                            lon, lat = coords[0], coords[1]
                            if is_in_malaysia(lat, lon):
                                cat_title = event.get("categories", [{}])[0].get("title", "NASA Event")
                                events.append({
                                    "source": "NASA EONET",
                                    "type": cat_title,
                                    "title": event.get("title"),
                                    "lat": lat, "lon": lon,
                                    "time": geo.get("date"),
                                    "url": event.get("sources", [{}])[0].get("url")
                                })
                                break
    except Exception as e:
        logger.error(f"NASA EONET Fetch Failed: {e}")
    return events

async def get_all_external_hazards() -> List[Dict[str, Any]]:
    """Consolidated feed of external API hazards."""
    met = await fetch_metmalaysia()
    usgs = await fetch_usgs_earthquakes()
    nasa = await fetch_nasa_eonet()
    return met + usgs + nasa
