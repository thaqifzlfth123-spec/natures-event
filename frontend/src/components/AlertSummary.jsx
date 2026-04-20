import { useState, useEffect } from 'react';
import { getLiveNews } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

export default function AlertSummary() {
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

  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-header">
        <span className="panel-header__title">{t('newsCenter')}</span>
        <span className="panel-header__badge panel-header__badge--alert">
          {loading ? 'CONNECTING...' : t('liveFeed')}
        </span>
      </div>
      <div className="panel-body">
        {news.slice(0, 8).map((n, i) => {
          const hasLink = n.url && n.url !== '#';

          return (
            <div
              className={`alert-item fade-in ${hasLink ? 'alert-item--clickable' : ''}`}
              key={i}
              style={{ animationDelay: `${i * 0.1}s`, cursor: hasLink ? 'pointer' : 'default' }}
              onClick={() => {
                // FIX #4: Clicking the entire card opens the specific article URL
                if (hasLink) {
                  window.open(n.url, '_blank', 'noopener,noreferrer');
                }
              }}
            >
              <div className="alert-item__header">
                <span className="alert-item__type" style={{ color: n.tagColor || 'var(--accent-gold)' }}>
                  [{n.tag || 'OFFICIAL UPDATE'}]
                </span>
                <span className="alert-item__time">{n.time}</span>
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
        {news.length === 0 && !loading && (
          <div className="text-muted" style={{ fontSize: '10px', textAlign: 'center', marginTop: '20px' }}>
            {t('newsQuiet')}
          </div>
        )}
      </div>
    </div>
  );
}
