import { useState, useEffect, useRef, useMemo } from 'react';
import { Wind, Thermometer, Droplets } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

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

// Direct Plotly.js chart component using DOM rendering
function PlotlyChart({ data, layout }) {
  const containerRef = useRef(null);
  const [, setLoaded] = useState(false);

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

// Shared metric card component for consistency
function MetricCard({ icon: Icon, label, value, color }) {
  return (
    <div className="metric-card" style={{ borderColor: color ? `${color}44` : '' }}>
      <div className="metric-card__icon-wrapper" style={{ color: color || 'var(--accent-cyan)' }}>
        <Icon size={16} strokeWidth={2.5} />
      </div>
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__value" style={{ color: color || 'var(--accent-cyan)' }}>{value}</div>
    </div>
  );
}

export default function LocationData({ location, riskData, loading, activeFilter }) {
  const { language, t } = useLanguage();
  const defaultWeather = { windSpeed: '--', temp: '--', humidity: '--' };

  const isValidLocation = useMemo(() => {
    return !!location?.trim() && /^[a-zA-Z\s\-]+$/.test(location);
  }, [location]);

  const weatherMetrics = useMemo(() => {
    if (!isValidLocation || !riskData?.weather_data_used) return defaultWeather;
    const w = riskData.weather_data_used;
    const windMatch = w.match(/Wind Speed:\s*([\d.]+\s*kph)/i);
    const tempMatch = w.match(/Temperature:\s*([\d.]+)\s*C/i);
    const humMatch = w.match(/Humidity:\s*([\d.]+)%/i);
    return {
      windSpeed: windMatch ? windMatch[1] : defaultWeather.windSpeed,
      temp: tempMatch ? `${tempMatch[1]}°C` : defaultWeather.temp,
      humidity: humMatch ? `${humMatch[1]}%` : defaultWeather.humidity,
    };
  }, [riskData, isValidLocation]);

  const riskScore = useMemo(() => {
    if (!isValidLocation || !riskData?.risk_level) return 0;
    const level = riskData.risk_level.toLowerCase();
    if (level.includes('high')) return 85;
    if (level.includes('medium')) return 55;
    if (level.includes('low')) return 25;
    return 0;
  }, [riskData, isValidLocation]);

  const scoreColor = riskScore >= 70 ? 'var(--accent-red)' : riskScore >= 40 ? 'var(--accent-orange)' : 'var(--accent-green)';

  const hazardChartData = useMemo(() => {
    const years = ['2022', '2023', '2024', '2025'];
    if (!isValidLocation) {
      return [{ x: years, y: [0, 0, 0, 0], type: 'bar', marker: { color: '#1e2a3a' }, name: 'No Data' }];
    }
    const seed = getSeed(location);
    const generateData = (base, mult) => base.map((v, i) => Math.max(2, v + ((seed * mult + i) % 20) - 10));
    
    const traces = [];
    if (activeFilter === 'all' || activeFilter === 'flood') traces.push({ x: years, y: generateData([12, 18, 15, 32], 1), type: 'bar', name: language === 'en' ? 'Flood' : 'Banjir', marker: { color: '#00d4ff' } });
    if (activeFilter === 'all' || activeFilter === 'monsoon') traces.push({ x: years, y: generateData([25, 30, 22, 28], 2), type: 'bar', name: language === 'en' ? 'Monsoon' : 'Monsun', marker: { color: '#d4a843' } });
    if (activeFilter === 'all' || activeFilter === 'wildfire') traces.push({ x: years, y: generateData([5, 12, 8, 15], 3), type: 'bar', name: language === 'en' ? 'Wildfire' : 'Hutan', marker: { color: '#a855f7' } });

    return traces.length > 0 ? traces : [{ x: years, y: [0,0,0,0], type: 'bar', name: 'N/A', marker: { color: '#1e2a3a' } }];
  }, [location, isValidLocation, activeFilter, language]);

  const rainfallData = useMemo(() => {
    const xLabels = language === 'en' ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
    if (!isValidLocation) return [{ x: xLabels, y: new Array(12).fill(0), type: 'scatter', mode: 'lines', line: { color: '#1e2a3a' }, name: 'N/A' }];
    const seed = getSeed(location);
    const dynamicValues = [250, 220, 280, 310, 200, 130, 140, 155, 190, 290, 350, 380].map((v, i) => Math.max(50, v + ((seed * (i + 1)) % 100) - 50));
    return [{ x: xLabels, y: dynamicValues, type: 'scatter', mode: 'lines+markers', line: { color: '#00d4ff', width: 2 }, marker: { size: 4 }, name: t('regionalRainfall') }];
  }, [location, isValidLocation, language, t]);

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-header__title">{t('locationData')}</span>
        {loading && <span className="spinner" />}
      </div>
      <div className="panel-body">
        <div className="risk-score">
          <div>
            <div className="risk-score__label">{t('riskScore')}</div>
            <div className="risk-score__number" style={{ color: scoreColor }}>{riskScore}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/100</span></div>
          </div>
          <div style={{ flex: 1 }}>
            <div className="risk-score__label">
              {isValidLocation ? `${riskData?.primary_hazard || 'Flood'} — ${riskData?.risk_level || 'High'}` : 'N/A — SECURE'}
            </div>
            <div className="risk-score__bar">
              <div className="risk-score__indicator" style={{ left: `${riskScore}%` }} />
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
              {isValidLocation ? (
                (() => {
                  const text = riskData?.explanation || 'Analyzing...';
                  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**')) ? <strong key={i} style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{part.slice(2, -2)}</strong> : part);
                })()
              ) : t('enterLocationMap')}
            </div>
          </div>
        </div>

        <div className="chart-container">
          <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{t('histHazardFreq')}</div>
          <PlotlyChart data={hazardChartData} layout={{ barmode: 'group', bargap: 0.15 }} />
        </div>

        <div className="chart-container">
          <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{t('regionalRainfall')}</div>
          <PlotlyChart data={rainfallData} layout={{}} />
        </div>

        <div className="metric-cards">
          <MetricCard icon={Wind} label={t('windSpeed')} value={weatherMetrics.windSpeed} />
          <MetricCard icon={Thermometer} label={t('temperature')} value={weatherMetrics.temp} color="var(--accent-orange)" />
          <MetricCard icon={Droplets} label={t('humidity')} value={weatherMetrics.humidity} color="var(--accent-blue)" />
        </div>
      </div>
    </div>
  );
}
