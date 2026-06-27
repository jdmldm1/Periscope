import { useState, useEffect, useCallback } from 'react';
import { HardDrive, Plus, Trash2, Download, RefreshCw, RotateCcw, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

interface Backup {
  name: string;
  filePath: string;
  createdAt: string;
  sizeMb: string;
}

interface RestoreResult {
  applied: { kind: string; name: string; namespace: string; status: string }[];
  skipped: { kind: string; name: string; namespace: string; status: string }[];
  errors: { kind: string; name: string; namespace: string; error: string }[];
}

export const BackupRestoreView = ({ selectedNs }: { selectedNs: string }) => {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [backupLabel, setBackupLabel] = useState('');
  const [backupNs, setBackupNs] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<RestoreResult | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/backup/list');
      setBackups(res.data);
    } catch (err: any) {
      console.error('Failed to list backups', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/backup/create', { namespace: backupNs || selectedNs || 'all', label: backupLabel || undefined });
      setShowCreate(false);
      setBackupLabel('');
      setBackupNs('');
      refresh();
    } catch (err: any) {
      alert('Backup failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (backup: Backup) => {
    if (!confirm(`Delete backup "${backup.name}"?`)) return;
    try {
      await api.delete(`/backup/${backup.name}`);
      refresh();
    } catch (err: any) {
      alert('Delete failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleRestore = async (backup: Backup, dryRun: boolean) => {
    if (!dryRun && !confirm(`Restore "${backup.name}"? This will create resources in your cluster.`)) return;
    setRestoring(backup.name);
    try {
      const res = await api.post(`/backup/restore/${backup.name}`, { dryRun });
      if (dryRun) setDryRunResult(res.data);
      else setRestoreResult(res.data);
    } catch (err: any) {
      alert('Restore failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setRestoring(null);
    }
  };

  const ResultPanel = ({ result, onClose, title }: { result: RestoreResult; onClose: () => void; title: string }) => (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '80vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ display: 'flex', gap: 16, margin: '16px 0', flexWrap: 'wrap' }}>
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: '10px 16px', flex: 1 }}>
            <div style={{ color: '#22c55e', fontWeight: 700, fontSize: '1.4rem' }}>{result.applied.length}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Applied</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '10px 16px', flex: 1 }}>
            <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: '1.4rem' }}>{result.skipped.length}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Skipped (exists)</div>
          </div>
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 16px', flex: 1 }}>
            <div style={{ color: '#ef4444', fontWeight: 700, fontSize: '1.4rem' }}>{result.errors.length}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Errors</div>
          </div>
        </div>

        {result.errors.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-error)', marginBottom: 6 }}>Errors</div>
            {result.errors.map((e, i) => (
              <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
                <span style={{ color: 'var(--text-primary)' }}>{e.kind}/{e.name}</span> ({e.namespace}) — {e.error}
              </div>
            ))}
          </div>
        )}

        {result.applied.length > 0 && (
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#22c55e', marginBottom: 6 }}>Applied Resources</div>
            {result.applied.map((a, i) => (
              <div key={i} style={{ fontSize: '0.78rem', color: 'var(--text-muted)', padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
                <CheckCircle2 size={12} style={{ color: '#22c55e', marginRight: 6, display: 'inline' }} />
                {a.kind}/{a.name} ({a.namespace})
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HardDrive size={18} style={{ color: 'var(--accent-blue)' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{backups.length} backup{backups.length !== 1 ? 's' : ''} stored</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={refresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New Backup
          </button>
        </div>
      </div>

      <div style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '12px 16px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
        Backups export Kubernetes manifests (Deployments, StatefulSets, Services, ConfigMaps, Secrets, CronJobs, Ingresses, PVCs) to YAML files stored on the server.
        Restore re-creates the resources — existing resources are skipped to avoid conflicts. Use Dry Run to preview what would be applied.
      </div>

      {backups.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          No backups yet. Create your first backup to protect your cluster resources.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {backups.map(backup => (
          <div key={backup.name} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', fontFamily: 'monospace' }}>{backup.name}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 3 }}>
                  {new Date(backup.createdAt).toLocaleString()} · {backup.sizeMb} MB
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" disabled={restoring === backup.name}
                  onClick={() => handleRestore(backup, true)}
                  title="Preview what would be restored without making changes">
                  <AlertTriangle size={13} /> Dry Run
                </button>
                <button className="btn btn-sm btn-primary" disabled={restoring === backup.name}
                  onClick={() => handleRestore(backup, false)}>
                  {restoring === backup.name ? <><RefreshCw size={13} className="spin" /> Restoring...</> : <><RotateCcw size={13} /> Restore</>}
                </button>
                <a className="btn btn-sm" href={`/api/backup/download/${backup.name}`} download={`${backup.name}.yaml`}>
                  <Download size={13} /> Download
                </a>
                <button className="btn btn-sm" style={{ color: 'var(--accent-error)' }} onClick={() => handleDelete(backup)}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <div className="modal-title">Create Cluster Backup</div>
              <button className="btn btn-icon" onClick={() => setShowCreate(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Backup Label (optional)</label>
                <input className="exec-input" style={{ padding: '7px 10px' }} value={backupLabel}
                  onChange={e => setBackupLabel(e.target.value)} placeholder="e.g. pre-upgrade" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Namespace (leave blank for all)</label>
                <input className="exec-input" style={{ padding: '7px 10px' }} value={backupNs}
                  onChange={e => setBackupNs(e.target.value)} placeholder={selectedNs || 'all namespaces'} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? <><RefreshCw size={13} className="spin" /> Backing up...</> : 'Create Backup'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {restoreResult && <ResultPanel result={restoreResult} onClose={() => setRestoreResult(null)} title="Restore Complete" />}
      {dryRunResult && <ResultPanel result={dryRunResult} onClose={() => setDryRunResult(null)} title="Dry Run Preview" />}
    </div>
  );
};
