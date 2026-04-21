import { useEffect } from 'react';

/**
 * Tactical Toast Notification
 * Matches the high-density glassmorphism aesthetic of the Guardian Platform.
 * @param {Object} props
 * @param {string} props.message - The message to display.
 * @param {string} props.type - 'info' | 'success' | 'warning' | 'error'
 * @param {number} props.duration - Duration in ms before self-closing.
 * @param {function} props.onClose - Callback to close the toast.
 */
export default function Toast({ message, type = 'info', duration = 4000, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success': return '✓';
      case 'warning': return '⚠';
      case 'error': return '✖';
      default: return 'ℹ';
    }
  };

  return (
    <div className={`tactical-toast tactical-toast--${type} glass scanline`}>
      <div className="tactical-toast__icon">{getIcon()}</div>
      <div className="tactical-toast__content">
        <div className="tactical-toast__header">{type.toUpperCase()} SIGNAL</div>
        <div className="tactical-toast__message">{message}</div>
      </div>
      <button className="tactical-toast__close" onClick={onClose}>✕</button>
      <div className="tactical-toast__progress" style={{ animationDuration: `${duration}ms` }} />
    </div>
  );
}
