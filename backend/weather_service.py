import os
import httpx
from dotenv import load_dotenv # type: ignore

async def get_real_weather(location: str):
    """
    Fetches real-time weather data for a given location using WeatherAPI.com.
    Returns a formatted string describing the current weather and rainfall.
    """
    # Force reload of variables from .env to bypass uvicorn's parent-process cache
    load_dotenv(override=True)
    WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")

    if not WEATHER_API_KEY or WEATHER_API_KEY.strip() == "":
        # Fallback if the user hasn't set their key yet
        return f"Mocked Data (No WEATHER_API_KEY found in .env): Heavy rainfall expected, 50mm in the next 2 hours."

    url = f"http://api.weatherapi.com/v1/current.json?key={WEATHER_API_KEY}&q={location}&aqi=no"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            
            if response.status_code == 200:
                data = response.json()
                condition = data["current"]["condition"]["text"]
                precip_mm = data["current"]["precip_mm"]
                humidity = data["current"]["humidity"]
                temp_c = data["current"]["temp_c"]
                wind_kph = data["current"]["wind_kph"]
                uv_index = data["current"]["uv"]
                
                # Fetch exact location name from the API to stop AI hallucinations
                actual_name = data["location"]["name"]
                actual_region = data["location"]["region"]
                
                # Format exactly what the AI needs to predict multiple hazard risks
                weather_summary = (
                    f"[CONFIRMED LOCATION: {actual_name}, {actual_region}] "
                    f"Current condition: {condition}. "
                    f"Temperature: {temp_c} C. "
                    f"Precipitation (Rainfall): {precip_mm}mm. "
                    f"Humidity: {humidity}%. "
                    f"Wind Speed: {wind_kph} kph. "
                    f"UV Index: {uv_index}."
                )
                return weather_summary
            else:
                return f"Error fetching weather: {response.status_code}"
                
    except Exception as e:
        return f"Failed to connect to weather service: {str(e)}"
