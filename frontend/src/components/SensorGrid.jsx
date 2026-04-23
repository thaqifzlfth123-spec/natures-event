import { useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function SensorGrid({ nearbyHazards = [] }) {
  const { t, language } = useLanguage();

  const menuItems = useMemo(() => {
    // Group nearby hazards by type
    const counts = nearbyHazards.reduce((acc, h) => {
      const type = h.type?.toLowerCase() || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    return [
      { 
        id: 'nearby_total', 
        name: language === 'en' ? 'Nearby Threats' : 'Ancaman Berdekatan', 
        sub: '50km Radius', 
        value: nearbyHazards.length, 
        color: nearbyHazards.length > 0 ? 'var(--accent-red)' : 'var(--accent-green)' 
      },
      { 
        id: 'nearby_floods', 
        name: language === 'en' ? 'Active Floods' : 'Banjir Aktif', 
        sub: 'Tactical Sectors', 
        value: counts['flood'] || 0, 
        color: 'var(--accent-cyan)' 
      },
      { 
        id: 'nearby_storm', 
        name: language === 'en' ? 'Storm Activity' : 'Aktiviti Ribut', 
        sub: 'MetMal Alert', 
        value: (counts['monsoon'] || 0) + (counts['storm'] || 0), 
        color: 'var(--accent-gold)' 
      },
      { 
        id: 'nearby_critical', 
        name: language === 'en' ? 'Critical Events' : 'Kejadian Kritikal', 
        sub: 'Immediate Priority', 
        value: nearbyHazards.filter(h => h.severity === 'Critical').length, 
        color: '#ff0080' 
      },
    ];
  }, [nearbyHazards, language]);

  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-header">
        <span className="panel-header__title">{language === 'en' ? 'Tactical Menu' : 'Menu Taktikal'}</span>
        <span className="panel-header__badge panel-header__badge--live">LIVE</span>
      </div>
      <div className="panel-body">
        {menuItems.map((s) => (
          <div className="sensor-item" key={s.id}>
            <div className="sensor-item__label">
              <span className="sensor-item__dot" style={{ 
                background: s.color,
                boxShadow: `0 0 8px ${s.color}`,
                animation: s.value > 0 ? 'pulse-glow 2s infinite' : 'none'
              }} />
              <div>
                {s.name}
                <div className="sensor-item__sub">{s.sub}</div>
              </div>
            </div>
            <span className="sensor-item__value telemetry fade-in" style={{ color: s.color }}>
              {s.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
