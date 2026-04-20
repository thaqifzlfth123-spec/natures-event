import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { db } from '../services/firebaseConfig';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { fetchExternalHazards } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

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
  wildfire: { name: 'purple', hex: '#a855f7' },
  medical: { name: 'red', hex: '#ff1744' },
  shelter: { name: 'green', hex: '#00e676' },
  access: { name: 'orange', hex: '#ff9f43' },
};

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}



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
  wildfire: createIcon(COLORS.wildfire),
  medical: createIcon(COLORS.medical),
  shelter: createIcon(COLORS.shelter),
  access: createIcon(COLORS.access),
  earthquake_pulse: createIcon(COLORS.earthquake, true),
  flood_pulse: createIcon(COLORS.flood, true),
  monsoon_pulse: createIcon(COLORS.monsoon, true),
  wildfire_pulse: createIcon(COLORS.wildfire, true),
  medical_pulse: createIcon(COLORS.medical, true),
  shelter_pulse: createIcon(COLORS.shelter, true),
  access_pulse: createIcon(COLORS.access, true),
  user: L.divIcon({
    className: 'user-marker',
    html: `<div class="sonar-pulse"></div><div style="width:24px;height:24px;background:#00d4ff;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 0 15px rgba(0,212,255,0.6);"><div style="width:8px;height:8px;background:#fff;border-radius:50%;transform:rotate(45deg);"></div></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  }),
};

// Malaysia-focused disaster pins (No longer mocked, filled dynamically)
const markers = [];

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
  // eslint-disable-next-line no-unused-vars
  onSearch, onReset, activeFilter, setActiveFilter, activeRegion, userCoords, savedLocations, evacuationTarget, sharedLocation, isDark 
}) {
  const { language, t } = useLanguage();
  const [flyTarget, setFlyTarget] = useState(null);
  const [mapMode, setMapMode] = useState('auto'); // 'auto' | 'street'
  const [isScanning, setIsScanning] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reportCoords, setReportCoords] = useState(null);
  const [reportType, setReportType] = useState('flood');
  const [reportText, setReportText] = useState('');

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
          setFlyTarget({ coords, zoom: 12 });
        }
      } catch (err) {
        console.error('Geocoding failed for unified search:', err);
      }
    };

    fetchCoordsAndFly();
  }, [sharedLocation]);

  const handleReportSubmit = async () => {
    if (!reportCoords) return;
    try {
      await addDoc(collection(db, "reports"), { type: reportType, text: reportText, pos: [reportCoords.lat, reportCoords.lng], timestamp: serverTimestamp(), severity: 'High' });
      setIsReporting(false);
      setReportCoords(null);
      setReportText('');
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

  const [externalMarkers, setExternalMarkers] = useState([]);

  useEffect(() => {
    async function loadExternalData() {
      const data = await fetchExternalHazards();
      if (data && data.length > 0) {
        const mapped = data.map(item => {
          let type = 'medical';
          if (item.source === 'USGS' || item.type.toLowerCase().includes('earthquake')) type = 'earthquake';
          else if (item.type.toLowerCase().includes('fire')) type = 'wildfire';
          else if (item.type.toLowerCase().includes('storm') || item.type.toLowerCase().includes('monsoon')) type = 'monsoon';
          else if (item.type.toLowerCase().includes('flood')) type = 'flood';

          let severity = 'Medium';
          if (item.mag && item.mag >= 5.0) severity = 'High';

          return {
            id: `ext-${Math.random()}`,
            pos: [item.lat, item.lon],
            type,
            label: `[${item.source}] ${item.title}`,
            severity,
          };
        });
        setExternalMarkers(mapped);
      }
    }
    loadExternalData();
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
      <div className="map-switcher">
        <button
          className={`map-switcher__btn ${mapMode === 'auto' ? 'map-switcher__btn--active' : ''}`}
          onClick={() => { setMapMode('auto'); setShowRadar(false); }}
        >
          {isDark ? 'DARK' : 'LIGHT'}
        </button>
        <button
          className={`map-switcher__btn ${mapMode === 'street' ? 'map-switcher__btn--active' : ''}`}
          onClick={() => { setMapMode(mapMode === 'street' ? 'auto' : 'street'); setShowRadar(false); }}
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

      {/* Map search has been relocated to the Header */}
      {/* Leaflet Map — key forces re-mount when tile source changes */}
      <MapContainer
        key={mapKey}
        center={[4.2105, 103.5]} // Center of Malaysia
        zoom={7}
        style={{ width: '100%', height: '100%' }}
        zoomControl={true}
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
        {evacuationTarget && evacuationTarget.lat && evacuationTarget.lon && flyTarget && Array.isArray(flyTarget.coords) && (
          <>
            <Marker position={[evacuationTarget.lat, evacuationTarget.lon]} icon={icons.shelter_pulse}>
              <Popup autoOpen><div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}><strong style={{ color: 'var(--accent-green)' }}>{t('safeZone')}</strong><br />{evacuationTarget.name}</div></Popup>
            </Marker>
            <Polyline positions={[flyTarget.coords, [evacuationTarget.lat, evacuationTarget.lon]]} pathOptions={{ color: 'var(--accent-green)', weight: 3, dashArray: '10, 10' }}>
              <Popup><div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{t('evacPath')}</div></Popup>
            </Polyline>
          </>
        )}
        {allMarkers
          .filter(m => (activeFilter === 'all' || m.type === activeFilter))
          .filter(m => Array.isArray(m.pos) && m.pos.length === 2 && !isNaN(m.pos[0]) && !isNaN(m.pos[1]))
          .map((m, i) => (
            <Marker key={`${m.id || i}`} position={m.pos} icon={icons[activeFilter === 'all' ? m.type : `${m.type}_pulse`] || icons.flood}>
              <Popup><div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}><strong>{m.label}</strong><br /><span style={{ color: m.severity === 'High' ? '#ff4757' : '#00e676' }}>{language === 'en' ? 'Severity' : 'Tahap'}: {m.severity}</span></div></Popup>
            </Marker>
          ))}
      </MapContainer>

      <div className="map-legend">
        <div className="map-legend__header">{t('tacticalFilters')}</div>
        <div className={`map-legend__item ${activeFilter === 'all' ? 'map-legend__item--active' : ''}`} onClick={() => setActiveFilter('all')}>{t('allEvents')}</div>
        {Object.keys(COLORS).map(type => (
          <div key={type} className={`map-legend__item ${activeFilter === type ? 'map-legend__item--active' : ''}`} onClick={() => setActiveFilter(type)}>
            <span className="map-legend__dot" style={{ color: COLORS[type].hex, background: COLORS[type].hex }} />
            {language === 'en' ? type.charAt(0).toUpperCase() + type.slice(1) : t(type) || type}
          </div>
        ))}
      </div>

      {isReporting && (
        <div className="report-overlay glass">
          <div className="report-overlay__header">{language === 'en' ? 'Tactical Field Report' : 'Laporan Taktikal Lapangan'}</div>
          <div className="report-overlay__step">{reportCoords ? <span style={{ color: 'var(--accent-green)' }}>✓ Location Locked</span> : <span className="pulse-text">{language === 'en' ? 'Click map to mark incident' : 'Klik peta untuk tanda insiden'}</span>}</div>
          {reportCoords && (
            <div className="fade-in">
              <select className="report-overlay__select" value={reportType} onChange={e => setReportType(e.target.value)}>
                <option value="flood">{language === 'en' ? 'Flood' : 'Banjir'}</option>
                <option value="wildfire">{language === 'en' ? 'Wildfire' : 'Kebakaran'}</option>
                <option value="monsoon">{language === 'en' ? 'Storm/Monsoon' : 'Ribut/Monsun'}</option>
                <option value="medical">{language === 'en' ? 'Medical Emergency' : 'Kecemasan Perubatan'}</option>
                <option value="access">{language === 'en' ? 'Road Blocked' : 'Jalan Terhalang'}</option>
              </select>
              <textarea className="report-overlay__input" placeholder={language === 'en' ? 'Description...' : 'Keterangan...'} value={reportText} onChange={e => setReportText(e.target.value)} />
              <button className="report-overlay__btn" onClick={handleReportSubmit}>{language === 'en' ? 'SUBMIT INTELLIGENCE' : 'HANTAR PERISIKAN'}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
