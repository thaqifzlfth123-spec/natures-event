from typing import Dict, Any

# Shared in-memory cache for hazard risks
# In a production environment, this should be replaced with Redis.
RISK_CACHE: Dict[str, Any] = {}
CACHE_EXPIRATION_MINUTES = 10
