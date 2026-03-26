import math

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculates the Haversine distance in kilometers between two GPS coordinates.
    """
    R = 6371  # Radius of the Earth in km
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    
    a = (math.sin(dLat / 2) * math.sin(dLat / 2) + 
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * 
         math.sin(dLon / 2) * math.sin(dLon / 2))
         
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    distance_in_km = R * c
    
    return distance_in_km
