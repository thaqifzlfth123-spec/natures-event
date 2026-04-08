import { checkHazardRisk } from '../services/api';
 
// Simple hash function to generate a numeric seed from a string
const getSeed = (str) => {
  if (!str) return 42;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

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
  const [location, setLocation] = useState('');
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
    if (location) {
      fetchRisk(location);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally fetch only on mount if location is set

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
    // Return 0 if location is empty or contains numbers/special characters
    if (!location.trim() || !/^[a-zA-Z\s\-]+$/.test(location)) return 0;
    
    if (!riskData?.risk_level) return 0;
    const level = riskData.risk_level.toLowerCase();
    if (level.includes('high')) return 85;
    if (level.includes('medium')) return 55;
    if (level.includes('low')) return 25;
    return 0;
  }, [riskData, location]);

  const scoreColor = riskScore >= 70 ? 'var(--accent-red)' : riskScore >= 40 ? 'var(--accent-orange)' : 'var(--accent-green)';

  // Historical flood frequency chart data (memoized to react to location changes)
  const floodChartData = useMemo(() => {
    const seed = getSeed(location || 'Malaysia');
    const baseValues = [12, 18, 15, 32, 28, 35, 22];
    // Generate unique pattern based on location seed
    const dynamicValues = baseValues.map((v, i) => {
      const shift = ((seed + i) % 20) - 10;
      return Math.max(2, v + shift);
    });

    return [{
      x: ['2019', '2020', '2021', '2022', '2023', '2024', '2025'],
      y: dynamicValues,
      type: 'bar',
      marker: { 
        color: dynamicValues.map(v => v > 30 ? '#ff4757' : v > 20 ? '#ff9f43' : '#0099bb') 
      },
      name: 'Flood Events',
    }];
  }, [location]);

  // Rainfall comparison chart data (memoized to react to location changes)
  const rainfallData = useMemo(() => {
    const seed = getSeed(location || 'Malaysia');
    const baseValues = [250, 220, 280, 310, 200, 130, 140, 155, 190, 290, 350, 380];
    // Generate unique pattern based on location seed
    const dynamicValues = baseValues.map((v, i) => {
      const shift = ((seed * (i + 1)) % 100) - 50;
      return Math.max(50, v + shift);
    });

    return [{
      x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      y: dynamicValues,
      type: 'scatter',
      mode: 'lines+markers',
      line: { color: '#00d4ff', width: 2 },
      marker: { size: 4 },
      name: 'Rainfall (mm)',
    }];
  }, [location]);

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
            placeholder="ENTER YOUR LOCATION"
            defaultValue={location}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const val = e.target.value.trim();
                setLocation(val);
                fetchRisk(val);
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
