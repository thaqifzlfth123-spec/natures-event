import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { checkHazardRisk } from '../services/api';

// Direct Plotly.js chart component using DOM rendering (avoids react-plotly.js compatibility issues)
function PlotlyChart({ data, layout }) {
  const containerRef = useRef(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import('plotly.js-dist-min').then((Plotly) => {
      if (cancelled || !containerRef.current) return;
      const PlotlyLib = Plotly.default || Plotly;
      PlotlyLib.newPlot(containerRef.current, data, {
        height: 120,
        margin: { t: 20, b: 30, l: 35, r: 10 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'JetBrains Mono', size: 9, color: '#8899aa' },
        xaxis: { gridcolor: '#1e2a3a', linecolor: '#1e2a3a' },
        yaxis: { gridcolor: '#1e2a3a', linecolor: '#1e2a3a' },
        ...layout,
      }, { displayModeBar: false, responsive: true });
      setLoaded(true);
    }).catch(err => console.warn('Plotly load error:', err));

    return () => { cancelled = true; };
  }, [data, layout]);

  return <div ref={containerRef} style={{ width: '100%', minHeight: 120 }} />;
}

export default function LocationData() {
  const [riskData, setRiskData] = useState(null);
  const [location, setLocation] = useState('Kuala Lumpur');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  // Default mock weather values (will be replaced by API response)
  const defaultWeather = { windSpeed: '15 kph', temp: '28°C', humidity: '85%' };

  // Fetch risk from backend API
  const fetchRisk = useCallback(async (loc) => {
    setLoading(true);
    try {
      // This calls POST /api/risk on the FastAPI backend
      // Backend requires GROQ_API_KEY and WEATHER_API_KEY in .env
      const data = await checkHazardRisk(loc);
      setRiskData(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRisk(location);
  }, []); //potential error here

  // Parse weather data from API response for metric cards
  const weatherMetrics = useMemo(() => {
    if (!riskData?.weather_data_used) return defaultWeather;
    const w = riskData.weather_data_used;
    const windMatch = w.match(/Wind Speed:\s*([\d.]+\s*kph)/i);
    const tempMatch = w.match(/Temperature:\s*([\d.]+)\s*C/i);
    const humMatch = w.match(/Humidity:\s*([\d.]+)%/i);
    return {
      windSpeed: windMatch ? windMatch[1] : defaultWeather.windSpeed,
      temp: tempMatch ? `${tempMatch[1]}°C` : defaultWeather.temp,
      humidity: humMatch ? `${humMatch[1]}%` : defaultWeather.humidity,
    };
  }, [riskData]);

  // Calculate risk score from risk_level
  const riskScore = useMemo(() => {
    if (!riskData?.risk_level) return 72;
    const level = riskData.risk_level.toLowerCase();
    if (level.includes('high')) return 85;
    if (level.includes('medium')) return 55;
    if (level.includes('low')) return 25;
    return 72;
  }, [riskData]);

  const scoreColor = riskScore >= 70 ? 'var(--accent-red)' : riskScore >= 40 ? 'var(--accent-orange)' : 'var(--accent-green)';

  // Historical flood frequency chart data (memoized to prevent re-render loops)
  const floodChartData = useMemo(() => [{
    x: ['2019', '2020', '2021', '2022', '2023', '2024', '2025'],
    y: [12, 18, 15, 32, 28, 35, 22],
    type: 'bar',
    marker: { color: ['#0099bb', '#0099bb', '#0099bb', '#ff4757', '#ff9f43', '#ff4757', '#0099bb'] },
    name: 'Flood Events',
  }], []);

  // Rainfall comparison chart data
  const rainfallData = useMemo(() => [{
    x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    y: [250, 220, 280, 310, 200, 130, 140, 155, 190, 290, 350, 380],
    type: 'scatter',
    mode: 'lines+markers',
    line: { color: '#00d4ff', width: 2 },
    marker: { size: 4 },
    name: 'Rainfall (mm)',
  }], []);

  const floodLayout = useMemo(() => ({ bargap: 0.3 }), []);
  const rainfallLayout = useMemo(() => ({}), []);

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-header__title">Location Data & Analysis</span>
        {loading && <span className="spinner" />}
      </div>
      <div className="panel-body">
        {/* Location search within this panel */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input
            ref={inputRef}
            className="map-search__input"
            style={{ width: '100%', fontSize: '10px', padding: '6px 10px' }}
            placeholder="Enter location for risk analysis..."
            defaultValue={location}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                setLocation(e.target.value);
                fetchRisk(e.target.value);
              }
            }}
          />
        </div>

        {/* Risk Score */}
        <div className="risk-score">
          <div>
            <div className="risk-score__label">Risk Score</div>
            <div className="risk-score__number" style={{ color: scoreColor }}>{riskScore}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/100</span></div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="risk-score__label">{riskData?.primary_hazard || 'Flood'} — {riskData?.risk_level || 'High'}</div>
            <div className="risk-score__bar">
              <div className="risk-score__indicator" style={{ left: `${riskScore}%` }} />
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
              {riskData?.explanation || 'Loading analysis...'}
            </div>
          </div>
        </div>

        {/* Plotly Charts */}
        <div className="chart-container">
          <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Historical Flood Frequency</div>
          <PlotlyChart data={floodChartData} layout={floodLayout} />
        </div>

        <div className="chart-container">
          <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>Regional Rainfall (mm)</div>
          <PlotlyChart data={rainfallData} layout={rainfallLayout} />
        </div>

        {/* Weather Metric Cards */}
        <div className="metric-cards">
          <div className="metric-card">
            <div className="metric-card__label">Wind Speed</div>
            <div className="metric-card__value">{weatherMetrics.windSpeed}</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__label">Temperature</div>
            <div className="metric-card__value">{weatherMetrics.temp}</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__label">Humidity</div>
            <div className="metric-card__value">{weatherMetrics.humidity}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
