import { useState, useEffect } from 'react';
import { getLiveNews } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

// [FIX: Phase 3 - Option A] Accept firmsMarkers prop from App.jsx to merge wildfire alerts into this feed
export default function AlertSummary({ onSelectLocation, firmsMarkers = [] }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  useEffect(() => {
    async function fetchNews() {
      try {
        const liveNews = await getLiveNews();
        if (liveNews && liveNews.length > 0) {
          setNews(liveNews);
        } else {
          setNews([
            { time: t('newsSearching'), text: t('newsSearching'), url: '#', tag: 'SYSTEM' },
          ]);
        }
      } catch (error) {
        console.error("Failed to fetch news:", error);
        setNews([]);
        setNews([]);
      } finally {
        setLoading(false);
      }
    }
    fetchNews();
    const intervalId = setInterval(fetchNews, 60000); // 1 minute refresh for official data
    return () => clearInterval(intervalId);
  }, [t]);

  // [FIX: Phase 3 - Option A] Convert firmsMarkers into news-feed-compatible objects
  // and prepend them to the official news list so wildfires appear at the top
  const firmsNewsItems = firmsMarkers.map((m) => ({
    id: m.id,
    time: m.label?.split('|')[2]?.trim() || 'FIRMS NRT',
    text: `🔥 Wildfire detected near ${m.pos[0].toFixed(3)}°N, ${m.pos[1].toFixed(3)}°E — ${m.label}`,
    url: '#',
    tag: 'NASA FIRMS',
    tagColor: m.severity === 'Critical' ? '#ff0055' : m.severity === 'High' ? '#ff4757' : '#ff9f43',
    lat: m.lat,
    lon: m.lon,
    timestamp: null,
  }));

  const displayNews = [...firmsNewsItems, ...news].slice(0, 10);

  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-header">
        <span className="panel-header__title">{t('newsCenter')}</span>
        <span className="panel-header__badge panel-header__badge--alert">
          {loading ? 'CONNECTING...' : t('liveFeed')}
        </span>
      </div>
      <div className="panel-body">
        {/* [FIX: Phase 3 - Option A] Render combined FIRMS + official news — up to 10 items */}
        {displayNews.map((n, i) => {
          const hasLink = n.url && n.url !== '#';

          return (
            <div
              className={`alert-item fade-in ${hasLink ? 'alert-item--clickable' : ''}`}
              key={i}
              style={{ animationDelay: `${i * 0.1}s`, cursor: hasLink ? 'pointer' : 'default' }}
              onClick={() => {
                // If this news item carries geo coordinates, pan the map to it
                if (n.lat && n.lon && typeof onSelectLocation === 'function') {
                  onSelectLocation(n.lat, n.lon);
                }
                // Standard: open article URL in new tab
                if (hasLink) {
                  window.open(n.url, '_blank', 'noopener,noreferrer');
                }
              }}
            >
              <div className="alert-item__header">
                <span className="alert-item__type" style={{ color: n.tagColor || 'var(--accent-gold)' }}>
                  [{n.tag || 'OFFICIAL UPDATE'}]
                </span>
                <span className="alert-item__time">
                  {(() => {
                    if (!n.timestamp) return n.time;
                    const d = new Date(n.timestamp);
                    const diffMs = new Date() - d;
                    const diffHr = Math.floor(diffMs / 3600000);
                    if (diffHr < 1) return 'JUST NOW';
                    return `${diffHr}h ago`;
                  })()}
                </span>
              </div>
              <div className="alert-item__desc" style={{ marginBottom: '8px' }}>{n.text}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                  className="alert-item__urgency"
                  style={{
                    background: `${n.tagColor || 'var(--accent-cyan)'}22`,
                    color: n.tagColor || 'var(--accent-cyan)'
                  }}
                >
                  {n.tag}
                </span>
                {hasLink && (
                  <span
                    className="telemetry"
                    style={{
                      fontSize: '9px',
                      color: 'var(--accent-cyan)',
                      fontWeight: '700',
                      letterSpacing: '1px',
                      border: '1px solid var(--accent-cyan-dim)',
                      padding: '2px 8px',
                      borderRadius: '2px',
                      transition: 'background 0.15s',
                    }}
                  >
                    READ MORE →
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {displayNews.length === 0 && !loading && (
          <div className="text-muted" style={{ fontSize: '10px', textAlign: 'center', marginTop: '20px' }}>
            {t('newsQuiet')}
          </div>
        )}
      </div>
    </div>
  );
}
