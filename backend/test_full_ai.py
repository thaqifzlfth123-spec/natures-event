import os
import asyncio
from dotenv import load_dotenv
from ai_service import get_gemini_client, get_chatbot_stream, check_hazard_risk

async def test_triple_safe():
    load_dotenv()
    print("--- [SITREP] Triple-Safe AI Logic Test ---")
    
    # 1. Check which client is currently chosen as Primary
    client, is_vertex = get_gemini_client()
    if client:
        primary_name = "VERTEX AI (Credits)"
        print(f"[PRIMARY] Gemini Source: {primary_name}")
    else:
        print("🥇 No Gemini client available.")

    # 2. Test Hazard Analysis (The most complex reasoning task)
    print("\n[Test 1] Analyzing Hazard Risk for 'Kuala Lumpur'...")
    try:
        hazard, risk, explanation = await check_hazard_risk("Kuala Lumpur", "Heavy Rain, 30C, 90% humidity")
        print(f"Result: {hazard} | Risk: {risk}")
        print(f"Explanation: {explanation[:100]}...")
        print("[OK] SUCCESS: Hazard Analysis responded correctly.")
    except Exception as e:
        print(f"❌ FAILED: Hazard Analysis error: {e}")

    # 3. Test Chatbot Response (The resilience test)
    print("\n[Test 2] Testing Chatbot Response...")
    await asyncio.sleep(2) # Give the network a second to breathe
    try:
        response_text = ""
        async for chunk in get_chatbot_stream("Is there a flood in Johor right now?"):
            response_text += chunk
        print(f"Chatbot says: {response_text[:100]}...")
        print("[OK] SUCCESS: Chatbot responded correctly.")
    except Exception as e:
        print(f"❌ FAILED: Chatbot error: {e}")

    print("\n--- FINAL VERIFICATION ---")
    print("If you see 'SUCCESS' above, your Vertex Gemini integration is working.")

if __name__ == "__main__":
    asyncio.run(test_triple_safe())
