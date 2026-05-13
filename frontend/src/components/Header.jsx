import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

export default function Header({
  onLoginClick, onThemeToggle, onToggleLeft, onToggleRight, isDark,
  onSearch, onReset, activeRegion, setActiveRegion, onGetLocation, onSaveLocation,
  notificationsEnabled, onToggleNotifications, savedLocations, isHighAlert
}) {
  const [time, setTime] = useState(new Date());
  const [menuOpen, setMenuOpen] = useState(false);
  const { language, toggleLanguage, t } = useLanguage();
  const { user, logout } = useAuth();
  const [locDropdownOpen, setLocDropdownOpen] = useState(false);

  // FIX #3: Hover-reveal search bar state
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [isSearchPinned, setIsSearchPinned] = useState(false);
  const [searchVal, setSearchVal] = useState('');

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

  const regionsList = [
    'Johor', 'Kedah', 'Kelantan', 'Malacca', 'Negeri Sembilan', 'Pahang',
    'Penang', 'Perak', 'Perlis', 'Sabah', 'Sarawak', 'Selangor',
    'Terengganu', 'Kuala Lumpur', 'Labuan', 'Putrajaya'
  ];

  const handleSearchSubmit = () => {
    if (!searchVal.trim()) return;
    if (typeof onSearch === 'function') {
      onSearch(searchVal);
    }
    // Keep it pinned if searched
    setIsSearchPinned(true);
  };

  const handleSearchReset = () => {
    setSearchVal('');
    setSearchExpanded(false);
    setIsSearchPinned(false);
    if (typeof onReset === 'function') {
      onReset();
    }
  };

  return (
    <header className="header">
      {/* Logo */}
      <div className="header__logo">
        <div className="header__logo-icon" />
        <span style={{ letterSpacing: '4px', background: 'linear-gradient(90deg, #fff, #8899aa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textTransform: 'uppercase' }}>
          {t('logo')}
        </span>
      </div>

      {/* Locations Group Dropdown (Desktop) */}
      <nav className="header__nav" style={{ position: 'relative', zIndex: 9000 }}>
        <button
          className={`header__nav-btn ${locDropdownOpen ? 'header__nav-btn--active' : ''}`}
          onClick={() => setLocDropdownOpen(!locDropdownOpen)}
        >
          {t('regions')} ▼
        </button>

        {locDropdownOpen && (
          <div className="header__dropdown glass" style={{ position: 'absolute', top: '100%', left: 0, padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px', width: '200px', zIndex: 9000 }}>

            {/* Regions Submenu */}
            <div style={{ paddingBottom: '5px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '10px', color: 'var(--accent-cyan)' }}>{t('regions')}</span>
              <div style={{ maxHeight: '100px', overflowY: 'auto', marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {regionsList.map(r => (
                  <button key={r} className={`header__nav-btn ${activeRegion === r ? 'header__nav-btn--active' : ''}`} style={{ fontSize: '11px', textAlign: 'left', padding: '4px' }} onClick={() => { setActiveRegion(r); onSearch(r); setLocDropdownOpen(false); }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* District Target */}
            <div style={{ paddingBottom: '5px', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '10px', color: 'var(--accent-cyan)' }}>{t('district')} (GPS)</span>
              <button className="header__nav-btn" style={{ fontSize: '11px', width: '100%', textAlign: 'left', padding: '4px', marginTop: '5px' }} onClick={() => { setActiveRegion('DISTRICT'); onGetLocation(); setLocDropdownOpen(false); }}>
                {t('findDistrict')}
              </button>
            </div>

            {/* My Locations Submenu */}
            <div>
              <span style={{ fontSize: '10px', color: 'var(--accent-cyan)' }}>{t('myLocations')} (5KM RADIUS)</span>
              <button className={`header__nav-btn ${activeRegion === 'MY LOCATIONS' ? 'header__nav-btn--active' : ''}`} style={{ fontSize: '11px', width: '100%', textAlign: 'left', padding: '4px', marginTop: '5px' }} onClick={() => { setActiveRegion('MY LOCATIONS'); setLocDropdownOpen(false); }}>
                {t('myLocations')}
              </button>
              <div style={{ maxHeight: '100px', overflowY: 'auto', marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {savedLocations.map((loc, i) => (
                  <button key={i} className="header__nav-btn" style={{ fontSize: '10px', color: '#8899aa', textAlign: 'left', padding: '2px 4px' }} onClick={() => { onSearch(loc.name); setLocDropdownOpen(false); }}>
                    ★ {loc.name}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}
      </nav>


      {/* FIX #3: Hover-reveal Search Bar (Desktop) */}
      <div
        className={`header__search ${(searchExpanded || isSearchPinned) ? 'header__search--expanded' : ''}`}
        onMouseEnter={() => setSearchExpanded(true)}
        onMouseLeave={() => { if (!searchVal && !isSearchPinned) setSearchExpanded(false); }}
      >
        <button
          className="header__search-icon"
          onClick={() => setIsSearchPinned(prev => !prev)}
          title={t('mapSearchBtn')}
        >
          🔍
        </button>
        {(searchExpanded || isSearchPinned) && (
          <div className="header__search-bar fade-in">
            <input
              className="header__search-input"
              placeholder={t('mapSearchPlaceholder')}
              value={searchVal}
              onChange={e => setSearchVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearchSubmit()}
              autoFocus
            />
            <button className="header__search-go" onClick={handleSearchSubmit}>{t('mapSearchBtn')}</button>
            <button className="header__search-go" title="GPS Search" style={{ background: 'transparent', color: 'var(--accent-cyan)' }} onClick={onGetLocation}>📍</button>
            {searchVal && (
              <>
                <button className="header__search-go" title="Save Location" style={{ background: 'transparent', color: 'var(--accent-gold)' }} onClick={onSaveLocation}>⭐</button>
                <button className="header__search-clear" onClick={handleSearchReset}>✕</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right Section: Timestamp, Status, Login, Theme, Lang (Desktop) */}
      <div className="header__right">
        <span className="header__timestamp telemetry">{t('lastSync')}: {formattedTime}</span>
        <span className={`header__status ${isHighAlert ? 'header__status--high' : 'header__status--normal'}`}>
          {isHighAlert ? t('highAlert') : (language === 'en' ? 'SECURE' : 'SELAMAT')}
        </span>

        {/* Language Toggle */}
        <button
          className="header__login-btn"
          onClick={toggleLanguage}
          style={{ borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)', minWidth: '60px' }}
        >
          {language === 'en' ? 'EN / BM' : 'BM / EN'}
        </button>

        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="telemetry" style={{ fontSize: '9px', color: 'var(--accent-green)', whiteSpace: 'nowrap', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user.email}
            </span>
            <button className="header__login-btn" onClick={logout} style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', minWidth: '70px' }}>
              LOGOUT
            </button>
          </div>
        ) : (
          <button className="header__login-btn" onClick={onLoginClick}>
            {t('loginRegister')}
          </button>
        )}
        <button className="header__theme-btn" onClick={onToggleNotifications} title="Toggle Notifications">
          {notificationsEnabled ? '🔕' : '🔔'}
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
        <nav className="header__nav" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          <div style={{ color: 'var(--accent-cyan)', fontSize: '12px', marginTop: '10px' }}>REGIONS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', padding: '5px 0' }}>
            {regionsList.slice(0, 6).map(r => (
              <button
                key={r}
                className={`header__nav-btn ${activeRegion === r ? 'header__nav-btn--active' : ''}`}
                onClick={() => { setActiveRegion(r); onSearch(r); setMenuOpen(false); }}
              >
                {r}
              </button>
            ))}
            <span style={{ fontSize: '10px', alignSelf: 'center', color: '#889' }}>...</span>
          </div>
          <button className="header__nav-btn" onClick={() => { setActiveRegion('DISTRICT'); onGetLocation(); setMenuOpen(false); }}>
            📍 FIND MY DISTRICT
          </button>
          <button className={`header__nav-btn ${activeRegion === 'MY LOCATIONS' ? 'header__nav-btn--active' : ''}`} onClick={() => { setActiveRegion('MY LOCATIONS'); setMenuOpen(false); }}>
            ⭐ MY LOCATIONS (5KM FILTER)
          </button>
          <div className="header__right">
            <button className="header__nav-btn" style={{ width: '100%' }} onClick={toggleLanguage}>
              LANGUAGE: {language === 'en' ? 'ENGLISH' : 'BAHASA MELAYU'}
            </button>
            <span className="header__timestamp">{t('lastSync')}: {formattedTime}</span>
            <span className="header__status header__status--high">{t('highAlert')}</span>
            {user ? (
              <button className="header__login-btn" style={{ width: '100%', borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }} onClick={() => { logout(); setMenuOpen(false); }}>
                LOGOUT ({user.email})
              </button>
            ) : (
              <button className="header__login-btn" style={{ width: '100%' }} onClick={() => { onLoginClick(); setMenuOpen(false); }}>
                {t('loginRegister')}
              </button>
            )}
            <button className="header__theme-btn" onClick={onToggleNotifications} title="Toggle Notifications">
              {notificationsEnabled ? 'Notifications: ON' : 'Notifications: OFF'}
            </button>
            <button className="header__theme-btn" onClick={onThemeToggle} title="Toggle theme">
              {isDark ? 'Theme: Dark' : 'Theme: Light'}
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
