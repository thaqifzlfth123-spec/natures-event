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
        {news.slice(0, 8).map((n, i) => (
          <div className="alert-item fade-in" key={i} style={{ animationDelay: `${i * 0.1}s` }}>
            <div className="alert-item__header">
              <span className="alert-item__type" style={{ color: n.tagColor || 'var(--accent-gold)' }}>
                [{n.tag === 'SYSTEM' ? 'SYSTEM' : t('officialUpdate')}]
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
              {n.url && n.url !== '#' && (
                <a 
                  href={n.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="telemetry"
                  style={{ 
                    fontSize: '9px', 
                    color: 'var(--accent-cyan)', 
                    textDecoration: 'none',
                    fontWeight: '700',
                    letterSpacing: '1px',
                    border: '1px solid var(--accent-cyan-dim)',
                    padding: '2px 8px',
                    borderRadius: '2px'
                  }}
                  onMouseOver={(e) => e.target.style.background = 'var(--accent-cyan-dim)'}
                  onMouseOut={(e) => e.target.style.background = 'transparent'}
                >
                  {t('clickHere')}
                </a>
              )}
            </div>
          </div>
        ))}
        {news.length === 0 && !loading && (
          <div className="text-muted" style={{ fontSize: '10px', textAlign: 'center', marginTop: '20px' }}>
            {t('newsQuiet')}
          </div>
        )}
      </div>
    </div>
  );
}
