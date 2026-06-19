import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, Plus, Trash2, RefreshCw, Edit2, X, Check } from 'lucide-react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

interface HPA {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  spec: {
    scaleTargetRef: { kind: string; name: string };
    minReplicas: number;
    maxReplicas: number;
    metrics?: any[];
  };
  status?: {
    currentReplicas?: number;
    desiredReplicas?: number;
    currentMetrics?: any[];
    conditions?: any[];
  };
}

interface Target {
  name: string;
  namespace: string;
  replicas: number;
}

const emptyForm = {
  name: '', namespace: 'default', targetKind: 'Deployment', targetName: '',
  minReplicas: '1', maxReplicas: '10', cpuTarget: '70', memoryTarget: '',
};

export const AutoscaleManagerView = ({ selectedNs }: { selectedNs: string }) => {
  const [hpas, setHpas] = useState<HPA[]>([]);
  const [targets, setTargets] = useState<{ deployments: Target[]; statefulsets: Target[] }>({ deployments: [], statefulsets: [] });
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [submitting, setSubmitting] = useState(false);
  const [editHpa, setEditHpa] = useState<HPA | null>(null);
  const [editMin, setEditMin] = useState('');
  const [editMax, setEditMax] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [hpaRes, targetsRes] = await Promise.all([
        api.get('/autoscale/hpa', { params: { namespace: selectedNs } }),
        api.get('/autoscale/targets', { params: { namespace: selectedNs } }),
      ]);
      setHpas(hpaRes.data);
      setTargets(targetsRes.data);
    } catch (err: any) {
      console.error('Failed to load autoscale data', err);
    } finally {
      setLoading(false);
    }
  }, [selectedNs]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/autoscale/hpa', { ...form });
      setShowCreate(false);
      setForm({ ...emptyForm });
      refresh();
    } catch (err: any) {
      alert('Failed to create HPA: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (hpa: HPA) => {
    if (!confirm(`Delete HPA "${hpa.metadata.name}"?`)) return;
    try {
      await api.delete(`/autoscale/hpa/${hpa.metadata.namespace}/${hpa.metadata.name}`);
      refresh();
    } catch (err: any) {
      alert('Delete failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleSaveEdit = async () => {
    if (!editHpa) return;
    try {
      await api.put(`/autoscale/hpa/${editHpa.metadata.namespace}/${editHpa.metadata.name}`, {
        minReplicas: editMin,
        maxReplicas: editMax,
      });
      setEditHpa(null);
      refresh();
    } catch (err: any) {
      alert('Update failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const allTargets = [
    ...targets.deployments.map(t => ({ ...t, kind: 'Deployment' })),
    ...targets.statefulsets.map(t => ({ ...t, kind: 'StatefulSet' })),
  ];

  const hpaTargetNames = new Set(hpas.map(h => `${h.spec.scaleTargetRef.kind}/${h.metadata.namespace}/${h.spec.scaleTargetRef.name}`));

  const getCpuTarget = (hpa: HPA) => {
    const metric = hpa.spec.metrics?.find(m => m.resource?.name === 'cpu');
    return metric?.resource?.target?.averageUtilization ?? '—';
  };

  const getUtilization = (hpa: HPA) => {
    const metric = hpa.status?.currentMetrics?.find((m: any) => m.resource?.name === 'cpu');
    return metric?.resource?.current?.averageUtilization ?? null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <TrendingUp size={18} style={{ color: 'var(--accent-blue)' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{hpas.length} HPA{hpas.length !== 1 ? 's' : ''} active</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={refresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New HPA
          </button>
        </div>
      </div>

      {/* Unscaled targets notice */}
      {allTargets.filter(t => !hpaTargetNames.has(`${t.kind}/${t.namespace}/${t.name}`)).length > 0 && (
        <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', marginBottom: 6, fontWeight: 600 }}>
            Workloads without autoscaling
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {allTargets.filter(t => !hpaTargetNames.has(`${t.kind}/${t.namespace}/${t.name}`)).map(t => (
              <button
                key={`${t.kind}/${t.namespace}/${t.name}`}
                className="btn btn-sm"
                style={{ fontSize: '0.75rem' }}
                onClick={() => {
                  setForm({ ...emptyForm, targetKind: t.kind, targetName: t.name, namespace: t.namespace });
                  setShowCreate(true);
                }}
              >
                <Plus size={11} /> {t.kind}/{t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* HPA list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {hpas.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            No HPAs found. Create one to enable autoscaling.
          </div>
        )}
        {hpas.map(hpa => {
          const isEditing = editHpa?.metadata.name === hpa.metadata.name && editHpa?.metadata.namespace === hpa.metadata.namespace;
          const util = getUtilization(hpa);
          const cpuTarget = getCpuTarget(hpa);
          const current = hpa.status?.currentReplicas ?? 0;
          const desired = hpa.status?.desiredReplicas ?? 0;

          return (
            <div key={`${hpa.metadata.namespace}/${hpa.metadata.name}`}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{hpa.metadata.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 2 }}>
                    {hpa.metadata.namespace} · {hpa.spec.scaleTargetRef.kind}/{hpa.spec.scaleTargetRef.name}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {isEditing ? (
                    <>
                      <button className="btn btn-sm btn-primary" onClick={handleSaveEdit}><Check size={13} /></button>
                      <button className="btn btn-sm" onClick={() => setEditHpa(null)}><X size={13} /></button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-sm" onClick={() => { setEditHpa(hpa); setEditMin(String(hpa.spec.minReplicas)); setEditMax(String(hpa.spec.maxReplicas)); }}>
                        <Edit2 size={13} />
                      </button>
                      <button className="btn btn-sm" style={{ color: 'var(--accent-error)' }} onClick={() => handleDelete(hpa)}>
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 14 }}>
                <div style={{ background: 'var(--bg-main)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>Min Replicas</div>
                  {isEditing ? (
                    <input type="number" className="exec-input" style={{ width: '100%', padding: '2px 6px', fontSize: '0.9rem' }}
                      value={editMin} onChange={e => setEditMin(e.target.value)} min="1" />
                  ) : (
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{hpa.spec.minReplicas}</div>
                  )}
                </div>
                <div style={{ background: 'var(--bg-main)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>Max Replicas</div>
                  {isEditing ? (
                    <input type="number" className="exec-input" style={{ width: '100%', padding: '2px 6px', fontSize: '0.9rem' }}
                      value={editMax} onChange={e => setEditMax(e.target.value)} min="1" />
                  ) : (
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{hpa.spec.maxReplicas}</div>
                  )}
                </div>
                <div style={{ background: 'var(--bg-main)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>Current / Desired</div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{current} / {desired}</div>
                </div>
                <div style={{ background: 'var(--bg-main)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>CPU {util !== null ? `${util}%` : ''} / Target</div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{cpuTarget}%</div>
                </div>
              </div>

              {/* Replica bar */}
              {hpa.spec.maxReplicas > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ height: 6, background: 'var(--bg-main)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.min(100, (current / hpa.spec.maxReplicas) * 100)}%`,
                      background: current >= hpa.spec.maxReplicas ? 'var(--accent-error)' : 'var(--accent-blue)',
                      borderRadius: 3,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    <span>{hpa.spec.minReplicas} min</span><span>{hpa.spec.maxReplicas} max</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create HPA Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <div className="modal-title">Create Horizontal Pod Autoscaler</div>
              <button className="btn btn-icon" onClick={() => setShowCreate(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>HPA Name</label>
                  <input className="exec-input" style={{ padding: '7px 10px' }} required value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. my-app-hpa" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Namespace</label>
                  <input className="exec-input" style={{ padding: '7px 10px' }} required value={form.namespace}
                    onChange={e => setForm({ ...form, namespace: e.target.value })} placeholder="default" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Target Kind</label>
                  <select className="exec-input" style={{ padding: '7px 10px' }} value={form.targetKind}
                    onChange={e => setForm({ ...form, targetKind: e.target.value })}>
                    <option>Deployment</option>
                    <option>StatefulSet</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Target Name</label>
                  <input list="target-names" className="exec-input" style={{ padding: '7px 10px' }} required value={form.targetName}
                    onChange={e => setForm({ ...form, targetName: e.target.value })} placeholder="deployment-name" />
                  <datalist id="target-names">
                    {allTargets.filter(t => t.kind === form.targetKind).map(t => <option key={t.name} value={t.name} />)}
                  </datalist>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Min Replicas</label>
                  <input type="number" className="exec-input" style={{ padding: '7px 10px' }} min="1" required value={form.minReplicas}
                    onChange={e => setForm({ ...form, minReplicas: e.target.value })} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Max Replicas</label>
                  <input type="number" className="exec-input" style={{ padding: '7px 10px' }} min="1" required value={form.maxReplicas}
                    onChange={e => setForm({ ...form, maxReplicas: e.target.value })} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>CPU Target %</label>
                  <input type="number" className="exec-input" style={{ padding: '7px 10px' }} min="1" max="100" value={form.cpuTarget}
                    onChange={e => setForm({ ...form, cpuTarget: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Memory Target % (optional)</label>
                <input type="number" className="exec-input" style={{ padding: '7px 10px' }} min="1" max="100" value={form.memoryTarget}
                  onChange={e => setForm({ ...form, memoryTarget: e.target.value })} placeholder="e.g. 80" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create HPA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
