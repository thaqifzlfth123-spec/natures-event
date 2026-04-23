import { useState, useEffect } from 'react';
import { reverseGeocode } from '../services/geoService';

// Severity color map with Critical status
const SEVERITY_STYLES = {
  Critical: { bg: 'rgba(255,0,128,0.2)',  color: '#ff0080', pulse: true },
  High:     { bg: 'rgba(255,71,87,0.15)',  color: 'var(--accent-red)' },
  Medium:   { bg: 'rgba(255,159,67,0.15)', color: 'var(--accent-orange)' },
  Low:      { bg: 'rgba(0,230,118,0.15)',  color: 'var(--accent-green)' },
  Unknown:  { bg: 'rgba(0,212,255,0.12)',  color: 'var(--accent-cyan)' },
};

// Global cache for resolved districts to minimize API hits
const districtCache = new Map();

function capitalize(str) {
  if (!str) return 'Unknown';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Sub-component to handle async district name resolution
function DistrictLabel({ pos }) {
  const [label, setLabel] = useState('Locating...');

  useEffect(() => {
    if (!Array.isArray(pos) || pos.length !== 2) {
      setLabel('Unknown');
      return;
    }

    const cacheKey = `${pos[0].toFixed(3)},${pos[1].toFixed(3)}`;
    if (districtCache.has(cacheKey)) {
      setLabel(districtCache.get(cacheKey));
      return;
    }

    let isMounted = true;
    reverseGeocode(pos[0], pos[1]).then(data => {
      if (isMounted) {
        const district = data.district || data.city || 'Unknown';
        districtCache.set(cacheKey, district);
        setLabel(district);
      }
    });

    return () => { isMounted = false; };
  }, [pos]);

  return <span className="telemetry" style={{ color: 'var(--accent-cyan)' }}>{label}</span>;
}

function formatTimestamp(ts) {
  if (!ts) return { date: '--', time: 'JUST NOW' };
  const ms = ts.seconds ? ts.seconds * 1000 : (ts._seconds ? ts._seconds * 1000 : null);
  if (!ms) return { date: '--', time: 'JUST NOW' };
  
  const d = new Date(ms);
  // Format: DD MMM YYYY, HH:mm
  const dateStr = d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: false });
  
  return { full: `${dateStr}, ${timeStr}` };
}

export default function NewsFeed({ reports = [] }) {
  const [displayReports, setDisplayReports] = useState([]);

  useEffect(() => {
    // 1. FILTERING: Remove 'Unknown' types and entries with no data
    const filtered = reports.filter(r => {
      const type = (r.type || r.hazard || '').toLowerCase();
      const hasDesc = (r.text || r.description || '').trim().length > 0;
      return type !== 'unknown' && type !== '' && hasDesc;
    });

    // 2. NEWEST ONLY: Take top 10
    setDisplayReports(filtered.slice(0, 10));
  }, [reports]);

  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-header">
        <span className="panel-header__title">Community Intelligence</span>
        <span className="panel-header__badge panel-header__badge--live">
          {displayReports.length > 0 ? 'LIVE FEED' : 'MONITORING'}
        </span>
      </div>
      <div className="panel-body" style={{ padding: '0 12px' }}>
        {displayReports.length > 0 ? (
          displayReports.map((r, i) => {
            const { full } = formatTimestamp(r.timestamp);
            const severity = r.severity || 'Unknown';
            const sevStyle = SEVERITY_STYLES[severity] || SEVERITY_STYLES.Unknown;
            const typeName = capitalize(r.hazard || r.type);
            const description = r.text || r.description || '';
            const reporter = r.reporter || r.userId || 'USER_' + (r.id ? r.id.substring(0, 4) : 'ANON');

            return (
              <div 
                className={`news-item fade-in ${sevStyle.pulse ? 'pulse-border' : ''}`} 
                key={r.id || i} 
                style={{ 
                  animationDelay: `${i * 0.08}s`,
                  borderLeft: `3px solid ${sevStyle.color}`,
                  paddingLeft: '12px',
                  marginBottom: '8px',
                  marginTop: '8px',
                  background: 'rgba(255,255,255,0.02)'
                }}
              >
                {/* Header: Time + Reporter */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '4px', color: 'var(--text-muted)' }}>
                  <span className="telemetry">{full}</span>
                  <span className="telemetry" style={{ color: 'var(--accent-gold)' }}>ID: {reporter}</span>
                </div>
                
                {/* Content: Type + District */}
                <div style={{ fontSize: '11px', marginBottom: '6px' }}>
                  <strong style={{ color: sevStyle.color }}>{typeName}</strong>
                  <span style={{ margin: '0 6px', opacity: 0.3 }}>|</span>
                  <DistrictLabel pos={r.pos} />
                </div>
                
                {/* Description */}
                <div style={{ fontSize: '10px', color: 'var(--text-primary)', opacity: 0.8, lineHeight: '1.4', marginBottom: '10px' }}>
                  {description}
                </div>
                
                {/* Footer: Severity */}
                <span
                  className="news-item__tag"
                  style={{ 
                    background: sevStyle.bg, 
                    color: sevStyle.color, 
                    fontSize: '8px', 
                    fontWeight: '800',
                    padding: '2px 6px',
                    borderRadius: '2px',
                    letterSpacing: '1px'
                  }}
                >
                  {severity.toUpperCase()}
                </span>
              </div>
            );
          })
        ) : (
          <div className="empty-state">
            <div className="empty-state__icon">📡</div>
            <div className="empty-state__text">No Recent Community Incidents Reported</div>
            <div style={{ fontSize: '8px', color: 'var(--text-muted)', marginTop: '5px' }}>SCANNING MALAYSIAN GEOSPATIAL SECTORS...</div>
          </div>
        )}
      </div>
    </div>
  );
}
