import { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Trash2, RefreshCw, Play, PauseCircle, PlayCircle, X, ChevronDown, ChevronUp } from 'lucide-react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

interface CronJob {
  metadata: { name: string; namespace: string; creationTimestamp?: string };
  spec: {
    schedule: string;
    suspend?: boolean;
    concurrencyPolicy?: string;
    successfulJobsHistoryLimit?: number;
    failedJobsHistoryLimit?: number;
    jobTemplate?: any;
  };
  status?: {
    active?: any[];
    lastScheduleTime?: string;
    lastSuccessfulTime?: string;
  };
}

interface EnvVar { name: string; value: string }

const emptyForm = {
  name: '', namespace: 'default', schedule: '0 * * * *', image: '',
  command: '', args: '', restartPolicy: 'OnFailure',
  successfulJobsHistoryLimit: '3', failedJobsHistoryLimit: '1',
  concurrencyPolicy: 'Allow', suspend: false,
};

const SCHEDULE_PRESETS = [
  { label: 'Every minute', value: '* * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at midnight', value: '0 0 * * *' },
  { label: 'Every day at noon', value: '0 12 * * *' },
  { label: 'Every week (Mon)', value: '0 0 * * 1' },
  { label: 'Every month (1st)', value: '0 0 1 * *' },
];

