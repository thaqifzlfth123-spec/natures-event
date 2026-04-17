import { createContext, useState, useContext, useEffect } from 'react';
import { translations } from '../services/translations';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  // Persistence: Store language preference in localStorage
  const savedLanguage = localStorage.getItem('guardian_lang') || 'en';
  const [language, setLanguage] = useState(savedLanguage);

  useEffect(() => {
    localStorage.setItem('guardian_lang', language);
  }, [language]);

  const toggleLanguage = () => {
    setLanguage(prev => (prev === 'en' ? 'bm' : 'en'));
  };

  const t = (key) => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
