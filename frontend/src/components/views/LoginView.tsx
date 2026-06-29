import React, { useState } from 'react';
import { Lock, User, ShieldAlert, Key } from 'lucide-react';
import axios from 'axios';

interface LoginViewProps {
  onLoginSuccess: (token: string, isDefault: boolean) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.post('/api/auth/login', { username, password });
      if (data.success && data.token) {
        onLoginSuccess(data.token, !!data.isDefault);
      } else {
        setError('Login failed: Invalid response from server');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.response?.data?.error || 'Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--border-color)',
    borderRadius: '6px',
    padding: '10px 12px 10px 38px',
    color: '#fff',
    width: '100%',
    outline: 'none',
    fontSize: '0.9rem',
    transition: 'border-color 0.2s',
  };

  return (
    <div className="login-overlay">
      <div className="login-card animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(96, 165, 250, 0.1)',
            padding: '10px 16px',
            borderRadius: '12px',
            border: '1px solid rgba(96, 165, 250, 0.2)'
          }}>
            <svg viewBox="0 0 256 250" width="24" height="24" style={{ display: 'inline-block', flexShrink: 0 }}>
              <path d="M128 0L239.53 53.64V178.6L128 250L16.47 178.6V53.64L128 0Z" fill="#326CE5"/>
              <path d="M128 35.12L208.57 73.84V163.66L128 215.12L47.43 163.66V73.84L128 35.12Z" fill="white"/>
              <path d="M128 53.68V95.73M128 153.27V195.32M74.96 158.73L104.7 128.99M181.04 90.27L151.3 120.01M53.68 128H95.73M153.27 128H195.32M74.96 97.27L104.7 127.01M181.04 151.73L151.3 121.99" stroke="#326CE5" strokeWidth="18" strokeLinecap="round"/>
              <circle cx="128" cy="128" r="28" fill="#326CE5"/>
            </svg>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.5px' }}>Periscope</span>
          </div>
        </div>

        <h2 className="login-title">Welcome Back</h2>
        <p className="login-subtitle">Sign in to manage your Kubernetes clusters</p>

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: 'var(--accent-error)',
            borderRadius: '8px',
            padding: '12px 16px',
            fontSize: '0.85rem',
            marginBottom: 20
          }}>
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Username</label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Enter username"
                style={inputStyle}
                value={username}
                onChange={e => setUsername(e.target.value)}
                onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-muted)' }} />
              <input
                type="password"
                placeholder="Enter password"
                style={inputStyle}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
                onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{
              padding: '12px',
              fontSize: '0.95rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 10,
              borderRadius: '8px'
            }}
          >
            {loading ? (
              <div className="loader-sm" style={{ width: 16, height: 16, borderWidth: 2 }} />
            ) : (
              <>
                <Key size={16} /> Sign In
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
