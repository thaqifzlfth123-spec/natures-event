import { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import Header from './components/Header';
import RiskGauges from './components/RiskGauges';
import NewsFeed from './components/NewsFeed';
import LocationData from './components/LocationData';
import ImageAnalyzer from './components/ImageAnalyzer';
import ChatBot from './components/ChatBot';
import AlertSummary from './components/AlertSummary';
import AuthModal from './components/AuthModal';
import StrategicAdvisory from './components/StrategicAdvisory';
import { db } from './services/firebaseConfig';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useLanguage } from './context/LanguageContext';

const MapView = lazy(() => import('./components/MapView'));

export default function App() {
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

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    if (isMobile) return;
    const el = dashRef.current;
    if (!el) return;
    const preventScroll = () => { el.scrollTop = 0; el.scrollLeft = 0; };
    preventScroll();
    el.addEventListener('scroll', preventScroll);
    return () => el.removeEventListener('scroll', preventScroll);
  }, [isMobile]);

  const handleLoginSuccess = (userData) => { setUser(userData); };
  const [evacuationTarget, setEvacuationTarget] = useState(null);

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
    setEvacuationTarget(null);
    setActiveFilter('all');
  }, []);

  const [liveReports, setLiveReports] = useState([]);
  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("timestamp", "desc"));
    return onSnapshot(q, (snapshot) => {
      setLiveReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
  }, []);

  return (
    <div className="dashboard" ref={dashRef}>
      <Header
        onLoginClick={() => setShowAuth(true)}
        onThemeToggle={() => setIsDark(prev => !prev)}
        onToggleLeft={() => setLeftOpen(prev => !prev)}
        onToggleRight={() => setRightOpen(prev => !prev)}
        isDark={isDark}
        isMobile={isMobile}
      />

      <div className={`left-sidebar glass scanline ${leftOpen ? 'left-sidebar--open' : ''}`}>
        <RiskGauges />
        <NewsFeed reports={liveReports} />
      </div>

      <div className="map-container-wrapper" style={{ position: 'relative', gridArea: 'map', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'absolute', top: '15px', left: '15px', right: '15px', zIndex: 1000, pointerEvents: 'none' }}>
           <div style={{ pointerEvents: 'auto' }}>
              <StrategicAdvisory />
           </div>
        </div>
        <ErrorBoundary fallback="Map failed to load">
          <Suspense fallback={<div className="panel-body text-muted">BOOTING TACTICAL MAP...</div>}>
            <MapView 
              onSearch={handleUnifiedSearch} 
              onReset={handleReset}
              activeFilter={activeFilter}
              setActiveFilter={setActiveFilter}
              evacuationTarget={evacuationTarget}
              sharedLocation={sharedLocation}
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      <div className={`right-sidebar glass scanline ${rightOpen ? 'right-sidebar--open' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <ChatBot />
        <AlertSummary />
      </div>

      <div className="bottom-panels glass" style={{ height: '100%', overflow: 'hidden' }}>
        <ErrorBoundary fallback="Image Analyzer unavailable">
          <ImageAnalyzer onAnalysisComplete={(data) => { if (data.evacuation_target) setEvacuationTarget(data.evacuation_target); }} />
        </ErrorBoundary>
        <ErrorBoundary fallback="Location Data unavailable">
          <LocationData location={sharedLocation} riskData={sharedRiskData} loading={loadingRisk} activeFilter={activeFilter} />
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
