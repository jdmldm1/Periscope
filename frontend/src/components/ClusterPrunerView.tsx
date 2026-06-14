import { useState, useCallback } from 'react';
import { Trash2, CheckCircle2, HardDrive, FileText, Key, Layers, Search, RefreshCw, AlertTriangle, Sparkles } from 'lucide-react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

interface OrphanedResource {
  name: string;
  namespace: string;
  kind: string;
  reason?: string;
  status?: string;
  completedAt?: string;
}

interface ScanResults {
  failedPods: OrphanedResource[];
  completedJobs: OrphanedResource[];
  danglingPVCs: OrphanedResource[];
  unusedConfigMaps: OrphanedResource[];
  unusedSecrets: OrphanedResource[];
  stalledReplicaSets: OrphanedResource[];
}

const categoryMeta: Record<string, { label: string; icon: any; color: string; gradient: string }> = {
  failedPods: { label: 'Failed Pods', icon: Trash2, color: '#ef4444', gradient: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))' },
  completedJobs: { label: 'Completed Jobs', icon: CheckCircle2, color: '#22c55e', gradient: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))' },
  danglingPVCs: { label: 'Dangling PVCs', icon: HardDrive, color: '#f59e0b', gradient: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))' },
  unusedConfigMaps: { label: 'Unused ConfigMaps', icon: FileText, color: '#3b82f6', gradient: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))' },
  unusedSecrets: { label: 'Unused Secrets', icon: Key, color: '#a855f7', gradient: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(168,85,247,0.05))' },
  stalledReplicaSets: { label: 'Stalled ReplicaSets', icon: Layers, color: '#06b6d4', gradient: 'linear-gradient(135deg, rgba(6,182,212,0.15), rgba(6,182,212,0.05))' },
};

const kindToCategory: Record<string, string> = {
  Pod: 'failedPods',
  Job: 'completedJobs',
  PersistentVolumeClaim: 'danglingPVCs',
  ConfigMap: 'unusedConfigMaps',
  Secret: 'unusedSecrets',
  ReplicaSet: 'stalledReplicaSets',
};

