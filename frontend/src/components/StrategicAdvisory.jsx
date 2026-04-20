import { useState, useEffect } from 'react';
import { getStrategicAdvisory } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

export default function StrategicAdvisory() {
  const [advisory, setAdvisory] = useState('');
  const [loading, setLoading] = useState(true);
  const { language, t } = useLanguage();

  useEffect(() => {
    async function fetchAdvisory() {
      setLoading(true);
      try {
        const data = await getStrategicAdvisory(language);
        setAdvisory(data.advisory);
        // eslint-disable-next-line no-unused-vars
      } catch (_err) {
        setAdvisory(language === 'en' ? 'Unable to retrieve SitRep.' : 'Gagal mendapatkan SitRep.');
      } finally {
        setLoading(false);
      }
    }
    fetchAdvisory();
    const interval = setInterval(fetchAdvisory, 300000); // Update every 5 minutes
    return () => clearInterval(interval);
  }, [language]);

  return (
    <div className="sitrep-banner fade-in">
      <div className="sitrep-banner__header">
        <div className="sitrep-banner__title-group">
          <span className="sitrep-banner__icon">◈</span>
          <span className="sitrep-banner__title">{t('sitrep')}</span>
        </div>
        <div className="sitrep-banner__badge telemetry">
          {loading ? t('sitrepLoading') : 'MISSION READY'}
        </div>
      </div>
      <div className="sitrep-banner__body">
        {loading ? (
          <div className="sitrep-banner__loading">
             <span className="spinner" />
             <span className="telemetry" style={{ marginLeft: '10px' }}>{t('sitrepLoading')}</span>
          </div>
        ) : (
          <div className="sitrep-banner__content">
            {advisory}
          </div>
        )}
      </div>
    </div>
  );
}
