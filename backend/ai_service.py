import os
import base64
from groq import AsyncGroq # pyright: ignore[reportMissingImports]
from dotenv import load_dotenv # type: ignore

load_dotenv()

# Initialize the new Async Groq Client
api_key = os.getenv("GROQ_API_KEY")

# The Groq library automatically picks up GROQ_API_KEY from the environment,
# but we explicitly pass it here just in case.
client = AsyncGroq(api_key=api_key) if api_key else None

async def check_hazard_risk(location: str, weather_data: str):
    if not client:
        return "None", "High", "Mocked response (No GROQ_API_KEY): High risk due to simulated extreme conditions."
        
    try:
        prompt = f"""
        Given the location {location} and current weather: {weather_data},
        determine the primary natural hazard risk (e.g., Flood, Heatwave, Drought, Storm, Wildfire, or None)
        and the overall risk level (Low, Medium, High). 
        * Note: For Wildfire risk, emulate the MET Malaysia FDRS (Fire Danger Rating System) by carefully analyzing if the temperature is high, humidity is very low, and winds are strong. Explain briefly.

        Format:
        Hazard: <hazard_type>
        Risk: <level>
        Explanation: <text>
        """

        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )

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
        return "Unknown", f"Error connecting to AI: {str(e)}"

async def get_chatbot_response(message: str):
    if not client:
        return "Mocked response (No GROQ_API_KEY set in .env): Head to higher ground immediately and listen to local authorities."
        
    try:
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a National Emergency Assistant specifically for users in Malaysia. Always provide Malaysian emergency numbers (e.g., 999 for Police/Ambulance, 994 for Fire and Rescue/Bomba, and NADMA) and tailor all advice to the Malaysian context for ANY natural disaster (Flood, Fire, Storm, etc). Provide helpful, concise safety advice."},
                {"role": "user", "content": message}
            ],
            temperature=0.7,
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Error: {str(e)}"

async def analyze_hazard_image(image_bytes: bytes, location: str, content_type: str):
    if not client:
        return "Unknown", "High", f"Mocked analysis (No GROQ_API_KEY set in .env): The reported hazard at {location} appears severe."
        
    try:
        base64_image = base64.b64encode(image_bytes).decode('utf-8')
        
        prompt = f"Analyze this image from {location} for any natural hazards (Flood, Fire, Storm damage, Drought). Return exactly in this format:\nHazard: <hazard_type>\nSeverity: <level>\nAnalysis: <text>"

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

        text = response.choices[0].message.content

        severity = "Unknown"
        hazard = "Unknown"
        analysis = text

        for line in text.split("\n"):
            if "Severity:" in line:
                severity = line.replace("Severity:", "").strip()
            elif "Hazard:" in line:
                hazard = line.replace("Hazard:", "").strip()
            elif "Analysis:" in line:
                analysis = line.replace("Analysis:", "").strip()

        return hazard, severity, analysis

    except Exception as e:
        return "Unknown", "Medium", "Image analysis currently unavailable. Please verify manually."
