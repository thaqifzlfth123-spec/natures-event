# Guardian Platform: Full-Stack Walkthrough

The **Guardian Upgrade** transforms the Flood Alert System into a production-grade tactical intelligence platform. This document walkthrough clarifies the new features and the underlying technology stack.

## 📱 Mobile-First Tactical Design
The UI now adapts perfectly to tablets and smartphones.
- **Retractable Drawers**: On screens under 1024px, side panels (Sensor Grid, AI Chatbot, etc.) are hidden to prioritize the map.
- **Tactical Controls**: Use the new Header icons:
  - `☰` (Tactical Menu): Access sensors and risk gauges.
  - `📡` (Data Feed): Access the AI Chatbot and Alert Summaries.
  - `⚙️` (Settings): Manage theme and authentication.

## 🛰️ Real-Time Intelligence Stream
We have replaced all mock data with a live **Cloud Firestore** backbone.
- **Live Sync**: Every report submitted is broadcast to all users instantly.
- **Report Mode**: Click the **REPORT** button on the map to enter tactical data entry mode. Click anywhere on the map to mark a location and submit coordinates directly to the global database.

## 🤖 Triple-Safe AI Architecture
Ensuring 100% uptime for critical disaster decisions.
1. **Primary**: Vertex AI (Gemini 2.5 Flash) — Consumes your $300 GCP Credits.
2. **Secondary**: AI Studio (Gemini 1.5 Flash) — Automatic API key fallback.
3. **Tertiary**: Groq AI (Llama 3.3) — Final safety net for connection resiliency.

## 📍 Tactical Iconography
The map now supports a wider range of incident types:
- 🔵 **Shelter (Blue)**: Safe zones and evacuation centers.
- 🔴 **Medical (Red)**: Emergency medical situations.
- 🟡 **Monsoon (Gold)**: Storm and wind advisories.
- 🟣 **Wildfire (Purple)**: Fire hotspots.
- 🟢 **Station (Green)**: Active weather monitoring stations.

---

### 🛡️ Verification Steps
To verify everything is working perfectly:
1. Run `python backend/test_full_ai.py` to see the **Vertex AI** success logs.
2. Open the website on your phone to test the **Retractable Drawers**.
3. Use **Report Mode** to drop a pin on the map and watch it appear in your Firebase Console.

> [!IMPORTANT]
> Your **GCP Project ID** `flood-risk-f3fae` is now fully linked and active. Monitor your billing at [console.cloud.google.com/billing](https://console.cloud.google.com/billing).
