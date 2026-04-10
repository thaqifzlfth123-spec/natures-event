import { useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icons in webpack/vite bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Theme-aligned colors for markers and pulses
const COLORS = {
  earthquake: { name: 'red', hex: '#ff4757' },
  flood: { name: 'cyan', hex: '#00d4ff' },
  monsoon: { name: 'gold', hex: '#d4a843' },
  station: { name: 'green', hex: '#00e676' },
};

// Custom colored marker icons with optional sonar pulse
function createIcon(colorObj, pulse = false) {
  const { name, hex } = colorObj;
  return L.divIcon({
    className: 'custom-marker',
    html: `
      ${pulse ? `<div class="sonar-pulse" style="background: var(--accent-${name}-glow)"></div>` : ''}
      <div style="
        width:14px;height:14px;border-radius:50%;
        background:${hex};border:2px solid rgba(255,255,255,0.8);
        box-shadow:0 0 8px ${hex}, 0 0 16px ${hex}44;
        position: relative; z-index: 2;
      "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

const icons = {
  earthquake: createIcon(COLORS.earthquake),
  flood: createIcon(COLORS.flood),
  monsoon: createIcon(COLORS.monsoon),
  station: createIcon(COLORS.station),
  // Pulse variants for filtered view
  earthquake_pulse: createIcon(COLORS.earthquake, true),
  flood_pulse: createIcon(COLORS.flood, true),
  monsoon_pulse: createIcon(COLORS.monsoon, true),
  station_pulse: createIcon(COLORS.station, true),
  user: L.divIcon({
    className: 'user-marker',
    html: `
      <div class="sonar-pulse"></div>
      <div style="
        width: 24px; height: 24px; 
        background: #00d4ff; 
        border: 3px solid #fff; 
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 0 15px rgba(0, 212, 255, 0.6);
      ">
        <div style="
          width: 8px; height: 8px; 
          background: #fff; 
          border-radius: 50%;
          transform: rotate(45deg);
        "></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  }),
};

// Malaysia-focused disaster pins (sample data)
const markers = [
  { pos: [3.139, 101.6869], type: 'flood',      label: 'Kuala Lumpur — Urban Flooding',          severity: 'High' },
  { pos: [5.4164, 100.3327], type: 'monsoon',    label: 'Penang — Monsoon Warning',               severity: 'Medium' },
  { pos: [1.4927, 103.7414], type: 'flood',      label: 'Johor Bahru — River Overflow Risk',       severity: 'High' },
  { pos: [5.9804, 116.0735], type: 'earthquake', label: 'Kota Kinabalu — Minor Seismic Activity',  severity: 'Low' },
  { pos: [4.5841, 103.4248], type: 'flood',      label: 'Kuantan — Flash Flood Alert',             severity: 'High' },
  { pos: [2.1896, 102.2501], type: 'monsoon',    label: 'Melaka — Heavy Rainfall Advisory',        severity: 'Medium' },
  { pos: [6.1254, 102.2381], type: 'flood',      label: 'Kota Bharu — Kelantan River Surge',       severity: 'High' },
  { pos: [4.2105, 101.9758], type: 'station',    label: 'Cameron Highlands — Weather Station',     severity: 'Active' },
  { pos: [3.8077, 103.326],  type: 'station',    label: 'Cherating — Coastal Monitor',             severity: 'Active' },
  { pos: [2.7456, 101.7072], type: 'flood',      label: 'Shah Alam — Drainage Overflow',           severity: 'Medium' },
];

// Connection arcs between related events
const arcs = [
  { from: [3.139, 101.6869], to: [2.7456, 101.7072] },
  { from: [6.1254, 102.2381], to: [4.5841, 103.4248] },
  { from: [5.4164, 100.3327], to: [2.1896, 102.2501] },
  { from: [4.2105, 101.9758], to: [3.8077, 103.326] },
];

// Component to fly to searched location
function FlyTo({ center }) {
  const map = useMap();
  if (center) map.flyTo(center, 14, { duration: 1.5 });
  return null;
}

export default function MapView({ onSearch }) {
  const [searchVal, setSearchVal] = useState('');
  const [flyTarget, setFlyTarget] = useState(null);
  const [tacticalMode, setTacticalMode] = useState('standard');
  const [activeFilter, setActiveFilter] = useState('all');

  // Simple geocoding via Nominatim (free, no key required)
  const handleSearch = useCallback(async () => {
    if (!searchVal.trim()) return;
    try {
      // NOTE: For production, use a proper geocoding API (Google, Mapbox, etc.)
      const geoQuery = searchVal.toLowerCase().includes('malaysia') ? searchVal : `${searchVal}, Malaysia`;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geoQuery)}&limit=1`
      );
      const data = await res.json();
      if (data.length > 0) {
        const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        setFlyTarget(coords);
        // Call the parent's unified search handler
        if (typeof onSearch === 'function') {
          onSearch(searchVal);
        }
      }
    } catch (err) {
      console.error('Geocoding failed:', err);
    }
  }, [searchVal, onSearch]);

  // Style constants
  const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const LIGHT_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  return (
    <div className={`map-area map-${tacticalMode}`}>
      {/* Map Mode Switcher */}
      <div className="map-switcher">
        <button 
          className={`map-switcher__btn ${tacticalMode === 'standard' ? 'map-switcher__btn--active' : ''}`}
          onClick={() => setTacticalMode('standard')}
        >
          DARK
        </button>
        <button 
          className={`map-switcher__btn ${tacticalMode === 'street' ? 'map-switcher__btn--active' : ''}`}
          onClick={() => setTacticalMode('street')}
        >
          STREET
        </button>
      </div>

      {/* Search Overlay */}
      <div className="map-search">
        <input
          className="map-search__input"
          placeholder="ENTER ADDRESS OR PIN LOCATION"
          value={searchVal}
          onChange={e => setSearchVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button className="map-search__btn" onClick={handleSearch}>SEARCH</button>
      </div>

      {/* Leaflet Map - Re-mounting MapContainer ensures TileLayer swap is perfect */}
      <MapContainer
        key={tacticalMode}
        center={[4.2105, 103.5]} // Center of Malaysia
        zoom={7}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
      >
        <TileLayer
          url={tacticalMode === 'street' ? LIGHT_TILES : DARK_TILES}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />

        {/* Fly to searched location */}
        <FlyTo center={flyTarget} />

        {/* User Search Marker (Person Figure) */}
        {flyTarget && (
          <Marker position={flyTarget} icon={icons.user}>
            <Popup autoOpen>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', textAlign: 'center' }}>
                <strong style={{ color: 'var(--accent-cyan)' }}>SEARCHED LOCATION</strong><br />
                <span>LAT: {flyTarget[0].toFixed(4)} <br/> LON: {flyTarget[1].toFixed(4)}</span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Disaster markers */}
        {markers
          .filter(m => activeFilter === 'all' || m.type === activeFilter)
          .map((m, i) => (
            <Marker 
              key={`${m.type}-${i}`} 
              position={m.pos} 
              icon={activeFilter === 'all' ? icons[m.type] : icons[`${m.type}_pulse`]}
            >
              <Popup>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  <strong>{m.label}</strong><br />
                  <span style={{ color: m.severity === 'High' ? '#ff4757' : m.severity === 'Medium' ? '#ff9f43' : '#00e676' }}>
                    Severity: {m.severity}
                  </span>
                </div>
              </Popup>
            </Marker>
          ))}

        {/* Connection arcs */}
        {arcs.map((a, i) => (
          <Polyline
            key={i}
            positions={[a.from, a.to]}
            pathOptions={{
              color: '#00d4ff',
              weight: 1,
              opacity: 0.35,
              dashArray: '6 4',
            }}
          />
        ))}
      </MapContainer>

      {/* Map Legend */}
      <div className="map-legend">
        <div className="map-legend__header">Tactical Filters</div>
        
        <div 
          className={`map-legend__item ${activeFilter === 'all' ? 'map-legend__item--active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          All Events
        </div>

        {Object.keys(COLORS).map(type => (
          <div 
            key={type}
            className={`map-legend__item ${activeFilter === type ? 'map-legend__item--active' : ''}`}
            onClick={() => setActiveFilter(type)}
          >
            <span 
              className="map-legend__dot" 
              style={{ color: COLORS[type].hex, background: COLORS[type].hex }} 
            />
            {type}
          </div>
        ))}
      </div>
    </div>
  );
}
