import { useState, useRef, useMemo, useEffect } from 'react';
import { Wind, Thermometer, Droplets } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { fetchHistoricalHazards, fetchLiveLocationData } from '../services/api';

function PlotlyChart({ data, layout }) {
  const containerRef = useRef(null);
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
    });
    return () => { cancelled = true; };
  }, [data, layout]);
  return <div ref={containerRef} style={{ width: '100%', minHeight: 120 }} />;
}

function MetricCard({ icon: Icon, label, value, color }) {
  return (
    <div className="metric-card" style={{ borderColor: color ? `${color}44` : '' }}>
      <div className="metric-card__icon-wrapper" style={{ color: color || 'var(--accent-cyan)' }}>
        {Icon && <Icon size={16} />}
      </div>
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__value" style={{ color: color || 'var(--accent-cyan)' }}>{value}</div>
    </div>
  );
}

// userCoords: { lat, lon } from App.jsx — enables live Open-Meteo rainfall data.
// When absent, falls back to deterministic seed-based data.
export default function LocationData({ location, riskData, loading, activeFilter, userCoords = null }) {
  const { language, t } = useLanguage();
  const [histData, setHistData] = useState(null);
  const [rainfallSource, setRainfallSource] = useState('baseline'); // 'open-meteo' | 'baseline'

  const isValidLocation = useMemo(() => !!location?.trim(), [location]);

  useEffect(() => {
    if (!isValidLocation) {
      setHistData(null);
      setRainfallSource('baseline');
      return;
    }

    const lat = userCoords?.lat;
    const lon = userCoords?.lon;

    if (lat != null && lon != null) {
      // Prefer live data when we have coordinates
      fetchLiveLocationData(lat, lon, location)
        .then(data => {
          if (data) {
            setHistData(data);
            setRainfallSource(data.rainfall_source || 'open-meteo');
          } else {
            // fetchLiveLocationData returned null (network error) — fall back
            return fetchHistoricalHazards(location).then(d => {
              setHistData(d);
              setRainfallSource('baseline');
            });
          }
        })
        .catch(console.error);
    } else {
      // No coordinates — use location-string endpoint
      fetchHistoricalHazards(location)
        .then(data => { setHistData(data); setRainfallSource('baseline'); })
        .catch(console.error);
    }
  }, [location, isValidLocation, userCoords]);

  const hazardChartData = useMemo(() => {
    const years = histData?.years || ['2022', '2023', '2024', '2025'];
    if (!histData) return [{ x: years, y: [0, 0, 0, 0], type: 'bar', marker: { color: '#1e2a3a' }, name: 'N/A' }];
    
    return histData.hazards
      .filter(h => activeFilter === 'all' || h.name.toLowerCase().includes(activeFilter))
      .map(h => ({
        x: years,
        y: h.data,
        type: 'bar',
        name: h.name,
        marker: { color: h.color }
      }));
  }, [histData, activeFilter]);

  const rainfallData = useMemo(() => {
    const xLabels = language === 'en' ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
    const yData = histData?.rainfall || new Array(12).fill(0);
    return [{ 
      x: xLabels, 
      y: yData, 
      type: 'scatter', 
      mode: 'lines+markers', 
      line: { color: 'var(--accent-cyan)', width: 2 }, 
      marker: { size: 4 }, 
      name: t('regionalRainfall') 
    }];
  }, [histData, language, t]);

  const weatherMetrics = useMemo(() => {
    if (!riskData?.weather_data_used) return { windSpeed: '--', temp: '--', humidity: '--' };
    const w = riskData.weather_data_used;
    const windMatch = w.match(/Wind Speed:\s*([\d.]+\s*kph)/i);
    const tempMatch = w.match(/Temperature:\s*([\d.]+)\s*C/i);
    const humMatch = w.match(/Humidity:\s*([\d.]+)%/i);
    return {
      windSpeed: windMatch ? windMatch[1] : '--',
      temp: tempMatch ? `${tempMatch[1]}°C` : '--',
      humidity: humMatch ? `${humMatch[1]}%` : '--',
    };
  }, [riskData]);

  const riskScore = riskData?.risk_level ? (riskData.risk_level.toLowerCase().includes('high') ? 85 : riskData.risk_level.toLowerCase().includes('medium') ? 55 : 25) : 0;
  const scoreColor = riskScore >= 70 ? 'var(--accent-red)' : riskScore >= 40 ? 'var(--accent-orange)' : 'var(--accent-green)';

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
            <div className="risk-score__label">{isValidLocation ? `${riskData?.primary_hazard || 'Hazard Scan'} — ${riskData?.risk_level || 'Normal'}` : 'N/A — SECURE'}</div>
            <div className="risk-score__bar"><div className="risk-score__indicator" style={{ left: `${riskScore}%` }} /></div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>{isValidLocation ? (riskData?.explanation || 'Analyzing tactical data...') : t('enterLocationMap')}</div>
          </div>
        </div>
        <div className="chart-container">
          <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>{t('histHazardFreq')}</div>
          <PlotlyChart data={hazardChartData} layout={{ barmode: 'group' }} />
        </div>
        <div className="chart-container">
          <div style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{t('regionalRainfall')}</span>
            <span style={{
              fontSize: 8,
              padding: '1px 5px',
              borderRadius: 3,
              background: rainfallSource === 'open-meteo' ? 'rgba(0,212,255,0.15)' : 'rgba(100,100,100,0.2)',
              color: rainfallSource === 'open-meteo' ? 'var(--accent-cyan)' : 'var(--text-muted)',
              letterSpacing: 0.5,
            }}>
              {rainfallSource === 'open-meteo' ? 'LIVE · OPEN-METEO' : 'BASELINE'}
            </span>
          </div>
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
