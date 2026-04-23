export function getDistance(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return Infinity;
  const p1 = parseFloat(lat1);
  const p2 = parseFloat(lon1);
  const p3 = parseFloat(lat2);
  const p4 = parseFloat(lon2);
  if (isNaN(p1) || isNaN(p2) || isNaN(p3) || isNaN(p4)) return Infinity;

  const R = 6371; // Earth's radius in km
  const dLat = (p3 - p1) * Math.PI / 180;
  const dLon = (p4 - p2) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1 * Math.PI / 180) * Math.cos(p3 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
