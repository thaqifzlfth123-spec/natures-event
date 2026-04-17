import os
import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timedelta, timezone
from hashlib import md5

# Initialize Firestore
cred_path = os.getenv("FIREBASE_SERVICE_ACCOUNT", "backend/firebase-service-account.json")
if not os.path.exists(cred_path):
    # Fallback for when running from within backend folder
    cred_path = "firebase-service-account.json"

if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

def seed_news():
    print("Seeding Tactical News Archive...")
    
    historical_news = [
        {
            "text": "Bernama: NADMA issues flood warning for East Coast states due to expected monsoon surge.",
            "url": "https://bernama.com/en/news.php?id=234561",
            "tag": "MY: BERNAMA",
            "tagColor": "var(--accent-cyan)",
            "days_ago": 1
        },
        {
            "text": "GDACS: Red Alert for Tropical Cyclone affecting Southeast Asia region. High impact expected.",
            "url": "https://www.gdacs.org/report.aspx?eventid=1000",
            "tag": "GLOBAL ALERT",
            "tagColor": "var(--accent-red)",
            "days_ago": 2
        },
        {
            "text": "Bernama: Rainfall exceeds 200mm in Terengganu; residents advised to prepare for evacuation.",
            "url": "https://bernama.com/en/news.php?id=234562",
            "tag": "MY: BERNAMA",
            "tagColor": "var(--accent-cyan)",
            "days_ago": 3
        },
        {
            "text": "Bernama: Smart Tunnel in Kuala Lumpur activated to mitigate flash flood risks in city center.",
            "url": "https://bernama.com/en/news.php?id=234563",
            "tag": "MY: BERNAMA",
            "tagColor": "var(--accent-cyan)",
            "days_ago": 5
        },
        {
            "text": "GDACS: Earthquake of magnitude 6.2 reported near Sumatra, Indonesia. Felt in West Coast Malaysia.",
            "url": "https://www.gdacs.org/report.aspx?eventid=1001",
            "tag": "GLOBAL ALERT",
            "tagColor": "var(--accent-red)",
            "days_ago": 7
        },
        {
            "text": "Bernama: MET Malaysia predicts prolonged heavy rain for Johor and Melaka over the weekend.",
            "url": "https://bernama.com/en/news.php?id=234564",
            "tag": "MY: BERNAMA",
            "tagColor": "var(--accent-cyan)",
            "days_ago": 10
        },
        {
            "text": "Bernama: Government allocates extra RM500m for permanent flood relief infrastructure in Kelantan.",
            "url": "https://bernama.com/en/news.php?id=234565",
            "tag": "MY: BERNAMA",
            "tagColor": "var(--accent-cyan)",
            "days_ago": 14
        }
    ]

    batch = db.batch()
    for item in historical_news:
        item_id = md5(item["url"].encode()).hexdigest()
        doc_ref = db.collection("news_archive").document(item_id)
        
        # Calculate historical timestamp
        ts = datetime.now(timezone.utc) - timedelta(days=item["days_ago"])
        
        batch.set(doc_ref, {
            "text": item["text"],
            "url": item["url"],
            "tag": item["tag"],
            "tagColor": item["tagColor"],
            "timestamp": ts,
            "source": "MANUAL_SEED"
        }, merge=True)

    batch.commit()
    print("Tactical News Seeded Successfully!")

if __name__ == "__main__":
    seed_news()
