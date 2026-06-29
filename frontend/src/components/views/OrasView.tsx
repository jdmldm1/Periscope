import React, { useState, useEffect } from 'react';
import { Package, Upload, Download, ArrowRight, Play } from 'lucide-react';
import axios from 'axios';

export const OrasView: React.FC = () => {
  const [status, setStatus] = useState<{ installed: boolean; mode: 'connected' | 'airgap' } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState('');
  
  // Push Form
  const [pushRef, setPushRef] = useState('');
  const [pushFile, setPushFile] = useState<File | null>(null);
  const [pushUseZarfCreds, setPushUseZarfCreds] = useState(true);
  const [pushUsername, setPushUsername] = useState('');
  const [pushPassword, setPushPassword] = useState('');
  const [pushInsecure, setPushInsecure] = useState(true);

  // Pull Form
  const [pullRef, setPullRef] = useState('');
  const [pullUseZarfCreds, setPullUseZarfCreds] = useState(true);
  const [pullUsername, setPullUsername] = useState('');
  const [pullPassword, setPullPassword] = useState('');
  const [pullInsecure, setPullInsecure] = useState(true);

  const fetchStatus = async () => {
    try {
      const { data } = await axios.get('/api/oras/status');
      setStatus(data);
    } catch (err) {
      console.error('Failed to get ORAS status:', err);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleDownloadBinary = async () => {
    setDownloading(true);
    setLogs('Downloading ORAS binary from GitHub...\n');
    try {
      const { data } = await axios.post('/api/oras/download-binary');
      setLogs(prev => prev + data.message + '\n');
      fetchStatus();
    } catch (err: any) {
      setLogs(prev => prev + 'ERROR: ' + (err.response?.data?.error || err.message) + '\n');
    } finally {
      setDownloading(false);
    }
  };

  const handlePush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pushRef || !pushFile) return;

    setLoading(true);
    setLogs(`Starting upload of ${pushFile.name}...\n`);
    try {
      // 1. Upload file to server
      const uploadRes = await axios.post('/api/oras/upload', pushFile, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-file-name': pushFile.name
        }
      });

      if (!uploadRes.data.success || !uploadRes.data.filepath) {
        throw new Error('File upload to server failed');
      }

      setLogs(prev => prev + `File successfully uploaded to temporary directory. Initiating oras push...\n`);

      // 2. Trigger ORAS push
      const pushRes = await axios.post('/api/oras/push', {
        ref: pushRef,
        filepath: uploadRes.data.filepath,
        username: pushUseZarfCreds ? '' : pushUsername,
        password: pushUseZarfCreds ? '' : pushPassword,
        useZarfCreds: pushUseZarfCreds,
        insecure: pushInsecure
      });

      setLogs(prev => prev + pushRes.data.logs + '\nPUSH COMPLETED SUCCESSFULLY!');
    } catch (err: any) {
      setLogs(prev => prev + '\n' + (err.response?.data?.logs || err.response?.data?.error || err.message) + '\nPUSH FAILED.');
    } finally {
      setLoading(false);
    }
  };

  const handlePull = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pullRef) return;

    setLoading(true);
    setLogs(`Initiating ORAS pull for artifact: ${pullRef}...\n`);
    try {
      const response = await axios.post('/api/oras/pull', {
        ref: pullRef,
        username: pullUseZarfCreds ? '' : pullUsername,
        password: pullUseZarfCreds ? '' : pullPassword,
        useZarfCreds: pullUseZarfCreds,
        insecure: pullInsecure
      }, {
        responseType: 'blob' // download as binary attachment
      });

      setLogs(prev => prev + `Artifact successfully pulled and downloaded!\n`);

      // Extract original filename if present in headers, else default
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'artifact.tar.gz';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      // Trigger browser download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      // If error response type is blob, convert to text to read the JSON error logs
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try {
          const parsed = JSON.parse(text);
          setLogs(prev => prev + '\n' + (parsed.logs || parsed.error || text) + '\nPULL FAILED.');
        } catch (e) {
          setLogs(prev => prev + '\n' + text + '\nPULL FAILED.');
        }
      } else {
        setLogs(prev => prev + '\n' + (err.response?.data?.error || err.message) + '\nPULL FAILED.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Auto-detect secure registry settings based on URL
  useEffect(() => {
    const isZarf = (url: string) => url.includes('zarf-docker-registry') || url.includes('localhost') || url.includes('127.0.0.1');
    setPushInsecure(isZarf(pushRef));
  }, [pushRef]);

  useEffect(() => {
    const isZarf = (url: string) => url.includes('zarf-docker-registry') || url.includes('localhost') || url.includes('127.0.0.1');
    setPullInsecure(isZarf(pullRef));
  }, [pullRef]);

  const cardStyle = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--radius-lg)',
    padding: '24px',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16
  };

  const inputStyle = {
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--border-color)',
    borderRadius: '4px',
    padding: '8px 12px',
    color: '#fff',
    fontSize: '0.85rem'
  };

  return (
    <div className="oras-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ORAS Status Banner */}
      <div style={{
        background: 'rgba(31, 41, 55, 0.2)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            background: status?.installed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
            border: status?.installed ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(245, 158, 11, 0.2)',
            color: status?.installed ? 'var(--accent-green)' : 'var(--accent-warning)',
            padding: 10,
            borderRadius: '50%',
            display: 'flex'
          }}>
            <Package size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', margin: 0 }}>OCI Registry As Storage (ORAS)</h3>
              <span className="badge" style={{
                background: status?.installed ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: status?.installed ? 'var(--accent-green)' : 'var(--accent-warning)',
                border: 'none',
                fontSize: '0.65rem'
              }}>
                {status ? (status.installed ? 'ACTIVE' : 'NOT INSTALLED') : 'CHECKING...'}
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '4px 0 0' }}>
              {status?.installed 
                ? `ORAS CLI is available. Running in ${status.mode} mode.` 
                : `ORAS CLI is not installed. Running in ${status?.mode || 'connected'} mode.`}
            </p>
          </div>
        </div>

        {status && !status.installed && status.mode === 'connected' && (
          <button
            className="btn btn-primary"
            onClick={handleDownloadBinary}
            disabled={downloading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {downloading ? <div className="loader-sm" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <Download size={14} />}
            Download ORAS CLI
          </button>
        )}
      </div>

      {/* Main Grid */}
      <div className="dashboard-charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        
        {/* Push Form */}
        <div style={cardStyle}>
          <div className="dashboard-chart-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Upload size={16} style={{ color: 'var(--accent-cyan)' }} />
            <span>PUSH ARTIFACT</span>
          </div>
          <form onSubmit={handlePush} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Target Registry Reference</label>
              <input
                type="text"
                placeholder="e.g. localhost:5000/my-app:1.0"
                style={inputStyle}
                value={pushRef}
                onChange={e => setPushRef(e.target.value)}
                required
                disabled={!status?.installed || loading}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Select File to Push</label>
              <div className="oras-dropzone" onClick={() => !loading && document.getElementById('push-file-input')?.click()}>
                <input
                  id="push-file-input"
                  type="file"
                  style={{ display: 'none' }}
                  onChange={e => setPushFile(e.target.files?.[0] || null)}
                  disabled={!status?.installed || loading}
                />
                <Upload size={24} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  {pushFile ? pushFile.name : 'Click to select a file'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  {pushFile ? `${(pushFile.size / 1024 / 1024).toFixed(2)} MB` : 'Any binary or text files'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="push-zarf-creds"
                checked={pushUseZarfCreds}
                onChange={e => setPushUseZarfCreds(e.target.checked)}
                disabled={!status?.installed || loading}
              />
              <label htmlFor="push-zarf-creds" style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                Use Zarf Registry Credentials
              </label>
            </div>

            {!pushUseZarfCreds && (
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Username</label>
                  <input
                    type="text"
                    style={inputStyle}
                    value={pushUsername}
                    onChange={e => setPushUsername(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Password</label>
                  <input
                    type="password"
                    style={inputStyle}
                    value={pushPassword}
                    onChange={e => setPushPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="push-insecure"
                checked={pushInsecure}
                onChange={e => setPushInsecure(e.target.checked)}
                disabled={!status?.installed || loading}
              />
              <label htmlFor="push-insecure" style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                Allow Insecure Registry (HTTP/Self-signed)
              </label>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={!status?.installed || loading || !pushRef || !pushFile}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px' }}
            >
              {loading ? <div className="loader-sm" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Play size={14} />}
              Push Artifact
            </button>
          </form>
        </div>

        {/* Pull Form */}
        <div style={cardStyle}>
          <div className="dashboard-chart-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Download size={16} style={{ color: 'var(--accent-purple)' }} />
            <span>PULL & DOWNLOAD ARTIFACT</span>
          </div>
          <form onSubmit={handlePull} style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Source Registry Reference</label>
              <input
                type="text"
                placeholder="e.g. localhost:5000/my-app:1.0"
                style={inputStyle}
                value={pullRef}
                onChange={e => setPullRef(e.target.value)}
                required
                disabled={!status?.installed || loading}
              />
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0', opacity: 0.4 }}>
              <div style={{ textAlign: 'center' }}>
                <Package size={48} style={{ color: 'var(--accent-purple)', marginBottom: 8 }} />
                <div style={{ fontSize: '0.75rem' }}>Downloads pulled files as a single binary or .tar.gz archive</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="pull-zarf-creds"
                checked={pullUseZarfCreds}
                onChange={e => setPullUseZarfCreds(e.target.checked)}
                disabled={!status?.installed || loading}
              />
              <label htmlFor="pull-zarf-creds" style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                Use Zarf Registry Credentials
              </label>
            </div>

            {!pullUseZarfCreds && (
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Username</label>
                  <input
                    type="text"
                    style={inputStyle}
                    value={pullUsername}
                    onChange={e => setPullUsername(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Password</label>
                  <input
                    type="password"
                    style={inputStyle}
                    value={pullPassword}
                    onChange={e => setPullPassword(e.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                id="pull-insecure"
                checked={pullInsecure}
                onChange={e => setPullInsecure(e.target.checked)}
                disabled={!status?.installed || loading}
              />
              <label htmlFor="pull-insecure" style={{ fontSize: '0.8rem', cursor: 'pointer' }}>
                Allow Insecure Registry (HTTP/Self-signed)
              </label>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={!status?.installed || loading || !pullRef}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px' }}
            >
              {loading ? <div className="loader-sm" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <ArrowRight size={14} />}
              Pull & Download
            </button>
          </form>
        </div>

      </div>

      {/* Console Output */}
      {logs && (
        <div style={cardStyle}>
          <div className="dashboard-chart-title">EXECUTION CONSOLE LOGS</div>
          <div className="console-panel">{logs}</div>
        </div>
      )}
    </div>
  );
};
