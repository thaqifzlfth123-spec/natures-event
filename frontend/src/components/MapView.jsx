import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from '../services/firebaseConfig';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { getDistance } from '../utils/geoUtils';

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const COLORS = {
  earthquake: { name: 'red', hex: '#ff4757' },
  flood: { name: 'cyan', hex: '#00d4ff' },
  monsoon: { name: 'gold', hex: '#d4a843' },
  high_temp: { name: 'purple', hex: '#a855f7' },
  medical: { name: 'red', hex: '#ff1744' },
};

function createIcon(colorObj, pulse = false) {
  const { hex } = colorObj;
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
  high_temp: createIcon(COLORS.high_temp),
  medical: createIcon(COLORS.medical),
  earthquake_pulse: createIcon(COLORS.earthquake, true),
  flood_pulse: createIcon(COLORS.flood, true),
  monsoon_pulse: createIcon(COLORS.monsoon, true),
  high_temp_pulse: createIcon(COLORS.high_temp, true),
  medical_pulse: createIcon(COLORS.medical, true),
  user: L.divIcon({
    className: 'user-marker',
    html: `<div class="sonar-pulse"></div><div style="width:24px;height:24px;background:#00d4ff;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 0 15px rgba(0,212,255,0.6);"><div style="width:8px;height:8px;background:#fff;border-radius:50%;transform:rotate(45deg);"></div></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  }),
  // Custom icon for NASA FIRMS satellite-detected high temp hotspots — purple matches system high temp colour (#a855f7)
  high_temp_firms: L.divIcon({
    className: 'custom-marker',
    html: `
      <div class="sonar-pulse" style="background: rgba(168,85,247,0.3)"></div>
      <div style="
        width:12px; height:12px; border-radius:50%;
        background: radial-gradient(circle, #c084fc, #a855f7);
        border: 2px solid rgba(216,180,254,0.9);
        box-shadow: 0 0 10px #a855f7, 0 0 20px rgba(168,85,247,0.5);
        position: relative; z-index: 2;
      "></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -10],
  }),
};

// Malaysia-focused disaster pins (No longer mocked, filled dynamically)
const markers = [];

// ── EVACUATION SHELTER LOCATIONS (Static / mock — replace with API later) ──
// Each object: { id, name, pos: [lat, lon], capacity, contact }
const SHELTER_LOCATIONS = [];

// Component to fly to searched location or reset view
function FlyTo({ target }) {
  const map = useMap();
  if (target) map.flyTo(target.coords, target.zoom, { duration: 1.5 });
  return null;
}

function MapEvents({ onMapClick, isReporting }) {
  useMapEvents({ click(e) { if (isReporting) onMapClick(e.latlng); } });
  return null;
}

// ── TILE URLs ──
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const STREET_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export default function MapView({ 
  onSearch, onReset, activeFilter, setActiveFilter, activeRegion, userCoords, savedLocations, 
  evacuationTarget, sharedLocation, isDark, isMobile, onGetLocation, setActiveRegion, 
  externalMarkers = [],
  focusCoords = null
}) {
  const { language, t } = useLanguage();
  const [flyTarget, setFlyTarget] = useState(null);
  const [mapMode, setMapMode] = useState('auto'); // 'auto' | 'street'
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reportCoords, setReportCoords] = useState(null);
  const [reportType, setReportType] = useState('flood');
  const [reportSeverity, setReportSeverity] = useState('Medium');
  const [reportText, setReportText] = useState('');
  const { user } = useAuth();

  // React to unified search from the Header component
  useEffect(() => {
    if (!sharedLocation) return;

    const fetchCoordsAndFly = async () => {
      setIsScanning(true);
      setTimeout(() => setIsScanning(false), 3000); // 3s scanning animation
      try {
        const geoQuery = sharedLocation.toLowerCase().includes('malaysia')
          ? sharedLocation
          : `${sharedLocation}, Malaysia`;

        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(geoQuery)}&limit=1`);
        const data = await res.json();

        if (data && data.length > 0) {
          const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
          // If it's a specific search, use 12, if it's from GPS (handled elsewhere) it might use higher
          setFlyTarget({ coords, zoom: 12 });
        }
      } catch (err) {
        console.error('Geocoding failed for unified search:', err);
      }
    };

    fetchCoordsAndFly();
  }, [sharedLocation]);

  // NEW: React to GPS location from App.jsx
  useEffect(() => {
    if (userCoords && !sharedLocation) {
      setIsScanning(true);
      setTimeout(() => setIsScanning(false), 3000);
      setFlyTarget({ coords: [userCoords.lat, userCoords.lon], zoom: 14 });
    }
  }, [userCoords, sharedLocation]);

  // ── React to map-pan requests from the News Feed click (focusCoords) ──
  useEffect(() => {
    if (!focusCoords) return;
    setFlyTarget({ coords: [focusCoords.lat, focusCoords.lon], zoom: 13 });
  }, [focusCoords]);

  const handleReportSubmit = async () => {
    if (!reportCoords || !reportText.trim()) return;
    try {
      await addDoc(collection(db, "reports"), { 
        type: reportType, 
        text: reportText, 
        pos: [reportCoords.lat, reportCoords.lng], 
        timestamp: serverTimestamp(), 
        severity: reportSeverity,
        reporter: user?.email || 'ANONYMOUS'
      });
      setIsReporting(false);
      setReportCoords(null);
      setReportText('');
      setReportSeverity('Medium');
    } catch (err) { console.error(err); }
  };

  // eslint-disable-next-line no-unused-vars
  const handleResetClick = () => {
    setFlyTarget({ coords: [4.2105, 101.9758], zoom: 6 });
    if (typeof onReset === 'function') onReset();
  };

  const [radarPath, setRadarPath] = useState(null);
  const [showRadar, setShowRadar] = useState(false);
  useEffect(() => {
    if (showRadar && !radarPath) {
      fetch('https://api.rainviewer.com/public/weather-maps.json').then(res => res.json()).then(data => {
        if (data?.radar?.past) setRadarPath(data.radar.past[data.radar.past.length - 1].path);
      });
    }
  }, [showRadar, radarPath]);

  const RADAR_TILES = radarPath ? `https://tilecache.rainviewer.com${radarPath}/256/{z}/{x}/{y}/2/1_1.png` : null;

  // FIX #2: Resolve tile URL based on mode + theme
  const resolvedTileUrl =
    mapMode === 'street' ? STREET_TILES :
      isDark ? DARK_TILES : LIGHT_TILES;

  // FIX #1: Build a stable key so MapContainer re-mounts when tiles change
  const mapKey = `${mapMode}-${isDark ? 'dark' : 'light'}`;


  // Add real-time reports to markers
  const [liveMarkers, setLiveMarkers] = useState([]);
  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("timestamp", "desc"));
    return onSnapshot(q, (snapshot) => {
      setLiveMarkers(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, label: `REPORT: ${doc.data().text || doc.data().type}` })));
    });
  }, []);



  const allRawMarkers = [...markers, ...liveMarkers, ...externalMarkers];

  const allMarkers = allRawMarkers.filter(m => {
    if (activeRegion === 'MY LOCATIONS') {
      let isWithin5km = false;
      if (Array.isArray(m.pos) && m.pos.length === 2) {
        if (userCoords && getDistance(m.pos[0], m.pos[1], userCoords.lat, userCoords.lon) <= 5) isWithin5km = true;
        if (savedLocations && savedLocations.length > 0) {
          savedLocations.forEach(loc => {
            if (loc.lat && loc.lon && getDistance(m.pos[0], m.pos[1], loc.lat, loc.lon) <= 5) isWithin5km = true;
          });
        }
      }
      return isWithin5km;
    }
    return true;
  });

  return (
    <div className={`map-area`}>
      {/* CyberScan Overlay */}
      {isScanning && <div className="radar-scan" />}

      {/* Map Mode Switcher — FIX #1: Proper toggle (clicking active = back to auto) */}
      <div className="map-switcher flex flex-col md:flex-row items-end md:items-start z-[1000] right-2 top-2 max-w-[95vw]">
        <button 
          className="map-switcher__btn md:hidden mb-1 w-full flex justify-between items-center px-3 py-2 text-[10px] sm:text-xs border border-[var(--border-color)] bg-[var(--bg-card)]" 
          onClick={() => setSwitcherOpen(prev => !prev)}
        >
          <span>🗺️ MAP TOOLS</span>
          <span>{switcherOpen ? '✕' : '▼'}</span>
        </button>
        <div className={`${switcherOpen ? 'flex' : 'hidden'} md:flex flex-col md:flex-row gap-1 flex-wrap justify-end text-center rounded-xl overflow-hidden backdrop-blur-md shadow-lg p-1 bg-black/20 md:bg-transparent`}>
          <button
            className={`map-switcher__btn ${mapMode === 'auto' ? 'map-switcher__btn--active' : ''}`}
            onClick={() => { setMapMode('auto'); setShowRadar(false); }}
          >
            {isDark ? t('mapDark') : t('mapLight') || 'LIGHT'}
          </button>
          <button
            className={`map-switcher__btn ${mapMode === 'street' ? 'map-switcher__btn--active' : ''}`}
            onClick={() => { setMapMode(mapMode === 'street' ? 'auto' : 'street'); setShowRadar(false); }}
          >
            {t('mapStreet')}
          </button>
          <button
            className={`map-switcher__btn ${showRadar ? 'map-switcher__btn--active' : ''}`}
            onClick={() => setShowRadar(prev => !prev)}
          >
            {showRadar ? 'LIVE: ON' : t('mapWeather')}
          </button>

          {/* NEW DASHBOARD BUTTONS */}
          <button className="map-switcher__btn" onClick={onGetLocation} title={t('findDistrict')}>
            {t('findDistrict')}
          </button>
          <button className="map-switcher__btn" onClick={() => setActiveRegion('MY LOCATIONS')} title={t('myLocation')}>
            {t('myLocation')}
          </button>
          <button
            className={`map-switcher__btn ${isReporting ? 'map-switcher__btn--active' : ''}`}
            onClick={() => setIsReporting(prev => !prev)}
            style={{ background: isReporting ? 'var(--accent-red)' : '' }}
          >
            {isReporting ? t('mapCancel') : t('mapReport')}
          </button>
          <button className="map-switcher__btn" onClick={handleResetClick} title={t('mapResetBtn')}>
            {t('mapResetBtn')}
          </button>
        </div>
      </div>

      {/* Map search has been relocated to the Header */}
      {/* Leaflet Map — key forces re-mount when tile source changes */}
      <MapContainer
        key={mapKey}
        center={[4.2105, 103.5]} // Center of Malaysia
        zoom={7}
        style={{ width: '100%', height: '100%' }}
        zoomControl={!isMobile}
      >
        <MapEvents isReporting={isReporting} onMapClick={setReportCoords} />
        <TileLayer
          url={resolvedTileUrl}
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
        {flyTarget && Array.isArray(flyTarget.coords) && flyTarget.coords.length === 2 && flyTarget.zoom > 10 && (
          <Marker position={flyTarget.coords} icon={icons.user}>
            <Popup autoOpen><div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}><strong>{t('searchedLoc')}</strong><br />{flyTarget.coords[0]?.toFixed(4)}, {flyTarget.coords[1]?.toFixed(4)}</div></Popup>
          </Marker>
        )}
        {allMarkers
          .filter(m => (activeFilter === 'all' || m.type === activeFilter))
          .filter(m => Array.isArray(m.pos) && m.pos.length === 2 && !isNaN(m.pos[0]) && !isNaN(m.pos[1]))
          .map((m, i) => (
            <Marker key={`${m.id || i}`} position={m.pos} icon={icons[activeFilter === 'all' ? m.type : `${m.type}_pulse`] || icons.flood}>
              <Popup><div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}><strong>{m.label}</strong><br /><span style={{ color: m.severity === 'High' ? '#ff4757' : '#00e676' }}>{t('severity')}: {m.severity}</span></div></Popup>
            </Marker>
          ))}

        {/* ── NASA FIRMS: High Temp Layer ──
             Gate: only shown when filter is 'all' OR 'high_temp'.
             Strictly hidden for other event types. */}
        {(activeFilter === 'all' || activeFilter === 'high_temp') && externalMarkers
          .filter(m => m.id && m.id.startsWith('firms-'))
          .filter(m => Array.isArray(m.pos) && !isNaN(m.pos[0]) && !isNaN(m.pos[1]))
          .map((m) => (
            <Marker
              key={m.id}
              position={m.pos}
              icon={icons.high_temp_firms}
            >
              <Popup>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', minWidth: '180px' }}>
                  <strong style={{ color: '#ff6600' }}>🔥 NASA FIRMS HIGH TEMP</strong>
                  <br />
                  <span style={{ color: '#aaa' }}>Source:</span> VIIRS SNPP NRT
                  <br />
                  <span style={{ color: '#aaa' }}>Coords:</span> {m.pos[0].toFixed(4)}, {m.pos[1].toFixed(4)}
                  <br />
                  <span style={{ color: '#aaa' }}>Severity:</span>{' '}
                  <span style={{ color: m.severity === 'Critical' ? '#ff0055' : m.severity === 'High' ? '#ff4757' : '#ff9f43' }}>
                    {m.severity?.toUpperCase()}
                  </span>
                  <br />
                  <span style={{ color: '#aaa', fontSize: '9px' }}>{m.label}</span>
                </div>
              </Popup>
            </Marker>
          ))
        }

      </MapContainer>

      <div className="map-legend">
        <div className="map-legend__header">{t('tacticalFilters')}</div>
        <div className={`map-legend__item ${activeFilter === 'all' ? 'map-legend__item--active' : ''}`} onClick={() => setActiveFilter('all')}>{t('allEvents')}</div>
        {Object.keys(COLORS).map(type => (
          <div key={type} className={`map-legend__item ${activeFilter === type ? 'map-legend__item--active' : ''}`} onClick={() => setActiveFilter(type)}>
            <span className="map-legend__dot" style={{ color: COLORS[type].hex, background: COLORS[type].hex }} />
            {t(type)}
          </div>
        ))}
      </div>

      {isReporting && (
        <div className="report-overlay glass">
          <div className="report-overlay__header">{t('tacticalFieldReport')}</div>
          <div className="report-overlay__step">{reportCoords ? <span style={{ color: 'var(--accent-green)' }}>✓ {t('locationLocked')}</span> : <span className="pulse-text">{t('clickMapMark')}</span>}</div>
          {reportCoords && (
            <div className="fade-in">
              <select className="report-overlay__select" value={reportType} onChange={e => setReportType(e.target.value)}>
                <option value="flood">{language === 'en' ? 'Flood' : 'Banjir'}</option>
                <option value="high_temp">{language === 'en' ? 'High Temp' : 'Kawasan Suhu Tinggi'}</option>
                <option value="monsoon">{language === 'en' ? 'Storm/Monsoon' : 'Ribut/Monsun'}</option>
                <option value="medical">{language === 'en' ? 'Medical Emergency' : 'Kecemasan Perubatan'}</option>
              </select>
              <select 
                className="report-overlay__select" 
                value={reportSeverity} 
                onChange={e => setReportSeverity(e.target.value)}
                style={{ marginTop: '8px', borderColor: reportSeverity === 'Critical' ? 'var(--accent-red)' : 'var(--border-color)' }}
              >
                <option value="Low">{language === 'en' ? 'Severity: Low' : 'Tahap: Rendah'}</option>
                <option value="Medium">{language === 'en' ? 'Severity: Medium' : 'Tahap: Sederhana'}</option>
                <option value="High">{language === 'en' ? 'Severity: High' : 'Tahap: Tinggi'}</option>
                <option value="Critical">{language === 'en' ? 'Severity: CRITICAL' : 'Tahap: KRITIKAL'}</option>
              </select>
              <textarea className="report-overlay__input" placeholder={language === 'en' ? 'Description (required)...' : 'Keterangan (diperlukan)...'} value={reportText} onChange={e => setReportText(e.target.value)} />
              <button 
                className="report-overlay__btn" 
                onClick={handleReportSubmit}
                disabled={!reportText.trim()}
                style={{ opacity: reportText.trim() ? 1 : 0.5 }}
              >
                {t('submitIntelligence')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