export const CronJobManagerView = ({ selectedNs }: { selectedNs: string }) => {
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [envVars, setEnvVars] = useState<EnvVar[]>([{ name: '', value: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/resource/cronjobs', { params: { namespace: selectedNs } });
      setCronJobs(Array.isArray(res.data) ? res.data : res.data?.items || []);
    } catch (err: any) {
      console.error('Failed to load cronjobs', err);
    } finally {
      setLoading(false);
    }
  }, [selectedNs]);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/cronjob/create', { ...form, envVars: envVars.filter(v => v.name) });
      setShowCreate(false);
      setForm({ ...emptyForm });
      setEnvVars([{ name: '', value: '' }]);
      refresh();
    } catch (err: any) {
      alert('Failed to create CronJob: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSuspend = async (cj: CronJob, suspend: boolean) => {
    try {
      await api.put(`/cronjob/suspend/${cj.metadata.namespace}/${cj.metadata.name}`, { suspend });
      refresh();
    } catch (err: any) {
      alert('Failed to update CronJob: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleTrigger = async (cj: CronJob) => {
    const key = `${cj.metadata.namespace}/${cj.metadata.name}`;
    setTriggering(key);
    try {
      const res = await api.post(`/cronjob/trigger/${cj.metadata.namespace}/${cj.metadata.name}`);
      alert(`Job triggered: ${res.data.jobName}`);
      refresh();
    } catch (err: any) {
      alert('Trigger failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setTriggering(null);
    }
  };

  const handleDelete = async (cj: CronJob) => {
    if (!confirm(`Delete CronJob "${cj.metadata.name}"?`)) return;
    try {
      await api.delete(`/cronjob/${cj.metadata.namespace}/${cj.metadata.name}`);
      refresh();
    } catch (err: any) {
      alert('Delete failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const addEnvVar = () => setEnvVars(prev => [...prev, { name: '', value: '' }]);
  const removeEnvVar = (i: number) => setEnvVars(prev => prev.filter((_, idx) => idx !== i));
  const updateEnvVar = (i: number, field: 'name' | 'value', val: string) =>
    setEnvVars(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: val } : e));

  const getStatus = (cj: CronJob) => {
    if (cj.spec.suspend) return { label: 'Suspended', color: '#f59e0b' };
    if ((cj.status?.active || []).length > 0) return { label: 'Running', color: '#22c55e' };
    return { label: 'Scheduled', color: 'var(--accent-blue)' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Clock size={18} style={{ color: 'var(--accent-blue)' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{cronJobs.length} cron job{cronJobs.length !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={refresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> New CronJob
          </button>
        </div>
      </div>

      {cronJobs.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          No CronJobs found in this namespace.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {cronJobs.map(cj => {
          const key = `${cj.metadata.namespace}/${cj.metadata.name}`;
          const status = getStatus(cj);
          const isExpanded = expanded === key;
          const container = cj.spec.jobTemplate?.spec?.template?.spec?.containers?.[0];

          return (
            <div key={key} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                  <button className="btn btn-icon btn-sm" onClick={() => setExpanded(isExpanded ? null : key)} style={{ marginTop: 2, flexShrink: 0 }}>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{cj.metadata.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: 2 }}>
                      {cj.metadata.namespace} · <code style={{ background: 'var(--bg-main)', padding: '1px 6px', borderRadius: 4 }}>{cj.spec.schedule}</code>
                    </div>
                    {cj.status?.lastScheduleTime && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', marginTop: 2 }}>
                        Last run: {new Date(cj.status.lastScheduleTime).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  <span className="badge" style={{ background: `${status.color}15`, color: status.color, borderColor: `${status.color}30` }}>
                    {status.label}
                  </span>
                  <button
                    className="btn btn-sm"
                    title={triggering === key ? 'Triggering...' : 'Run now'}
                    disabled={triggering === key}
                    onClick={() => handleTrigger(cj)}>
                    {triggering === key ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
                  </button>
                  {cj.spec.suspend ? (
                    <button className="btn btn-sm" title="Resume" onClick={() => handleSuspend(cj, false)}>
                      <PlayCircle size={13} style={{ color: '#22c55e' }} />
                    </button>
                  ) : (
                    <button className="btn btn-sm" title="Suspend" onClick={() => handleSuspend(cj, true)}>
                      <PauseCircle size={13} style={{ color: '#f59e0b' }} />
                    </button>
                  )}
                  <button className="btn btn-sm" style={{ color: 'var(--accent-error)' }} onClick={() => handleDelete(cj)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border-color)', padding: '14px 20px', background: 'var(--bg-main)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: '0.8rem' }}>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Concurrency Policy</div>
                      <div>{cj.spec.concurrencyPolicy || 'Allow'}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>History Limit (ok/fail)</div>
                      <div>{cj.spec.successfulJobsHistoryLimit ?? 3} / {cj.spec.failedJobsHistoryLimit ?? 1}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Active Jobs</div>
                      <div>{(cj.status?.active || []).length}</div>
                    </div>
                    {container && (
                      <>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Image</div>
                          <code style={{ fontSize: '0.78rem' }}>{container.image}</code>
                        </div>
                        {container.command && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Command</div>
                            <code style={{ fontSize: '0.78rem' }}>{container.command.join(' ')}</code>
                          </div>
                        )}
                        {(container.env || []).length > 0 && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Environment</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {container.env.map((e: any) => (
                                <span key={e.name} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '2px 8px', fontSize: '0.76rem' }}>
                                  {e.name}={e.value}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 580, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div className="modal-title">Create CronJob</div>
              <button className="btn btn-icon" onClick={() => setShowCreate(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Name</label>
                  <input className="exec-input" style={{ padding: '7px 10px' }} required value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })} placeholder="my-cronjob" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Namespace</label>
                  <input className="exec-input" style={{ padding: '7px 10px' }} required value={form.namespace}
                    onChange={e => setForm({ ...form, namespace: e.target.value })} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Schedule (cron expression)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="exec-input" style={{ padding: '7px 10px', flex: 1, fontFamily: 'monospace' }} required value={form.schedule}
                    onChange={e => setForm({ ...form, schedule: e.target.value })} placeholder="0 * * * *" />
                  <select className="exec-input" style={{ padding: '7px 10px' }} value=""
                    onChange={e => { if (e.target.value) setForm({ ...form, schedule: e.target.value }); }}>
                    <option value="">Presets</option>
                    {SCHEDULE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Container Image</label>
                <input className="exec-input" style={{ padding: '7px 10px' }} required value={form.image}
                  onChange={e => setForm({ ...form, image: e.target.value })} placeholder="busybox:latest" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Command (optional)</label>
                  <input className="exec-input" style={{ padding: '7px 10px', fontFamily: 'monospace' }} value={form.command}
                    onChange={e => setForm({ ...form, command: e.target.value })} placeholder="/bin/sh" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Args (optional)</label>
                  <input className="exec-input" style={{ padding: '7px 10px', fontFamily: 'monospace' }} value={form.args}
                    onChange={e => setForm({ ...form, args: e.target.value })} placeholder="-c echo hello" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Concurrency Policy</label>
                  <select className="exec-input" style={{ padding: '7px 10px' }} value={form.concurrencyPolicy}
                    onChange={e => setForm({ ...form, concurrencyPolicy: e.target.value })}>
                    <option>Allow</option>
                    <option>Forbid</option>
                    <option>Replace</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Restart Policy</label>
                  <select className="exec-input" style={{ padding: '7px 10px' }} value={form.restartPolicy}
                    onChange={e => setForm({ ...form, restartPolicy: e.target.value })}>
                    <option>OnFailure</option>
                    <option>Never</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>History (ok / fail)</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="number" className="exec-input" style={{ padding: '7px 10px', width: '50%' }} min="0" value={form.successfulJobsHistoryLimit}
                      onChange={e => setForm({ ...form, successfulJobsHistoryLimit: e.target.value })} />
                    <input type="number" className="exec-input" style={{ padding: '7px 10px', width: '50%' }} min="0" value={form.failedJobsHistoryLimit}
                      onChange={e => setForm({ ...form, failedJobsHistoryLimit: e.target.value })} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Environment Variables</label>
                  <button type="button" className="btn btn-sm" onClick={addEnvVar}><Plus size={12} /> Add</button>
                </div>
                {envVars.map((ev, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8 }}>
                    <input className="exec-input" style={{ padding: '6px 10px', flex: 1 }} placeholder="KEY" value={ev.name}
                      onChange={e => updateEnvVar(i, 'name', e.target.value)} />
                    <input className="exec-input" style={{ padding: '6px 10px', flex: 2 }} placeholder="value" value={ev.value}
                      onChange={e => updateEnvVar(i, 'value', e.target.value)} />
                    <button type="button" className="btn btn-icon btn-sm" onClick={() => removeEnvVar(i)}><X size={13} /></button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="suspend-chk" checked={form.suspend}
                  onChange={e => setForm({ ...form, suspend: e.target.checked })} />
                <label htmlFor="suspend-chk" style={{ fontSize: '0.82rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  Create as suspended (won't run until resumed)
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create CronJob'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
