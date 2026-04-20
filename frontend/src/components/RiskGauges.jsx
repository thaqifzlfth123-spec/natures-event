import { useLanguage } from '../context/LanguageContext';

export default function RiskGauges() {
  const { t } = useLanguage();

  const gauges = [
    { name: t('histFloodRisk'),   value: 78, level: t('levelHigh'),   color: 'var(--accent-red)' },
    { name: t('monsoonSeverity'),   value: 62, level: '62/100', color: 'var(--accent-orange)' },
    { name: t('seaLevel'),      value: 45, level: '3.37',   color: 'var(--accent-gold)' },
    { name: t('deforestation'), value: 22, level: '6.15%',  color: 'var(--accent-green)' },
    { name: t('earthquakeProb'),   value: 15, level: t('levelLow'),    color: 'var(--accent-cyan)' },
    { name: t('landslideRisk'),     value: 55, level: t('levelMed'),    color: 'var(--accent-orange)' },
  ];

  return (
    <div className="panel" style={{ flex: 0 }}>
      <div className="panel-header">
        <span className="panel-header__title">{t('riskGauges')}</span>
        <span className="panel-header__badge panel-header__badge--alert">{t('stress')}</span>
      </div>
      <div className="panel-body">
        {gauges.map((g, i) => (
          <div className="risk-gauge" key={i}>
            <div className="risk-gauge__label">
              <span className="risk-gauge__name">{g.name}</span>
              <span className="risk-gauge__value telemetry" style={{ color: g.color }}>{g.level}</span>
            </div>
            <div className="risk-gauge__bar">
              <div
                className="risk-gauge__fill"
                style={{ 
                  width: `${g.value}%`, 
                  background: `linear-gradient(90deg, ${g.color}88, ${g.color})`,
                  boxShadow: `0 0 8px ${g.color}aa`
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
