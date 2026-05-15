import { useState, useEffect } from 'react';
import { getStrategicAdvisory } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

// Update: accepts location + userCoords from App.jsx so the SITREP is
// focused on the user's active monitored area rather than generic Malaysia.
export default function StrategicAdvisory({ location = null, userCoords = null }) {
  const [advisory, setAdvisory] = useState('');
  const [loading, setLoading] = useState(true);
  const [isBodyCollapsed, setIsBodyCollapsed] = useState(false);
  const { language, t } = useLanguage();

  useEffect(() => {
    async function fetchAdvisory() {
      setLoading(true);
      try {
        const lat = userCoords?.lat ?? null;
        const lon = userCoords?.lon ?? null;
        // Pass location context so the SITREP focuses on the active area
        const data = await getStrategicAdvisory(language, location || null, lat, lon);
        setAdvisory(data.advisory);
        // eslint-disable-next-line no-unused-vars
      } catch (_err) {
        setAdvisory(language === 'en' ? 'Unable to retrieve SitRep.' : 'Gagal mendapatkan SitRep.');
      } finally {
        setLoading(false);
      }
    }
    fetchAdvisory();
    const interval = setInterval(fetchAdvisory, 300000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, [language, location, userCoords]); // Re-run when location or coords change

  // Badge shows the active area name when one is set
  const badgeLabel = loading
    ? t('sitrepLoading')
    : location
    ? `FOCUS: ${location.toUpperCase()}`
    : 'MISSION READY';

  return (
    <div className="sitrep-banner fade-in">
      <div className="sitrep-banner__header">
        <div className="sitrep-banner__title-group">
          <span className="sitrep-banner__icon">◈</span>
          <span className="sitrep-banner__title">{t('sitrep')}</span>
        </div>
        <div className="sitrep-banner__badge telemetry">
          {badgeLabel}
        </div>
        {/* Collapse/Expand chevron toggle — matches gold accent theme */}
        <button
          onClick={() => setIsBodyCollapsed(prev => !prev)}
          title={isBodyCollapsed ? 'Expand SitRep' : 'Collapse SitRep'}
          style={{
            background: 'transparent',
            border: '1px solid rgba(212,168,67,0.4)',
            color: 'var(--accent-gold)',
            cursor: 'pointer',
            borderRadius: '2px',
            padding: '3px 8px',
            fontSize: '11px',
            lineHeight: 1,
            marginLeft: '8px',
            transition: 'transform 0.25s ease',
            transform: isBodyCollapsed ? 'rotate(180deg)' : 'rotate(0deg)',
            display: 'inline-block',
          }}
        >
          &#x25BC;
        </button>
      </div>
      {!isBodyCollapsed && (
        <div className="sitrep-banner__body">
          {loading ? (
            <div className="sitrep-banner__loading">
               <span className="spinner" />
               <span className="telemetry" style={{ marginLeft: '10px' }}>{t('sitrepLoading')}</span>
            </div>
          ) : (
            <div className="sitrep-banner__content">
              {advisory}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

