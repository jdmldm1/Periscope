import { X, FileText, ExternalLink } from 'lucide-react';
import { type Issue, SEV_COLOR } from './types';

// Issue drill-down drawer: shows the evidence needed to resolve a selected
// issue — container states, replicas, conditions, the previous container logs
// (the crash evidence), and recent events.
export const IssueDrawer: React.FC<{
  issue: Issue;
  detail: any;
  loading: boolean;
  onClose: () => void;
  onOpenResource: (kind: string, name: string) => void;
}> = ({ issue, detail: d, loading, onClose, onOpenResource }) => {
  const sevColor = SEV_COLOR[issue.severity];
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, animation: 'fadeIn 0.15s' }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(620px, 95vw)', zIndex: 201,
        background: 'var(--bg-card, #0d1b2a)', borderLeft: `1px solid var(--border-color)`,
        boxShadow: '-12px 0 40px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
      }}>
        {/* header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: sevColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>{issue.reason}</span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4 }}>{issue.kind}</span>
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: 4, wordBreak: 'break-all' }}>
              {issue.namespace ? `${issue.namespace}/` : ''}{issue.name}
            </div>
            {(issue.count || 1) > 1 && (
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Showing one of {issue.count} affected pods · owner {issue.ownerKind}/{issue.ownerName}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-sm" title="Open in resource view" onClick={() => { onOpenResource(issue.kind, issue.name); onClose(); }} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)' }}>
              <ExternalLink size={12} /> Open
            </button>
            <button className="btn btn-sm" onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* body */}
        <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18, fontSize: '0.82rem' }}>
          {loading && !d && <div className="loader-container" style={{ padding: 30 }}><div className="loader" /></div>}

          {d?.error && <div style={{ color: 'var(--accent-error)' }}>Failed to load detail: {d.error}</div>}

          {/* Container states */}
          {Array.isArray(d?.containers) && d.containers.length > 0 && (
            <div>
              <div className="dashboard-chart-title" style={{ marginBottom: 8 }}>CONTAINERS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {d.containers.map((c: any) => (
                  <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.ready ? 'var(--accent-green)' : 'var(--accent-error)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600 }}>{c.name}{c.init && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> (init)</span>}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{c.state}{c.waitingReason ? `: ${c.waitingReason}` : ''}</span>
                    {c.restartCount > 0 && <span style={{ color: 'var(--accent-warning)', marginLeft: 'auto' }}>↻ {c.restartCount}</span>}
                    {c.lastTerminated && (
                      <span style={{ color: 'var(--text-muted)', marginLeft: c.restartCount > 0 ? 8 : 'auto', fontSize: '0.72rem' }}>
                        last exit {c.lastTerminated.exitCode}{c.lastTerminated.reason ? ` (${c.lastTerminated.reason})` : ''}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deployment replicas */}
          {d?.replicas && (
            <div>
              <div className="dashboard-chart-title" style={{ marginBottom: 8 }}>REPLICAS</div>
              <div style={{ color: 'var(--text-muted)' }}>
                {d.replicas.ready}/{d.replicas.desired} ready · {d.replicas.available} available · {d.replicas.updated} updated
              </div>
              {Array.isArray(d.pods) && d.pods.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  {d.pods.map((p: any) => (
                    <div key={p.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.status === 'healthy' ? 'var(--accent-green)' : 'var(--accent-error)' }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{p.status}{p.restarts ? ` · ↻${p.restarts}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Conditions */}
          {Array.isArray(d?.conditions) && d.conditions.length > 0 && (
            <div>
              <div className="dashboard-chart-title" style={{ marginBottom: 8 }}>CONDITIONS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {d.conditions.filter((c: any) => c.type).map((c: any, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: 8 }}>
                    <span style={{ color: c.status === 'True' ? 'var(--accent-green)' : 'var(--accent-warning)', width: 130, flexShrink: 0 }}>{c.type}={c.status}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{c.reason}{c.message ? `: ${c.message}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Previous-container logs — the crash evidence */}
          {d?.logs && (
            <div>
              <div className="dashboard-chart-title" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={13} /> {d.logs.previous ? 'PREVIOUS CONTAINER LOGS' : 'CONTAINER LOGS'}
                <span className="dashboard-chart-subtitle">{d.logs.container}{d.logs.previous ? ' · before last crash' : ''}</span>
              </div>
              <pre style={{ margin: 0, padding: 12, background: '#000', borderRadius: 6, maxHeight: 260, overflow: 'auto', fontSize: '0.72rem', lineHeight: 1.45, color: '#d1d5db', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {d.logs.available ? (d.logs.text || '(empty)') : 'No logs available for this container.'}
              </pre>
            </div>
          )}

          {/* Events */}
          {Array.isArray(d?.events) && d.events.length > 0 && (
            <div>
              <div className="dashboard-chart-title" style={{ marginBottom: 8 }}>RECENT EVENTS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {d.events.map((e: any, i: number) => (
                  <div key={i} style={{ borderLeft: `2px solid ${e.type === 'Warning' ? 'var(--accent-warning)' : 'var(--border-color)'}`, paddingLeft: 8 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ fontWeight: 700, color: e.type === 'Warning' ? 'var(--accent-warning)' : 'var(--text-muted)' }}>{e.reason}</span>
                      {e.count > 1 && <span style={{ color: 'var(--text-muted)' }}>×{e.count}</span>}
                    </div>
                    <div style={{ color: 'var(--text-muted)' }}>{e.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {d && !loading && !d.error
            && !(d.containers?.length) && !(d.events?.length) && !d.logs && !d.replicas && (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No additional detail available.</div>
          )}
        </div>
      </div>
    </>
  );
};
