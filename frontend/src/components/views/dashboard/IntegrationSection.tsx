import { CheckCircle2, Image as ImageIcon, Database, RefreshCw, AlertCircle, MemoryStick } from 'lucide-react';

// Integration readiness: the things that actually block a new workload from
// coming up — image-pull failures, quota limits, restarting/unschedulable pods,
// and workloads already past their memory request.
export const IntegrationSection: React.FC<{
  data: any;
  namespace: string;
  onSelectPod: (name: string) => void;
}> = ({ data, namespace, onSelectPod }) => {
  const quotas = data?.quotas || [];
  const imagePullIssues = data?.imagePullIssues || [];
  const podRestarts = data?.podRestarts || [];
  const unschedulable = data?.unschedulable || [];
  const overMemory = data?.overMemory || [];
  const hasAnything = quotas.length || imagePullIssues.length || podRestarts.length || unschedulable.length || overMemory.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!hasAnything ? (
        <div className="dashboard-chart-card" style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--accent-green)' }}>
          <CheckCircle2 size={18} />
          <span style={{ fontSize: '0.85rem' }}>No quota limits, image-pull failures, pod restarts or resource issues detected{namespace && namespace !== 'all' ? ` in ${namespace}` : ''}.</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {/* Image pull failures */}
          {imagePullIssues.length > 0 && (
            <div className="dashboard-chart-card">
              <div className="dashboard-chart-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ImageIcon size={13} /> IMAGE PULL FAILURES
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {imagePullIssues.map((p: any, i: number) => (
                  <div key={i} style={{ fontSize: '0.76rem' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: 'var(--accent-error)' }}>{p.reason}</span>
                      <span style={{ color: 'var(--text-muted)' }}>registry: {p.registry}</span>
                      {p.count > 1 && <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>×{p.count}</span>}
                    </div>
                    <div style={{ color: 'var(--text-main)', wordBreak: 'break-all' }}>{p.image}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resource quotas */}
          {quotas.length > 0 && (
            <div className="dashboard-chart-card">
              <div className="dashboard-chart-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Database size={13} /> RESOURCE QUOTAS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
                {quotas.map((q: any, i: number) => (
                  <div key={i}>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 4 }}>{q.namespace}/{q.name}</div>
                    {(q.entries || []).slice(0, 6).map((e: any, j: number) => (
                      <div key={j} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{e.resource}</span>
                        <span style={{ fontWeight: 600 }}>{e.used} / {e.hard}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pod restarts */}
          {podRestarts.length > 0 && (
            <div className="dashboard-chart-card">
              <div className="dashboard-chart-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={13} /> POD RESTARTS
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>Pods experiencing container restarts.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
                {podRestarts.map((p: any, i: number) => (
                  <div key={i} onClick={() => onSelectPod(p.name)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', alignItems: 'center', cursor: 'pointer', padding: '3px 6px', borderRadius: 4, transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${p.namespace}/${p.name}`}>
                      {p.namespace}/{p.name}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {p.isOOMKilled && (
                        <span style={{ fontSize: '0.65rem', padding: '1px 4px', borderRadius: 3, background: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-error)', fontWeight: 600 }}>OOM</span>
                      )}
                      <span style={{ color: p.restarts > 5 ? 'var(--accent-error)' : 'var(--text-muted)', fontWeight: 600 }}>{p.restarts} restart{p.restarts > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unschedulable pods */}
          {unschedulable.length > 0 && (
            <div className="dashboard-chart-card">
              <div className="dashboard-chart-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={13} style={{ color: 'var(--accent-warning)' }} /> UNSCHEDULABLE PODS
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>Pods unable to be scheduled on any node.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
                {unschedulable.map((u: any, i: number) => (
                  <div key={i} style={{ fontSize: '0.76rem' }}>
                    <div style={{ fontWeight: 600, color: 'var(--accent-warning)', wordBreak: 'break-all' }}>{u.namespace}/{u.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: 2, wordBreak: 'break-word' }}>{u.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Memory exceeding requests */}
          {overMemory.length > 0 && (
            <div className="dashboard-chart-card">
              <div className="dashboard-chart-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <MemoryStick size={13} /> MEMORY OVER REQUEST
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>Using more memory than requested — OOM / eviction risk.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, maxHeight: 200, overflowY: 'auto' }}>
                {overMemory.map((m: any, i: number) => (
                  <div key={i} onClick={() => onSelectPod(m.name)} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', cursor: 'pointer', padding: '3px 6px', borderRadius: 4, transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.namespace}/{m.name}</span>
                    <span style={{ color: m.ratio >= 1.5 ? 'var(--accent-error)' : 'var(--accent-warning)' }}>{m.usageMiB}Mi / {m.requestMiB}Mi ({m.ratio}×)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
