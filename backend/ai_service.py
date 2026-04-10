import os
import base64
import httpx
import logging
import asyncio
from groq import AsyncGroq # pyright: ignore[reportMissingImports]
from dotenv import load_dotenv # type: ignore

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize the new Async Groq Client
api_key = os.getenv("GROQ_API_KEY")

# The Groq library automatically picks up GROQ_API_KEY from the environment,
# but we explicitly pass it here just in case.
client = AsyncGroq(api_key=api_key) if api_key else None

async def get_evacuation_plan(lat: float, lon: float, hazard: str) -> str:
    if not client:
        return "Please move to higher ground and seek the nearest hospital or police station."
    
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
    
    try:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.post("https://overpass-api.de/api/interpreter", data=query, timeout=5.0)
            data = resp.json()
            if data and "elements" in data and len(data["elements"]) > 0:
                tags = data["elements"][0].get("tags", {})
                safe_zone_name = tags.get("name", "Nearest Safe facility")
    except Exception as e:
        logger.error(f"Overpass API error: {e}")
        
    # Ask LLaMA to draft a smart notification
    prompt = f"There is a High severity {hazard} reported near {lat}, {lon}. We found a safe zone: {safe_zone_name}. Draft a brief, 1-sentence urgent emergency evacuation instruction directed at the user, telling them to evacuate to {safe_zone_name}."
    
    response = None
    for attempt in range(3):
        try:
            response = await client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.5,
            )
            break
        except Exception as e:
            logger.warning(f"Groq API error on evacuation plan attempt {attempt+1}: {e}")
            await asyncio.sleep(2 ** attempt)
            
    if response:
        return response.choices[0].message.content.strip()
    return f"Urgent: {hazard} detected. Please evacuate to {safe_zone_name}."

async def check_hazard_risk(location: str, weather_data: str):
    if not client:
        return "None", "High", "Mocked response (No GROQ_API_KEY): High risk due to simulated extreme conditions."
        
    try:
        prompt = f"""
        Given the location {location} and current weather: {weather_data},
        determine the primary natural hazard risk (e.g., Flood, Heatwave, Drought, Storm, Forest Burning, or None)
        and the overall risk level (Low, Medium, High). 
        * Note: For Forest Burning risk (Wildfire), emulate the MET Malaysia FDRS (Fire Danger Rating System) by carefully analyzing if the temperature is high (>32 C), humidity is very low (<60%), and precipitation is 0mm. Explain the risk factor briefly.
        
        CRITICAL RULE: The weather data contains a [CONFIRMED LOCATION]. You MUST ONLY discuss that exact location name in your explanation. Do NOT hallucinate or assume Kuala Lumpur unless the confirmed location is explicitly Kuala Lumpur. Keep your explanation focused on the confirmed location.

        Format:
        Hazard: <hazard_type>
        Risk: <level>
        Explanation: <text>
        """

        response = None
        for attempt in range(3):
            try:
                response = await client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.7,
                )
                break
            except Exception as e:
                logger.warning(f"Groq API error on hazard risk attempt {attempt+1}: {e}")
                await asyncio.sleep(2 ** attempt)
                
        if not response:
            raise Exception("Failed to connect to AI after 3 attempts.")

        text = response.choices[0].message.content

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

    except Exception as e:
        logger.error(f"Error checking hazard risk: {e}")
        return "Unknown", "Unknown", f"Error connecting to AI: {str(e)}"

async def get_chatbot_response(message: str):
    if not client:
        return "Mocked response (No GROQ_API_KEY set in .env): Head to higher ground immediately and listen to local authorities."
        
    # --- RAG IMPLEMENTATION ---
    # Retrieve the ground-truth context from the knowledge base
    rag_context = ""
    try:
        kb_path = os.path.join(os.path.dirname(__file__), "knowledge_base.txt")
        with open(kb_path, "r", encoding="utf-8") as f:
            rag_context = f.read()
    except Exception as e:
        print(f"RAG Knowledge Base not found or unreadable: {e}")
        
    # --- LIVE SENSOR FUSION ---
    # Quickly check if the user is asking about a specific location
    live_weather_data = "No specific location mentioned, no live radar data pulled."
    try:
        loc_response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "Extract the specific city or location requested in the user's message. Reply ONLY with the location name. If no location is mentioned, reply EXACTLY with the word 'NONE'."},
                {"role": "user", "content": message}
            ],
            temperature=0.0,
        )
        extraction = loc_response.choices[0].message.content.strip()
        if extraction and extraction.upper() != "NONE" and "NONE" not in extraction.upper():
            # Dynamically pull the live weather for the requested location
            from weather_service import get_real_weather
            live_weather_data = await get_real_weather(extraction)
    except Exception as e:
        logger.warning(f"Location extraction sequence failed: {e}")

    system_prompt = f"""You are a National Emergency Assistant for Malaysia. 
    Use the following official NADMA guidelines to answer the user's questions. 
    
    [OFFICIAL GUIDELINES CONTEXT]
    {rag_context}
    [END CONTEXT]
    
    [LIVE SENSOR/WEATHER DATA]
    {live_weather_data}
    * If the user asks if there is a flood/emergency in a location, use this live weather data to answer.
    * If precipitation/rain is low and there is no severe risk, concisely answer NO. DO NOT list emergency numbers or evacuation rules if the area is safe. Just tell them it is currently safe.
    [END SENSOR DATA]
    
    CRITICAL TRANSLATION RULE: You must precisely match the language of the user's prompt. If they speak English, reply strictly in English. If they speak Bahasa Melayu, reply strictly in Bahasa Melayu. Do not cross languages. Provide helpful, concise safety advice."""

    try:
        response = None
        for attempt in range(3):
            try:
                response = await client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": message}
                    ],
                    temperature=0.3, # lower temperature for factual RAG responses
                )
                break
            except Exception as e:
                logger.warning(f"Groq API error on chatbot attempt {attempt+1}: {e}")
                await asyncio.sleep(2 ** attempt)
                
        if not response:
            raise Exception("Failed to connect to AI after 3 attempts.")
            
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"Error in chatbot response: {e}")
        return f"Error: {str(e)}"

async def analyze_hazard_image(image_bytes: bytes, location: str, content_type: str):
    if not client:
        return "Unknown", "High", f"Mocked analysis (No GROQ_API_KEY set in .env): The reported hazard at {location} appears severe.", "100%"
        
    try:
        base64_image = base64.b64encode(image_bytes).decode('utf-8')
        
        prompt = f"Analyze this image from {location} for any natural hazards (Flood, Fire, Storm damage, Drought) and state your estimated detection accuracy as a percentage. Return exactly in this format:\nHazard: <hazard_type>\nSeverity: <level>\nConfidence: <0-100%>\nAnalysis: <text>"

        response = None
        for attempt in range(3):
            try:
                response = await client.chat.completions.create(
                    # Leaving this as a Llama vision model because Gemma has no vision parameters.
                    model="llama-3.2-11b-vision-preview",
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{content_type};base64,{base64_image}",
                                    },
                                },
                            ],
                        }
                    ],
                    temperature=0.5,
                )
                break
            except Exception as e:
                logger.warning(f"Groq API error on image analysis attempt {attempt+1}: {e}")
                await asyncio.sleep(2 ** attempt)
                
        if not response:
            raise Exception("Failed to connect to AI after 3 attempts.")

        text = response.choices[0].message.content

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

    except Exception as e:
        logger.error(f"Error analyzing hazard image: {e}")
        return "Unknown", "Unknown", f"Image analysis failed because the AI encountered a strict error: {str(e)}", "0%"
