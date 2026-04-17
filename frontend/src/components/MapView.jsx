import { useState, useCallback, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from '../services/firebaseConfig';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';

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
  wildfire: { name: 'purple', hex: '#a855f7' },
  medical: { name: 'red', hex: '#ff1744' },
  shelter: { name: 'green', hex: '#00e676' },
  access: { name: 'orange', hex: '#ff9f43' },
};

// Custom colored marker icons with optional sonar pulse
function createIcon(colorObj, pulse = false) {
  const { name, hex } = colorObj;
  return L.divIcon({
    className: 'custom-marker',
    html: `
      ${pulse ? `<div class="sonar-pulse" style="background: ${hex}44"></div>` : ''}
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
  wildfire: createIcon(COLORS.wildfire),
  medical: createIcon(COLORS.medical),
  shelter: createIcon(COLORS.shelter),
  access: createIcon(COLORS.access),
  // Pulse variants for filtered view
  earthquake_pulse: createIcon(COLORS.earthquake, true),
  flood_pulse: createIcon(COLORS.flood, true),
  monsoon_pulse: createIcon(COLORS.monsoon, true),
  wildfire_pulse: createIcon(COLORS.wildfire, true),
  medical_pulse: createIcon(COLORS.medical, true),
  shelter_pulse: createIcon(COLORS.shelter, true),
  access_pulse: createIcon(COLORS.access, true),
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
  { pos: [3.1412, 101.7588], type: 'medical',    label: 'Hospital Ampang — Emergency Hub',          severity: 'Active' },
  { pos: [1.5361, 103.7484], type: 'medical',    label: 'Sultanah Aminah — Critical Zone',         severity: 'Alert' },
  { pos: [3.7915, 103.3241], type: 'shelter',    label: 'SK Beserah — Regional Evacuation Center', severity: 'Safe' },
  { pos: [5.9328, 116.0645], type: 'shelter',    label: 'KK Sports Complex — Shelter Alpha',       severity: 'Safe' },
  { pos: [4.4729, 101.3734], type: 'access',     label: 'Gua Musang Highway — Road Closed (Flood)', severity: 'Danger' },
  { pos: [3.2845, 101.7456], type: 'access',     label: 'Gombak Bypass — Tree Fall Access Block',  severity: 'Awaiting Clearence' },
];

// Connection arcs removed as per tactical redesign request
const arcs = [];

// Component to fly to searched location or reset view
function FlyTo({ target }) {
  const map = useMap();
  if (target) {
    map.flyTo(target.coords, target.zoom, { duration: 1.5 });
  }
  return null;
}

// Component to handle map clicks for reporting
function MapEvents({ onMapClick, isReporting }) {
  useMapEvents({
    click(e) {
      if (isReporting) {
        onMapClick(e.latlng);
      }
    },
  });
  return null;
}

export default function MapView({ onSearch, onReset, activeFilter, setActiveFilter, evacuationTarget, sharedLocation }) {
  const [searchVal, setSearchVal] = useState('');
  const [flyTarget, setFlyTarget] = useState(null);
  const [tacticalMode, setTacticalMode] = useState('standard');
  const [isScanning, setIsScanning] = useState(false);
  
  // REPORTING STATE
  const [isReporting, setIsReporting] = useState(false);
  const [reportCoords, setReportCoords] = useState(null);
  const [reportType, setReportType] = useState('flood');
  const [reportText, setReportText] = useState('');

  // Simple geocoding via Nominatim (free, no key required)
  const handleSearch = useCallback(async () => {
    if (!searchVal.trim()) return;
    setIsScanning(true);
    setTimeout(() => setIsScanning(false), 3000); // 3s scanning animation
    try {
      // NOTE: For production, use a proper geocoding API (Google, Mapbox, etc.)
      const geoQuery = searchVal.toLowerCase().includes('malaysia') ? searchVal : `${searchVal}, Malaysia`;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geoQuery)}&limit=1`
      );
      const data = await res.json();
      if (data.length > 0) {
        const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
        setFlyTarget({ coords, zoom: 12 });
        // Call the parent's unified search handler with coordinates to avoid ambiguity
        if (typeof onSearch === 'function') {
          onSearch(searchVal, coords[0], coords[1]);
        }
      }
    } catch (err) {
      console.error('Geocoding failed:', err);
    }
  }, [searchVal, onSearch]);

  const handleReportSubmit = async () => {
    if (!reportCoords) return;
    try {
      await addDoc(collection(db, "reports"), {
        type: reportType,
        text: reportText,
        pos: [reportCoords.lat, reportCoords.lng],
        timestamp: serverTimestamp(),
        severity: 'High'
      });
      
      // Cleanup
      setIsReporting(false);
      setReportCoords(null);
      setReportText('');
    } catch (err) {
      console.error('Failed to submit report:', err);
    }
  };

  const handleResetClick = () => {
    setSearchVal('');
    setFlyTarget({ coords: [4.2105, 101.9758], zoom: 6 });
    if (typeof onReset === 'function') {
      onReset();
    }
  };

  // RainViewer Radar Tiles Logic
  const [radarPath, setRadarPath] = useState(null);
  const [showRadar, setShowRadar] = useState(false);

  useEffect(() => {
    if (showRadar && !radarPath) {
      fetch('https://api.rainviewer.com/public/weather-maps.json')
        .then(res => res.json())
        .then(data => {
          if (data && data.radar && data.radar.past) {
            const latest = data.radar.past[data.radar.past.length - 1];
            setRadarPath(latest.path);
          }
        });
    }
  }, [showRadar, radarPath]);

  // Style constants
  const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const LIGHT_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const RADAR_TILES = radarPath ? `https://tilecache.rainviewer.com${radarPath}/256/{z}/{x}/{y}/2/1_1.png` : null;

  // Add real-time reports to markers
  const [liveMarkers, setLiveMarkers] = useState([]);
  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("timestamp", "desc"));
    return onSnapshot(q, (snapshot) => {
      const reports = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, label: `REPORT: ${doc.data().text || doc.data().type}` }));
      setLiveMarkers(reports);
    });
  }, []);

  const arcs = []; // Tactical connection arcs (placeholder for future sensor mesh)
  const allMarkers = [...markers, ...liveMarkers];

  return (
    <div className={`map-area map-${tacticalMode}`}>
      {/* CyberScan Overlay */}
      {isScanning && <div className="radar-scan" />}
      
      {/* Map Mode Switcher */}
      <div className="map-switcher">
        <button 
          className={`map-switcher__btn ${tacticalMode === 'standard' ? 'map-switcher__btn--active' : ''}`}
          onClick={() => { setTacticalMode('standard'); setShowRadar(false); }}
        >
          DARK
        </button>
        <button 
          className={`map-switcher__btn ${tacticalMode === 'street' ? 'map-switcher__btn--active' : ''}`}
          onClick={() => { setTacticalMode('street'); setShowRadar(false); }}
        >
          STREET
        </button>
        <button 
          className={`map-switcher__btn ${showRadar ? 'map-switcher__btn--active' : ''}`}
          onClick={() => setShowRadar(prev => !prev)}
        >
          {showRadar ? 'LIVE: ON' : 'WEATHER'}
        </button>
        <button 
          className={`map-switcher__btn ${isReporting ? 'map-switcher__btn--active' : ''}`}
          onClick={() => setIsReporting(prev => !prev)}
          style={{ background: isReporting ? 'var(--accent-red)' : '' }}
        >
          {isReporting ? 'CANCEL' : 'REPORT'}
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
        <button className="map-search__btn map-search__btn--reset" onClick={handleResetClick}>RESET</button>
      </div>

      {/* Leaflet Map - Re-mounting MapContainer ensures TileLayer swap is perfect */}
      <MapContainer
        key={tacticalMode}
        center={[4.2105, 103.5]} // Center of Malaysia
        zoom={7}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
      >
        <MapEvents isReporting={isReporting} onMapClick={setReportCoords} />
        <TileLayer
          url={tacticalMode === 'street' ? LIGHT_TILES : DARK_TILES}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />

        {/* Dynamic Weather Radar Layer */}
        {showRadar && RADAR_TILES && (
          <TileLayer
            url={RADAR_TILES}
            attribution='&copy; <a href="https://www.rainviewer.com/api.html">RainViewer</a>'
            opacity={0.65}
            zIndex={100}
          />
        )}

        {/* Fly to searched location */}
        <FlyTo target={flyTarget} />

        {/* User Search Marker (Person Figure) */}
        {flyTarget && flyTarget.zoom > 10 && (
          <Marker position={flyTarget.coords} icon={icons.user}>
            <Popup autoOpen>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', textAlign: 'center' }}>
                <strong style={{ color: 'var(--accent-cyan)' }}>SEARCHED LOCATION</strong><br />
                <span>LAT: {flyTarget.coords[0].toFixed(4)} <br/> LON: {flyTarget.coords[1].toFixed(4)}</span>
              </div>
            </Popup>
          </Marker>
        )}

        {/* EVACUATION SAFETY PATH VISUALIZATION */}
        {evacuationTarget && flyTarget && (
          <>
            <Marker 
              position={[evacuationTarget.lat, evacuationTarget.lon]} 
              icon={icons.station_pulse}
            >
              <Popup autoOpen>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                  <strong style={{ color: 'var(--accent-green)' }}>SAFE ZONE IDENTIFIED</strong><br />
                  <span>{evacuationTarget.name}</span>
                </div>
              </Popup>
            </Marker>
            <Polyline 
              positions={[flyTarget.coords, [evacuationTarget.lat, evacuationTarget.lon]]}
              pathOptions={{
                color: 'var(--accent-green)',
                weight: 3,
                dashArray: '10, 10',
                opacity: 0.8
              }}
            >
              <Popup>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                   Evacuation Path to Safety
                </div>
              </Popup>
            </Polyline>
          </>
        )}

        {/* Disaster markers */}
        {allMarkers
          .filter(m => (activeFilter === 'all' || m.type === activeFilter) && Array.isArray(m.pos) && m.pos.length === 2)
          .map((m, i) => {
            const iconKey = activeFilter === 'all' ? m.type : `${m.type}_pulse`;
            const markerIcon = icons[iconKey] || icons[m.type] || icons.flood;
            
            return (
              <Marker 
                key={`${m.id || m.type}-${i}`} 
                position={m.pos} 
                icon={markerIcon}
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
            );
          })}

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

      {/* REPORT FORM OVERLAY */}
      {isReporting && (
        <div className="report-overlay glass">
          <div className="report-overlay__header">Tactical Field Report</div>
          
          <div className="report-overlay__step">
            {reportCoords ? (
              <span style={{ color: 'var(--accent-green)' }}>✓ Location Locked</span>
            ) : (
              <span className="pulse-text">Click on the map to mark incident</span>
            )}
          </div>

          {reportCoords && (
            <div className="fade-in">
              <select 
                className="report-overlay__select"
                value={reportType}
                onChange={e => setReportType(e.target.value)}
              >
                <option value="flood">Flood</option>
                <option value="wildfire">Wildfire</option>
                <option value="monsoon">Storm/Monsoon</option>
                <option value="medical">Medical Emergency</option>
                <option value="access">Road Blocked</option>
              </select>
              
              <textarea 
                className="report-overlay__input"
                placeholder="Brief description (optional)..."
                value={reportText}
                onChange={e => setReportText(e.target.value)}
              />
              
              <button 
                className="report-overlay__btn"
                onClick={handleReportSubmit}
              >
                SUBMIT INTELLIGENCE
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
