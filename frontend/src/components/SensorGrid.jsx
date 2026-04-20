import { useState, useEffect } from 'react';

export default function SensorGrid() {
  const [sensors, setSensors] = useState([
    { id: 'flood',    name: 'Flood Sensors',            sub: '922 online',       value: 922,    color: 'var(--accent-blue)' },
    { id: 'river',    name: 'River Level Monitors',     sub: 'DID Stations',     value: 312,    color: 'var(--accent-cyan)' },
    { id: 'reports',  name: 'Community Reports',        sub: 'Verified Pins',    value: 173,    color: 'var(--accent-green)' },
    { id: 'responders', name: 'Active Responders',      sub: 'NADMA / Bomba',    value: 46,     color: 'var(--accent-gold)' },
  ]);

  // Live simulation: slightly fluctuate values every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setSensors(prev => prev.map(s => {
        // Randomly add/subtract 1 or 2
        const fluctuation = Math.floor(Math.random() * 5) - 2; 
        const newValue = Math.max(0, s.value + fluctuation);
        
        let newSub = s.sub;
        if (s.id === 'flood') newSub = `${newValue} online`;
        
        return { ...s, value: newValue, sub: newSub };
      }));
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-header">
        <span className="panel-header__title">Sensor Grid</span>
        <span className="panel-header__badge panel-header__badge--live">LIVE</span>
      </div>
      <div className="panel-body">
        {sensors.map((s) => (
          <div className="sensor-item" key={s.id}>
            <div className="sensor-item__label">
              <span className="sensor-item__dot" style={{ 
                background: s.color,
                boxShadow: `0 0 8px ${s.color}`,
                animation: 'pulse-glow 2s infinite'
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
