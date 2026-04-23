import { useState } from 'react';
import { registerUser } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function AuthModal({ onClose, onLoginSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const { user, idToken } = await login(email, password);
        onLoginSuccess?.({ email: user.email, uid: user.uid, idToken });
        onClose();
      } else {
        const data = await registerUser(email, password);
        const { user, idToken } = await login(email, password);
        onLoginSuccess?.({ email: user.email, uid: data.uid || user.uid, idToken });
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={e => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal__title">
          {mode === 'login' ? 'Login' : 'Register'}
        </div>

        {error && <div className="modal__error">{error}</div>}

        <input
          className="modal__input"
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        <input
          className="modal__input"
          type="password"
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
        />

        <button className="modal__btn" type="submit" disabled={loading}>
          {loading ? 'Processing...' : mode === 'login' ? 'LOGIN' : 'REGISTER'}
        </button>

        <div className="modal__toggle">
          {mode === 'login' ? (
            <>Don&apos;t have an account? <span onClick={() => { setMode('register'); setError(''); }}>Register</span></>
          ) : (
            <>Already have an account? <span onClick={() => { setMode('login'); setError(''); }}>Login</span></>
          )}
        </div>
      </form>
    </div>
  );
}
