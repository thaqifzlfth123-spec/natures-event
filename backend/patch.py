import re
with open(r"c:\Users\M. Thaqif\.gemini\antigravity\scratch\flood-alert-system\backend\main.py", "r", encoding="utf-8") as f:
    text = f.read()

replacement = """@app.get("/api/news", summary="Dynamic AI News Feed (UN ReliefWeb)")
async def get_news_feed():
    import httpx
    url = "https://api.reliefweb.int/v1/reports?appname=flood-alert-system&query[value]=Malaysia+OR+flood+OR+monsoon+OR+disaster&preset=latest&limit=8&profile=list"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=5.0)
            if response.status_code != 200: return []
            data = response.json()
            articles = data.get("data", [])
            news_items = []
            for article in articles:
                title = article.get("fields", {}).get("title", "Unknown Alert")
                news_items.append({"time": "JUST NOW", "text": title, "tag": "GLOBAL ALERT", "tagColor": "var(--accent-red)"})
            return news_items
    except:
        return []"""

text = re.sub(r'@app\.get\("/api/news".*?return \[\]', replacement, text, flags=re.DOTALL)

with open(r"c:\Users\M. Thaqif\.gemini\antigravity\scratch\flood-alert-system\backend\main.py", "w", encoding="utf-8") as f:
    f.write(text)
