import React, { useState } from 'react';
import { Lock, ShieldAlert, Key, CheckCircle } from 'lucide-react';
import axios from 'axios';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onPasswordChanged: () => void;
  forced?: boolean; // if true, they cannot close it without changing
  onClose?: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onPasswordChanged,
  forced = false,
  onClose
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) return;

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 4) {
      setError('Password must be at least 4 characters long');
      return;
    }

    if (password === 'periscope') {
      setError('You must choose a password other than the default "periscope"');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await axios.post('/api/auth/change-password', { password });
      setSuccess(true);
      setTimeout(() => {
        onPasswordChanged();
      }, 1500);
    } catch (err: any) {
      console.error('Change password error:', err);
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    background: 'var(--bg-main)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    padding: '10px 12px 10px 38px',
    color: '#fff',
    width: '100%',
    outline: 'none',
    fontSize: '0.9rem',
  };

  const labelStyle = { fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal-content animate-fade-in" style={{ maxWidth: 440, padding: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
            border: success ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(245, 158, 11, 0.2)',
            color: success ? 'var(--accent-green)' : 'var(--accent-warning)',
            marginBottom: 12
          }}>
            {success ? <CheckCircle size={24} /> : <Key size={24} />}
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
            {forced ? 'Change Default Password' : 'Change Password'}
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {forced 
              ? 'You are logged in with the default password. For security, please choose a new password before continuing.' 
              : 'Update your security credentials'}
          </p>
        </div>

        {success ? (
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            color: 'var(--accent-green)',
            borderRadius: '8px',
            padding: '16px',
            textAlign: 'center',
            fontSize: '0.9rem',
            fontWeight: 600,
            margin: '20px 0'
          }}>
            Password updated! Logging in...
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {error && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: 'var(--accent-error)',
                borderRadius: '6px',
                padding: '10px 12px',
                fontSize: '0.82rem'
              }}>
                <ShieldAlert size={14} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>New Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={14} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  placeholder="Enter new password"
                  style={inputStyle}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Confirm New Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={14} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  style={inputStyle}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  onFocus={e => e.target.style.borderColor = 'var(--accent-primary)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border-color)'}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
              {!forced && onClose && (
                <button type="button" className="btn" onClick={onClose} disabled={loading}>
                  Cancel
                </button>
              )}
              <button type="submit" className="btn btn-primary" style={{ flex: forced ? 1 : 'none' }} disabled={loading}>
                {loading ? (
                  <div className="loader-sm" style={{ width: 14, height: 14, borderWidth: 2 }} />
                ) : (
                  'Change Password'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
