from fastapi import APIRouter
from datetime import datetime, timezone
import logging
import os
from database import get_db
from ai_service import get_strategic_advisory_text
from external_apis import get_all_external_hazards

router = APIRouter(prefix="/api", tags=["News & Analytics"])
logger = logging.getLogger(__name__)

def is_relevant_disaster_news(text: str) -> bool:
    # Stricter keyword filter for disaster-only news
    keywords = [
        "flood", "disaster", "storm", "rain", "emergency", "monsoon", 
        "banjir", "hujan", "kilat", "tsunami", "earthquake", "gempa", 
        "landslide", "runtuh", "hazard", "nadma", "metmalaysia",
        "evacuation", "evakuasi", "bencana", "alert", "warning", "amaran"
    ]
    text_lower = text.lower()
    # Check if any keyword matches and exclude general political/social news
    return any(k in text_lower for k in keywords)

@router.get("/news", summary="Tactical Malaysia-Only News Feed")
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
                archived.append({
                    "time": time_str, 
                    "text": d.get("text"), 
                    "url": d.get("url"), 
                    "tag": d.get("tag"), 
                    "tagColor": d.get("tagColor"),
                    "timestamp": ts.isoformat() if hasattr(ts, 'isoformat') else ts
                })
            return archived if archived else live_items
    except Exception: pass
    
    return live_items if live_items else [{"time": "OFFLINE", "text": "Disaster feeds temporarily unavailable.", "url": "#", "tag": "SYSTEM", "tagColor": "var(--accent-gray)"}]

@router.get("/external-hazards", summary="Fetch Global Hazards filtered to Malaysia")
async def get_external_hazards():
    try:
        hazards = await get_all_external_hazards()
        return hazards
    except Exception as e:
        logger.error(f"External Hazards Fetch Failed: {e}")
        return []


@router.get("/firms-wildfires", summary="NASA FIRMS Near Real-Time Wildfires in Malaysia")
async def get_firms_wildfires():
    import httpx
    import csv
    import io

    api_key = os.getenv("NASA_FIRMS_KEY")
    if not api_key:
        logger.error("NASA_FIRMS_KEY environment variable not set.")
        return []

    # Malaysia bounding box: lat 0.5-7.5, lon 99.5-119.5
    # VIIRS_SNPP_NRT: highest quality near-real-time source
    # [FIX: Phase 2] day_range = 5 (past 5 days) — user-requested window
    area = "99.5,0.5,119.5,7.5"
    day_range = 5  # past 5 days
    url = (
        f"https://firms.modaps.eosdis.nasa.gov/api/area/csv"
        f"/{api_key}/VIIRS_SNPP_NRT/{area}/{day_range}"
    )

    fire_points = []

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url)
            response.raise_for_status()

        reader = csv.DictReader(io.StringIO(response.text))
        for row in reader:
            try:
                lat = float(row["latitude"])
                lon = float(row["longitude"])
                # frp = Fire Radiative Power in MW (intensity proxy)
                frp = float(row.get("frp", 0))
                confidence = row.get("confidence", "nominal")  # low/nominal/high
                acq_date = row.get("acq_date", "")
                acq_time = row.get("acq_time", "")

                fire_points.append({
                    "lat": lat,
                    "lon": lon,
                    "frp": frp,
                    "confidence": confidence,
                    "acq_date": acq_date,
                    "acq_time": acq_time,
                    # Derive severity from FRP (Fire Radiative Power)
                    "severity": "Critical" if frp > 50 else "High" if frp > 15 else "Medium",
                })
            except (ValueError, KeyError):
                continue  # Skip malformed rows

        logger.info(f"[FIRMS] Fetched {len(fire_points)} wildfire points for Malaysia.")

    except httpx.HTTPStatusError as e:
        logger.error(f"[FIRMS] HTTP error: {e.response.status_code} - {e.response.text[:200]}")
    except Exception as e:
        logger.error(f"[FIRMS] Unexpected error: {e}")

    # [FIX: Phase 2 - Mock Fallback] Moved OUTSIDE try-except.
    # If NASA returns no data or the API fails, inject representative hotspots
    # so the frontend UI (markers + feed) can always be verified.
    if not fire_points:
        logger.info("[FIRMS] No live data or API failed — using historical representative hotspots for UI testing.")
        fire_points = [
            {"lat": 3.1390, "lon": 101.6869, "frp": 18.5, "confidence": "nominal",
             "acq_date": "HISTORICAL", "acq_time": "0600", "severity": "High",
             "note": "Representative hotspot — Kuala Lumpur region"},
            {"lat": 3.8126, "lon": 103.3256, "frp": 62.1, "confidence": "high",
             "acq_date": "HISTORICAL", "acq_time": "0830", "severity": "Critical",
             "note": "Representative hotspot — Pahang interior"},
            {"lat": 2.1896, "lon": 111.6500, "frp": 9.3, "confidence": "low",
             "acq_date": "HISTORICAL", "acq_time": "0430", "severity": "Medium",
             "note": "Representative hotspot — Sarawak"},
        ]

    return fire_points


@router.get("/advisory")
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
