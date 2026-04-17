import { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '../services/api';

export default function ChatBot() {
  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: 'Welcome to the Disaster Monitor AI. I am powered by Google Gemini (Vertex AI). Ask me about natural disaster safety, emergency procedures, or risk assessments for any location in Malaysia.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const msgEndRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    // Add user message immediately
    setMessages(prev => [...prev, { sender: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);

    try {
      // This calls POST /api/chat on the FastAPI backend
      // Backend uses Groq AI (llama-3.3-70b-versatile) with Malaysia emergency context
      // Requires GROQ_API_KEY in the backend .env file
      const data = await sendChatMessage(trimmed);
      setMessages(prev => [...prev, { sender: 'ai', text: data.response }]);
    } catch (err) {
      setMessages(prev => [...prev, { sender: 'ai', text: 'Error connecting to AI service. Please ensure the backend is running.' }]);
    }
    setLoading(false);
  };

  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-header">
        <span className="panel-header__title">VAI — Tactical Strategy Agent</span>
        <span className="panel-header__badge panel-header__badge--live">VERTEX AI ACTIVE</span>
      </div>

      {/* Chat Messages */}
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg chat-msg--${msg.sender} fade-in`}>
            <div className="chat-msg__sender">{msg.sender === 'ai' ? 'VAI' : 'YOU'}</div>
            {msg.text}
          </div>
        ))}
        {loading && (
          <div className="chat-msg chat-msg--ai">
            <div className="chat-msg__sender">VAI</div>
            <span className="spinner" /> Thinking...
          </div>
        )}
        <div ref={msgEndRef} />
      </div>

      {/* Chat Input */}
      <div className="chat-input">
        <input
          className="chat-input__field"
          placeholder="Ask about disaster safety..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
        />
        <button className="chat-input__send" onClick={handleSend} disabled={loading}>
          SEND
        </button>
      </div>
    </div>
  );
}
