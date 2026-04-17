import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

export default function Header({ onLoginClick, onThemeToggle, onToggleLeft, onToggleRight, isDark, isMobile }) {
  const [time, setTime] = useState(new Date());
  const [activeRegion, setActiveRegion] = useState('REGIONS');
  const [menuOpen, setMenuOpen] = useState(false);
  const { language, toggleLanguage, t } = useLanguage();

  // Auto-update timestamp every second
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = time.toLocaleString(language === 'en' ? 'en-MY' : 'ms-MY', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });

  const regions = [
    { key: 'regions', label: t('regions') },
    { key: 'district', label: t('district') },
    { key: 'myLocations', label: t('myLocations') }
  ];

  return (
    <header className="header">
      {/* Logo */}
      <div className="header__logo">
        <div className="header__logo-icon" />
        <span style={{ letterSpacing: '4px', background: 'linear-gradient(90deg, #fff, #8899aa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textTransform: 'uppercase' }}>
          {t('logo')}
        </span>
      </div>

      {/* Region Filter Buttons (Desktop) */}
      <nav className="header__nav">
        {regions.map(r => (
          <button
            key={r.key}
            className={`header__nav-btn ${activeRegion === r.key ? 'header__nav-btn--active' : ''}`}
            onClick={() => setActiveRegion(r.key)}
          >
            {r.label}
          </button>
        ))}
      </nav>

      {/* Right Section: Timestamp, Status, Login, Theme, Lang (Desktop) */}
      <div className="header__right">
        <span className="header__timestamp telemetry">{t('lastSync')}: {formattedTime}</span>
        <span className="header__status header__status--high">{t('highAlert')}</span>
        
        {/* Language Toggle */}
        <button 
          className="header__login-btn" 
          onClick={toggleLanguage}
          style={{ borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)', minWidth: '60px' }}
        >
          {language === 'en' ? 'EN' : 'BM'}
        </button>

        <button className="header__login-btn" onClick={onLoginClick}>
          {t('loginRegister')}
        </button>
        <button className="header__theme-btn" onClick={onThemeToggle} title="Toggle theme">
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Hamburger / Toggle Buttons (Mobile only) */}
      <div className="header__mobile-controls">
        <button
          className="header__toggle-btn"
          onClick={onToggleLeft}
          title="Tactical Menu"
        >
          ☰
        </button>
        <button
          className="header__toggle-btn"
          onClick={onToggleRight}
          title="Data Feed"
        >
          📡
        </button>
        <button
          className="header__hamburger"
          onClick={() => setMenuOpen(prev => !prev)}
          title="Settings"
        >
          {menuOpen ? '✕' : '⚙️'}
        </button>
      </div>

      {/* Mobile Dropdown Menu */}
      <div className={`header__mobile-menu ${menuOpen ? 'header__mobile-menu--open' : ''}`}>
        <nav className="header__nav">
          {regions.map(r => (
            <button
              key={r.key}
              className={`header__nav-btn ${activeRegion === r.key ? 'header__nav-btn--active' : ''}`}
              onClick={() => { setActiveRegion(r.key); setMenuOpen(false); }}
            >
              {r.label}
            </button>
          ))}
        </nav>
        <div className="header__right">
          <button className="header__nav-btn" style={{ width: '100%' }} onClick={toggleLanguage}>
             LANGUAGE: {language === 'en' ? 'ENGLISH' : 'BAHASA MELAYU'}
          </button>
          <span className="header__timestamp">{t('lastSync')}: {formattedTime}</span>
          <span className="header__status header__status--high">{t('highAlert')}</span>
          <button className="header__login-btn" onClick={() => { onLoginClick(); setMenuOpen(false); }}>
            {t('loginRegister')}
          </button>
          <button className="header__theme-btn" onClick={onThemeToggle} title="Toggle theme">
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </header>
  );
}
