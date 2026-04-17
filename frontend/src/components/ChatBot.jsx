import { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '../services/api';
import { useLanguage } from '../context/LanguageContext';

export default function ChatBot() {
  const { t, language } = useLanguage();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const msgEndRef = useRef(null);

  // Set initial message when language changes or on mount
  useEffect(() => {
    setMessages([
      {
        sender: 'ai',
        text: t('vaiWelcome'),
      },
    ]);
  }, [language]); // React to language changes

  // Auto-scroll to bottom
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setMessages(prev => [...prev, { sender: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);

    try {
      // Backend uses Groq AI with national emergency context
      const data = await sendChatMessage(trimmed);
      setMessages(prev => [...prev, { sender: 'ai', text: data.response }]);
    } catch (err) {
      setMessages(prev => [...prev, { sender: 'ai', text: 'Error connecting to AI service.' }]);
    }
    setLoading(false);
  };

  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-header">
        <span className="panel-header__title">{t('vaiTitle')}</span>
        <span className="panel-header__badge panel-header__badge--live">{t('vaiActive')}</span>
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg chat-msg--${msg.sender} fade-in`}>
            <div className="chat-msg__sender">{msg.sender === 'ai' ? 'VAI' : language === 'en' ? 'YOU' : 'ANDA'}</div>
            {msg.text}
          </div>
        ))}
        {loading && (
          <div className="chat-msg chat-msg--ai">
            <div className="chat-msg__sender">VAI</div>
            <span className="spinner" /> {t('vaiThinking')}
          </div>
        )}
        <div ref={msgEndRef} />
      </div>

      <div className="chat-input">
        <input
          className="chat-input__field"
          placeholder={t('vaiPlaceholder')}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button className="chat-input__send" onClick={handleSend} disabled={loading}>
          {t('vaiSend')}
        </button>
      </div>
    </div>
  );
}