export const ClusterPrunerView = () => {
  const [scanResults, setScanResults] = useState<ScanResults | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cleanupResult, setCleanupResult] = useState<{ deleted: number; errors: number } | null>(null);

  const allResources: OrphanedResource[] = scanResults
    ? [
        ...scanResults.failedPods,
        ...scanResults.completedJobs,
        ...scanResults.danglingPVCs,
        ...scanResults.unusedConfigMaps,
        ...scanResults.unusedSecrets,
        ...scanResults.stalledReplicaSets,
      ]
    : [];

  const resourceKey = (r: OrphanedResource) => `${r.kind}/${r.namespace}/${r.name}`;

  const groupScanResults = (data: any[]): ScanResults => {
    const list = Array.isArray(data) ? data : [];
    return {
      failedPods: list.filter(r => r.kind === 'Pod'),
      completedJobs: list.filter(r => r.kind === 'Job'),
      danglingPVCs: list.filter(r => r.kind === 'PersistentVolumeClaim'),
      unusedConfigMaps: list.filter(r => r.kind === 'ConfigMap'),
      unusedSecrets: list.filter(r => r.kind === 'Secret'),
      stalledReplicaSets: list.filter(r => r.kind === 'ReplicaSet'),
    };
  };

  const handleScan = useCallback(async () => {
    setIsScanning(true);
    setCleanupResult(null);
    setSelected(new Set());
    try {
      const { data } = await api.get('/prune/scan');
      setScanResults(groupScanResults(data));
    } catch (err: any) {
      alert('Scan failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsScanning(false);
    }
  }, []);

  const handleCleanup = useCallback(async () => {
    if (selected.size === 0) return;
    setIsCleaning(true);
    try {
      const resources = allResources.filter(r => selected.has(resourceKey(r))).map(r => ({
        name: r.name,
        namespace: r.namespace,
        kind: r.kind,
      }));
      const { data } = await api.post('/prune/cleanup', { resources });
      setCleanupResult({ deleted: data.deleted?.length || 0, errors: data.errors?.length || 0 });
      // Re-scan after cleanup
      const { data: newScan } = await api.get('/prune/scan');
      setScanResults(groupScanResults(newScan));
      setSelected(new Set());
    } catch (err: any) {
      alert('Cleanup failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsCleaning(false);
    }
  }, [selected, allResources]);

  const toggleSelect = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === allResources.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allResources.map(resourceKey)));
    }
  };

  const getKindMeta = (kind: string) => {
    const cat = kindToCategory[kind];
    return cat ? categoryMeta[cat] : { label: kind, icon: AlertTriangle, color: '#94a3b8', gradient: '' };
  };

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Header with Scan Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={20} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Cluster Maintenance</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '6px 0 0' }}>
            Scan and clean orphaned resources to reclaim cluster capacity
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleScan}
          disabled={isScanning}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            animation: !scanResults && !isScanning ? 'pulse 2s infinite' : 'none',
          }}
        >
          {isScanning ? <RefreshCw size={14} className="spin" /> : <Search size={14} />}
          {isScanning ? 'Scanning...' : 'Scan Cluster'}
        </button>
      </div>

      {/* Cleanup Result Toast */}
      {cleanupResult && (
        <div style={{
          background: cleanupResult.errors > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
          border: `1px solid ${cleanupResult.errors > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
          borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <CheckCircle2 size={16} style={{ color: cleanupResult.errors > 0 ? '#ef4444' : '#22c55e' }} />
          <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            {cleanupResult.deleted} resource(s) deleted{cleanupResult.errors > 0 ? `, ${cleanupResult.errors} error(s)` : ''}.
          </span>
          <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setCleanupResult(null)}>Dismiss</button>
        </div>
      )}

      {/* Stats Cards */}
      {scanResults && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          {Object.entries(categoryMeta).map(([key, meta]) => {
            const count = (scanResults as any)[key]?.length || 0;
            const Icon = meta.icon;
            return (
              <div key={key} style={{
                background: meta.gradient,
                border: '1px solid var(--border-color)',
                borderRadius: 10, padding: '16px 18px',
                display: 'flex', alignItems: 'center', gap: 14,
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 20px ${meta.color}20`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = ''; }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${meta.color}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={20} style={{ color: meta.color }} />
                </div>
                <div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{count}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3, whiteSpace: 'nowrap' }}>{meta.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Resource Table */}
      {scanResults && allResources.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {selected.size} of {allResources.length} selected
            </span>
            <button
              className="btn btn-primary"
              onClick={handleCleanup}
              disabled={isCleaning || selected.size === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {isCleaning ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
              {isCleaning ? 'Cleaning...' : `Clean Selected (${selected.size})`}
            </button>
          </div>

          <div style={{ borderRadius: 10, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <table className="crd-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selected.size === allResources.length && allResources.length > 0}
                      onChange={toggleSelectAll}
                      style={{ cursor: 'pointer', accentColor: 'var(--accent-blue)' }}
                    />
                  </th>
                  <th>Kind</th>
                  <th>Name</th>
                  <th>Namespace</th>
                  <th>Reason / Status</th>
                </tr>
              </thead>
              <tbody>
                {allResources.map(r => {
                  const key = resourceKey(r);
                  const meta = getKindMeta(r.kind);
                  const Icon = meta.icon;
                  return (
                    <tr key={key} style={{ cursor: 'pointer' }} onClick={() => toggleSelect(key)}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selected.has(key)}
                          onChange={() => toggleSelect(key)}
                          onClick={e => e.stopPropagation()}
                          style={{ cursor: 'pointer', accentColor: 'var(--accent-blue)' }}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon size={14} style={{ color: meta.color }} />
                          <span style={{ color: meta.color, fontWeight: 500 }}>{r.kind}</span>
                        </div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.name}</td>
                      <td>
                        <span className="badge" style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', borderColor: 'rgba(96,165,250,0.3)' }}>
                          {r.namespace}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        {r.reason || r.status || r.completedAt || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Empty States */}
      {scanResults && allResources.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)',
          borderRadius: 12,
        }}>
          <CheckCircle2 size={48} style={{ color: '#22c55e', marginBottom: 16 }} />
          <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)' }}>Cluster is Clean</div>
          <div style={{ color: 'var(--text-muted)', marginTop: 8 }}>No orphaned or unused resources were found.</div>
        </div>
      )}

      {!scanResults && !isScanning && (
        <div style={{
          textAlign: 'center', padding: '80px 20px',
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 12,
        }}>
          <Search size={48} style={{ color: 'var(--text-muted)', marginBottom: 16, opacity: 0.5 }} />
          <div style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Ready to Scan</div>
          <div style={{ color: 'var(--text-muted)', marginTop: 8, maxWidth: 400, margin: '8px auto 0' }}>
            Click "Scan Cluster" to find failed pods, completed jobs, dangling PVCs, and other unused resources.
          </div>
        </div>
      )}

      {isScanning && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div className="loader-sm" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto 16px' }} />
          <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Scanning cluster resources...</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 6 }}>
            Analyzing pods, jobs, PVCs, configmaps, secrets, and replicasets
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(59,130,246,0); }
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
