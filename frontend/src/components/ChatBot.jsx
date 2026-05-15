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
  }, [language, t]); // React to language changes

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
      // This calls POST /api/chat on the FastAPI backend (Streamed)
      const res = await sendChatMessage(trimmed);
      setLoading(false); // Stop "Thinking..." once we get a response object

      setMessages(prev => [...prev, { sender: 'ai', text: '' }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let aiText = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        aiText += chunk;

        setMessages(prev => {
          const newMsgs = [...prev];
          newMsgs[newMsgs.length - 1].text = aiText;
          return newMsgs;
        });
      }
    // eslint-disable-next-line no-unused-vars
    } catch (_err) {
      setLoading(false);
      setLoading(false);
      setMessages(prev => [...prev, { sender: 'ai', text: 'Error connecting to AI service.' }]);
    }
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

      <div className="chat-input flex items-end">
        <textarea
          className="chat-input__field resize-none overflow-y-auto max-h-[120px] min-h-[44px] w-full"
          rows={1}
          placeholder={t('vaiPlaceholder')}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button className="chat-input__send ml-2" onClick={handleSend} disabled={loading}>
          {t('vaiSend')}
        </button>
      </div>
    </div>
  );
}
