import { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import Header from './components/Header';
import RiskGauges from './components/RiskGauges';
import NewsFeed from './components/NewsFeed';
import LocationData from './components/LocationData';
import ChatBot from './components/ChatBot';
import AlertSummary from './components/AlertSummary';
import AuthModal from './components/AuthModal';
import StrategicAdvisory from './components/StrategicAdvisory';
import { db } from './services/firebaseConfig';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useLanguage } from './context/LanguageContext';

const MapView = lazy(() => import('./components/MapView'));

// Vercel Force Redeploy: 2026-04-18T20:00 (Dashboard Layout Refactor)
export default function App() {
  // eslint-disable-next-line no-unused-vars
  const { t } = useLanguage();
  const [showAuth, setShowAuth] = useState(false);
  const [user, setUser] = useState(null);
  const [isDark, setIsDark] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  const dashRef = useRef(null);

  const [sharedLocation, setSharedLocation] = useState('');
  const [sharedRiskData, setSharedRiskData] = useState(null);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [userCoords, setUserCoords] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [evacuationTarget, setEvacuationTarget] = useState(null);

  // NEW FEATURE STATES
  const [activeRegion, setActiveRegion] = useState('REGIONS');
  const [savedLocations, setSavedLocations] = useState(() => {
    const saved = localStorage.getItem('savedLocations');
    return saved ? JSON.parse(saved) : [];
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    return localStorage.getItem('notificationsEnabled') === 'true';
  });

  // ── RESIZABLE PANEL STATE ──
  const [topRatio, setTopRatio] = useState(0.62);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(300);
  const [bottomLeftWidth, setBottomLeftWidth] = useState(320);
  const dashBodyRef = useRef(null);
  const resizingRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Prevent the dashboard from scrolling on desktop
  useEffect(() => {
    if (isMobile) return;
    const el = dashRef.current;
    if (!el) return;
    const preventScroll = () => { el.scrollTop = 0; el.scrollLeft = 0; };
    preventScroll();
    el.addEventListener('scroll', preventScroll);
    return () => el.removeEventListener('scroll', preventScroll);
  }, [isMobile]);

  // ── RESIZE DRAG HANDLERS ──
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!resizingRef.current) return;
      e.preventDefault();
      const { type, startX, startValue } = resizingRef.current;

      if (type === 'vertical') {
        const body = dashBodyRef.current;
        if (!body) return;
        const rect = body.getBoundingClientRect();
        const ratio = (e.clientY - rect.top) / rect.height;
        setTopRatio(Math.max(0.25, Math.min(0.80, ratio)));
      } else if (type === 'left') {
        setLeftWidth(Math.max(180, Math.min(450, startValue + (e.clientX - startX))));
      } else if (type === 'right') {
        setRightWidth(Math.max(200, Math.min(500, startValue - (e.clientX - startX))));
      } else if (type === 'bottomLeft') {
        setBottomLeftWidth(Math.max(200, Math.min(600, startValue + (e.clientX - startX))));
      }
    };

    const handleMouseUp = () => {
      if (resizingRef.current) {
        resizingRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResize = useCallback((type, e) => {
    e.preventDefault();
    const startValue =
      type === 'left' ? leftWidth :
        type === 'right' ? rightWidth :
          type === 'bottomLeft' ? bottomLeftWidth : topRatio;
    resizingRef.current = { type, startX: e.clientX, startY: e.clientY, startValue };
    document.body.style.cursor = type === 'vertical' ? 'row-resize' : 'col-resize';
    document.body.style.userSelect = 'none';
  }, [leftWidth, rightWidth, bottomLeftWidth, topRatio]);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    console.log('Logged in:', userData.email);
  };

  // UNIFIED SEARCH HANDLER
  const handleUnifiedSearch = async (loc, lat = null, lon = null) => {
    if (!loc) return;
    setSharedLocation(loc);
    setLoadingRisk(true);
    setEvacuationTarget(null);
    try {
      const { checkHazardRisk } = await import('./services/api');
      const data = await checkHazardRisk(loc, lat, lon);
      setSharedRiskData(data);
    } catch (err) { console.error(err); } finally { setLoadingRisk(false); }
  };

  const handleReset = useCallback(() => {
    setSharedLocation('');
    setSharedRiskData(null);
    setActiveFilter('all');
    setUserCoords(null);
  }, []);

  // --- NEW CAPABILITIES: GPS & LOCATION SAVING ---
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setLoadingRisk(true);
    navigator.geolocation.getCurrentPosition(async (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      setUserCoords({ lat, lon });

      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const data = await res.json();
        const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || "Current Location";
        // Run standard search using the found city name
        await handleUnifiedSearch(city, lat, lon);
      } catch (err) {
        console.error("Reverse geocoding failed", err);
        await handleUnifiedSearch(`Lat: ${lat.toFixed(2)}, Lon: ${lon.toFixed(2)}`, lat, lon);
      }
    }, (err) => {
      setLoadingRisk(false);
      alert("Unable to retrieve location: " + err.message);
    });
  };

  const handleSaveLocation = () => {
    if (!sharedLocation) return;
    // Assume user coordinates is the active GPS or null if just a text search
    const locObj = {
      name: sharedLocation,
      lat: userCoords ? userCoords.lat : null,
      lon: userCoords ? userCoords.lon : null,
      timestamp: new Date().toISOString()
    };

    // Prevent exactly identical string duplicates
    if (savedLocations.find(loc => loc.name === sharedLocation)) return;

    const newList = [...savedLocations, locObj];
    setSavedLocations(newList);
    localStorage.setItem('savedLocations', JSON.stringify(newList));
    alert(`Saved ${sharedLocation} to My Locations!`);
  };

  // --- NEW CAPABILITIES: NOTIFICATIONS ---
  const handleToggleNotifications = () => {
    if (!user) {
      setShowAuth(true); // Must be logged in
      return;
    }
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      localStorage.setItem('notificationsEnabled', 'false');
    } else {
      if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            setNotificationsEnabled(true);
            localStorage.setItem('notificationsEnabled', 'true');
            new Notification("Notifications Enabled", { body: "You will now receive tactical alerts." });
          } else {
            alert("Notification permission denied by the browser.");
          }
        });
      }
    }
  };


  const [liveReports, setLiveReports] = useState([]);
  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("timestamp", "desc"));
    return onSnapshot(q, (snapshot) => {
      setLiveReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, []);

  return (
    <div className="dashboard" ref={dashRef}>
      {/* ── HEADER (with search) ── */}
      <Header
        onLoginClick={() => setShowAuth(true)}
        onThemeToggle={() => setIsDark(prev => !prev)}
        onToggleLeft={() => {
          if (isMobile) {
            document.getElementById('tactical-menu')?.scrollIntoView({ behavior: 'smooth' });
          } else {
            setLeftOpen(prev => !prev);
          }
        }}
        onToggleRight={() => {
          if (isMobile) {
            document.getElementById('data-feed')?.scrollIntoView({ behavior: 'smooth' });
          } else {
            setRightOpen(prev => !prev);
          }
        }}
        isDark={isDark}
        isMobile={isMobile}
        onSearch={handleUnifiedSearch}
        onReset={handleReset}
        activeRegion={activeRegion}
        setActiveRegion={setActiveRegion}
        onGetLocation={handleGetLocation}
        onSaveLocation={handleSaveLocation}
        notificationsEnabled={notificationsEnabled}
        onToggleNotifications={handleToggleNotifications}
        user={user}
        savedLocations={savedLocations}
      />

      {/* ── DASHBOARD BODY (Vertically Resizable Top/Bottom Groups) ── */}
      <StrategicAdvisory />
      <div className="dashboard-body" ref={dashBodyRef}>

        {/* ── TOP GROUP: Community Incidents | Map | ChatBot ── */}
        <div
          className="top-group"
          style={!isMobile ? { height: `calc(${topRatio * 100}% - 3px)` } : undefined}
        >
          {/* Left Panel: Risk Gauges + Community Incidents */}
          <div
            id="tactical-menu"
            className={`left-sidebar glass scanline ${leftOpen ? 'left-sidebar--open' : ''}`}
            style={!isMobile ? { width: leftWidth, flexShrink: 0 } : undefined}
          >
            <RiskGauges />
            <NewsFeed reports={liveReports} />
          </div>

          {!isMobile && (
            <div
              className="resize-handle resize-handle--col"
              onMouseDown={(e) => startResize('left', e)}
            />
          )}

          {/* Center: Map */}
          <ErrorBoundary fallback="Map failed to load">
            <MapView
              onSearch={handleUnifiedSearch}
              onReset={handleReset}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              activeRegion={activeRegion}
              userCoords={userCoords}
              savedLocations={savedLocations}
              sharedLocation={sharedLocation}
              isDark={isDark}
            />
          </ErrorBoundary>

          {!isMobile && (
            <div
              className="resize-handle resize-handle--col"
              onMouseDown={(e) => startResize('right', e)}
            />
          )}

          {/* Right Panel: ChatBot (full height — spacious) */}
          <div
            className={`right-sidebar glass scanline ${rightOpen ? 'right-sidebar--open' : ''}`}
            style={!isMobile ? { width: rightWidth, flexShrink: 0 } : undefined}
          >
            <ChatBot />
          </div>
        </div>

        {/* ── VERTICAL RESIZE HANDLE ── */}
        {!isMobile && (
          <div
            className="resize-handle resize-handle--row"
            onMouseDown={(e) => startResize('vertical', e)}
          />
        )}

        {/* ── BOTTOM GROUP: News Feed (Official News) | Location Data & Charts ── */}
        <div
          id="data-feed"
          className="bottom-group"
          style={!isMobile ? { flex: 1, minHeight: 0 } : undefined}
        >
          {/* Left: Official News Center (moved from right sidebar) */}
          <div
            className="bottom-group__left glass"
            style={!isMobile ? { width: bottomLeftWidth, flexShrink: 0 } : undefined}
          >
            <ErrorBoundary fallback="News Feed unavailable">
              <AlertSummary />
            </ErrorBoundary>
          </div>

          {!isMobile && (
            <div
              className="resize-handle resize-handle--col"
              onMouseDown={(e) => startResize('bottomLeft', e)}
            />
          )}

          {/* Right: Location Data & Analysis */}
          <div className="bottom-group__right">
            <ErrorBoundary fallback="Location Data unavailable">
              <LocationData
                location={sharedLocation}
                riskData={sharedRiskData}
                loading={loadingRisk}
                activeFilter={activeFilter}
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* ── FLOATING CHATBOT FAB (Mobile only) ── */}
      <div className="chat-fab">
        <button
          className="chat-fab__btn"
          onClick={() => setChatOpen(prev => !prev)}
          title="Open AI Chatbot"
        >
          {chatOpen ? '✕' : '💬'}
          <span className="chat-fab__badge" />
        </button>
      </div>

      {chatOpen && isMobile && (
        <div className="chat-overlay">
          <ChatBot />
        </div>
      )}

      {/* ── AUTH MODAL ── */}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
    </div>
  );
}
