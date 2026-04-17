import { useState, useEffect } from 'react';

export default function NewsFeed({ reports = [] }) {
  const [displayReports, setDisplayReports] = useState([]);

  useEffect(() => {
    // Take Top 8 most recent community incidents
    if (reports && reports.length > 0) {
      setDisplayReports(reports.slice(0, 8));
    }
  }, [reports]);

  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-header">
        <span className="panel-header__title">Community Incidents</span>
        <span className="panel-header__badge panel-header__badge--live">
          {reports.length > 0 ? 'USER REPORTED' : 'SCANNING...'}
        </span>
      </div>
      <div className="panel-body">
        {displayReports.length > 0 ? (
          displayReports.map((r, i) => (
            <div className="news-item fade-in" key={r.id || i} style={{ animationDelay: `${i * 0.08}s` }}>
              <div className="news-item__time">
                {r.timestamp?.seconds 
                  ? new Date(r.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                  : 'JUST NOW'}
              </div>
              <div className="news-item__text">
                <strong style={{ color: 'var(--accent-cyan)' }}>{r.hazard || r.type}:</strong> {r.location}
              </div>
              <span
                className="news-item__tag"
                style={{ 
                  background: r.severity === 'High' ? 'rgba(255,71,87,0.15)' : 'rgba(0,212,255,0.15)', 
                  color: r.severity === 'High' ? 'var(--accent-red)' : 'var(--accent-cyan)' 
                }}
              >
                {r.severity}
              </span>
            </div>
          ))
        ) : (
          <div className="text-muted" style={{ fontSize: '10px', textAlign: 'center', marginTop: '20px' }}>
            No community incidents reported in the last 24h.
          </div>
        )}
      </div>
    </div>
  );
}
