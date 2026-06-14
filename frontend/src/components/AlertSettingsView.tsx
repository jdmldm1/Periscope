import { useState, useEffect, useCallback } from 'react';
import { Bell, BellRing, Send, CheckCircle, XCircle, Settings, RefreshCw } from 'lucide-react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

interface AlertSettings {
  webhookUrl: string;
  enabled: boolean;
  label: string;
  severityFilter: string;
  namespaceFilter: string;
}

const defaultSettings: AlertSettings = {
  webhookUrl: '',
  enabled: false,
  label: '',
  severityFilter: 'all',
  namespaceFilter: '',
};

export const AlertSettingsView = () => {
  const [settings, setSettings] = useState<AlertSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [savedSettings, setSavedSettings] = useState<AlertSettings>(defaultSettings);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await api.get('/alerts/settings');
        setSettings(data);
        setSavedSettings(data);
      } catch (err) {
        console.error('Failed to fetch alert settings', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    setHasChanges(JSON.stringify(settings) !== JSON.stringify(savedSettings));
  }, [settings, savedSettings]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const { data } = await api.post('/alerts/settings', settings);
      setSavedSettings(data.settings || settings);
      setSettings(data.settings || settings);
    } catch (err: any) {
      alert('Failed to save settings: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsSaving(false);
    }
  }, [settings]);

  const handleTest = useCallback(async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      await api.post('/alerts/test');
      setTestResult('success');
    } catch {
      setTestResult('error');
    } finally {
      setIsTesting(false);
      setTimeout(() => setTestResult(null), 4000);
    }
  }, []);

  const updateField = <K extends keyof AlertSettings>(key: K, value: AlertSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const connectionStatus = settings.webhookUrl
    ? settings.enabled ? 'connected' : 'disabled'
    : 'unconfigured';

  const statusColor = connectionStatus === 'connected' ? '#22c55e' : connectionStatus === 'disabled' ? '#f59e0b' : '#64748b';
  const statusLabel = connectionStatus === 'connected' ? 'Active' : connectionStatus === 'disabled' ? 'Paused' : 'Not configured';

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div className="loader-sm" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto 16px' }} />
        <div style={{ color: 'var(--text-muted)' }}>Loading alert settings...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 4px', maxWidth: 800 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BellRing size={20} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Event Alerts & Notifications</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '6px 0 0' }}>
            Configure webhook notifications for Kubernetes warning events
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: statusColor,
            boxShadow: `0 0 6px ${statusColor}`,
          }} />
          <span style={{ fontSize: '0.8rem', color: statusColor, fontWeight: 500 }}>{statusLabel}</span>
        </div>
      </div>

      {/* Settings Card */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: 12, padding: 24, marginBottom: 20,
      }}>
        <h3 style={{ margin: '0 0 20px', fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Settings size={16} /> Webhook Configuration
        </h3>

        {/* Enable/Disable Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, padding: '12px 16px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
          <div>
            <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Enable Event Watcher</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>Monitors cluster events and sends webhook alerts</div>
          </div>
          <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 26, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={e => updateField('enabled', e.target.checked)}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              background: settings.enabled ? 'var(--accent-blue)' : 'rgba(255,255,255,0.1)',
              borderRadius: 26, transition: 'background 0.3s',
            }}>
              <span style={{
                position: 'absolute', left: settings.enabled ? 24 : 3, top: 3,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left 0.3s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </span>
          </label>
        </div>

        {/* Webhook URL */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>
            Webhook URL
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type="url"
              placeholder="https://hooks.slack.com/services/... or Discord webhook URL"
              value={settings.webhookUrl}
              onChange={e => updateField('webhookUrl', e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', paddingRight: 36,
                background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem',
                fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              width: 8, height: 8, borderRadius: '50%', background: statusColor,
            }} />
          </div>
        </div>

        {/* Label */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>
            Channel / Label
          </label>
          <input
            type="text"
            placeholder="e.g., #kubernetes-alerts"
            value={settings.label}
            onChange={e => updateField('label', e.target.value)}
            style={{
              width: '100%', padding: '10px 14px',
              background: 'var(--bg-main)', border: '1px solid var(--border-color)',
              borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Severity + Namespace Filter Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>
              Severity Filter
            </label>
            <select
              value={settings.severityFilter}
              onChange={e => updateField('severityFilter', e.target.value)}
              style={{
                width: '100%', padding: '10px 14px',
                background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem',
                outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="all">All Events</option>
              <option value="Warning">Warning Only</option>
              <option value="Critical">Critical Only</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>
              Namespace Filter
            </label>
            <input
              type="text"
              placeholder="all (comma-separated)"
              value={settings.namespaceFilter}
              onChange={e => updateField('namespaceFilter', e.target.value)}
              style={{
                width: '100%', padding: '10px 14px',
                background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {isSaving ? <RefreshCw size={14} className="spin" /> : <CheckCircle size={14} />}
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
          <button
            className="btn"
            onClick={handleTest}
            disabled={isTesting || !settings.webhookUrl}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {isTesting ? <RefreshCw size={14} className="spin" /> : <Send size={14} />}
            {isTesting ? 'Sending...' : 'Send Test'}
          </button>

          {/* Test Result Indicator */}
          {testResult && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              animation: 'fadeIn 0.3s ease',
              color: testResult === 'success' ? '#22c55e' : '#ef4444',
              fontSize: '0.85rem', fontWeight: 500,
            }}>
              {testResult === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
              {testResult === 'success' ? 'Notification sent!' : 'Failed to send'}
            </div>
          )}
        </div>
      </div>

      {/* Recent Alerts Section */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: 12, padding: 24,
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={16} /> Recent Alerts
        </h3>

        <div style={{
          textAlign: 'center', padding: '40px 20px',
          background: 'rgba(255,255,255,0.02)', borderRadius: 8,
          border: '1px dashed var(--border-color)',
        }}>
          <Bell size={36} style={{ color: 'var(--text-muted)', opacity: 0.4, marginBottom: 12 }} />
          <div style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.9rem' }}>No recent alerts</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 6, maxWidth: 320, margin: '6px auto 0' }}>
            {settings.enabled
              ? 'Monitoring cluster events. Alerts will appear here when warning events are detected.'
              : 'Enable the event watcher above to start monitoring cluster events.'
            }
          </div>
        </div>
      </div>

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};
