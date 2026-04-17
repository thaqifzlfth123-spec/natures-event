import { useState, useEffect, useRef, useCallback } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import Header from './components/Header';
import SensorGrid from './components/SensorGrid';
import RiskGauges from './components/RiskGauges';
import MapView from './components/MapView';
import NewsFeed from './components/NewsFeed';
import LocationData from './components/LocationData';
import ImageAnalyzer from './components/ImageAnalyzer';
import ChatBot from './components/ChatBot';
import AlertSummary from './components/AlertSummary';
import AuthModal from './components/AuthModal';
import { db } from './services/firebaseConfig';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

// Vercel Force Redeploy: 2026-04-16T22:35 (Guardian Platform Sync)
export default function App() {
  const [showAuth, setShowAuth] = useState(false);
  const [user, setUser] = useState(null);
  const [isDark, setIsDark] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1024);
  const dashRef = useRef(null);

  // SHARED STATE FOR UNIFIED SEARCH
  const [sharedLocation, setSharedLocation] = useState('');
  const [sharedRiskData, setSharedRiskData] = useState(null);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  // Track viewport width for mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  // Prevent the dashboard grid from scrolling (Leaflet/Plotly can trigger auto-scroll)
  // Only on desktop — mobile needs vertical scrolling
  useEffect(() => {
    if (isMobile) return; // Don't lock scroll on mobile
    const el = dashRef.current;
    if (!el) return;
    const preventScroll = () => { el.scrollTop = 0; el.scrollLeft = 0; };
    preventScroll();
    el.addEventListener('scroll', preventScroll);
    const timer = setTimeout(preventScroll, 500);
    return () => { el.removeEventListener('scroll', preventScroll); clearTimeout(timer); };
  }, [isMobile]);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    console.log('Logged in:', userData.email);
  };

  // EVACUATION PATH STATE
  const [evacuationTarget, setEvacuationTarget] = useState(null);

  // UNIFIED SEARCH HANDLER
  const handleUnifiedSearch = async (loc, lat = null, lon = null) => {
    if (!loc) return;
    setSharedLocation(loc);
    setLoadingRisk(true);
    setEvacuationTarget(null); // Reset path on new search
    try {
      const { checkHazardRisk } = await import('./services/api');
      const data = await checkHazardRisk(loc, lat, lon);
      setSharedRiskData(data);
    } catch (err) {
      console.error('Unified search failed:', err);
    } finally {
      setLoadingRisk(false);
    }
  };

  const handleReset = useCallback(() => {
    setSharedLocation('');
    setSharedRiskData(null);
    setEvacuationTarget(null);
    setActiveFilter('all');
  }, []);

  // REAL-TIME FIRESTORE LISTENER
  const [liveReports, setLiveReports] = useState([]);
  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLiveReports(reports);
    }, (error) => {
      console.error("Firestore Listen Error:", error);
    });
    
    return () => unsubscribe();
  }, []);

  return (
    <div className="dashboard" ref={dashRef}>
      {/* Top Header Bar */}
      <Header
        onLoginClick={() => setShowAuth(true)}
        onThemeToggle={() => setIsDark(prev => !prev)}
        onToggleLeft={() => setLeftOpen(prev => !prev)}
        onToggleRight={() => setRightOpen(prev => !prev)}
        isDark={isDark}
        isMobile={isMobile}
      />

      {/* Left Sidebar: Risk Gauges + Community Incidents */}
      <div className={`left-sidebar glass scanline ${leftOpen ? 'left-sidebar--open' : ''}`}>
        <RiskGauges />
        <NewsFeed reports={liveReports} />
      </div>

      {/* Central Map View — ErrorBoundary must inherit grid-area */}
      <ErrorBoundary fallback="Map failed to load">
        <MapView 
          onSearch={handleUnifiedSearch} 
          onReset={handleReset}
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          evacuationTarget={evacuationTarget}
          sharedLocation={sharedLocation}
        />
      </ErrorBoundary>

      {/* Right Sidebar: Chatbot (hidden on mobile) + Alert Summary */}
      <div className={`right-sidebar glass scanline ${rightOpen ? 'right-sidebar--open' : ''}`}>
        <ChatBot />
        <AlertSummary />
      </div>

      {/* Bottom Panel Group */}
      <div className="bottom-panels glass">
        <ErrorBoundary fallback="Location Data unavailable">
          <LocationData 
            location={sharedLocation} 
            riskData={sharedRiskData} 
            loading={loadingRisk} 
            activeFilter={activeFilter}
          />
        </ErrorBoundary>
        <ErrorBoundary fallback="Image Analyzer unavailable">
          <ImageAnalyzer onAnalysisComplete={(data) => {
            if (data.evacuation_target) {
              setEvacuationTarget(data.evacuation_target);
            }
          }} />
        </ErrorBoundary>
      </div>

      {/* Floating Chatbot FAB — visible only on mobile (CSS controls display) */}
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

      {/* Floating Chat Overlay — shown when FAB is clicked on mobile */}
      {chatOpen && isMobile && (
        <div className="chat-overlay">
          <ChatBot />
        </div>
      )}

      {/* Auth Modal */}
      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
    </div>
  );
}
