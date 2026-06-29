import React from 'react';
import { ShieldAlert, CheckCircle2, AlertCircle, AlertTriangle, ChevronRight, Package } from 'lucide-react';
import { type Issue, type RecentWarning, SEV_COLOR } from './types';

// Active issues panel — the core troubleshooting view. Clicking an issue opens
// the drill-down drawer via onSelectIssue.
export const IssuesPanel: React.FC<{
  issues: Issue[];
  criticalCount: number;
  warningCount: number;
  onSelectIssue: (issue: Issue) => void;
  style?: React.CSSProperties;
}> = ({ issues, criticalCount, warningCount, onSelectIssue, style }) => (
  <div className="dashboard-chart-card" style={{ gridColumn: '1 / -1', ...style }}>
    <div className="dashboard-chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldAlert size={15} /> ISSUES
      </span>
      <span style={{ display: 'flex', gap: 10, fontSize: '0.7rem' }}>
        {criticalCount > 0 && <span style={{ color: 'var(--accent-error)', fontWeight: 700 }}>{criticalCount} CRITICAL</span>}
        {warningCount > 0 && <span style={{ color: 'var(--accent-warning)', fontWeight: 700 }}>{warningCount} WARNING</span>}
      </span>
    </div>
    {issues.length === 0 ? (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '28px 0', color: 'var(--accent-green)' }}>
        <CheckCircle2 size={32} />
        <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>No active issues detected</span>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>All workloads, nodes and deployments are healthy.</span>
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6, maxHeight: 360, overflowY: 'auto' }}>
        {issues.map((iss, idx) => {
          const grouped = (iss.count || 1) > 1;
          const displayName = grouped && iss.ownerName ? `${iss.ownerKind}/${iss.ownerName}` : `${iss.namespace ? `${iss.namespace}/` : ''}${iss.name}`;
          return (
            <div
              key={`${iss.kind}-${iss.namespace}-${iss.name}-${iss.reason}-${idx}`}
              onClick={() => onSelectIssue(iss)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px',
                borderRadius: 6, cursor: 'pointer',
                borderLeft: `3px solid ${SEV_COLOR[iss.severity]}`,
                background: 'rgba(255,255,255,0.015)',
                transition: 'background 0.15s'
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.015)')}
            >
              {iss.severity === 'critical'
                ? <AlertCircle size={16} style={{ color: SEV_COLOR.critical, flexShrink: 0 }} />
                : <AlertTriangle size={16} style={{ color: SEV_COLOR.warning, flexShrink: 0 }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: SEV_COLOR[iss.severity], textTransform: 'uppercase', letterSpacing: 0.4 }}>{iss.reason}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4 }}>{iss.kind}</span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }}>
                    {displayName}
                  </span>
                  {grouped && (
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: SEV_COLOR[iss.severity], background: `${SEV_COLOR[iss.severity]}22`, padding: '1px 6px', borderRadius: 10 }}>×{iss.count} pods</span>
                  )}
                  {!!iss.restarts && iss.restarts > 0 && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--accent-warning)' }}>↻ {iss.restarts}</span>
                  )}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {iss.message}
                </div>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </div>
          );
        })}
      </div>
    )}
  </div>
);

// Recent warning events panel.
export const WarningsPanel: React.FC<{ warnings: RecentWarning[]; onViewEvents: () => void }> = ({ warnings, onViewEvents }) => (
  <div className="dashboard-chart-card" style={{ cursor: 'pointer' }} onClick={onViewEvents}
    onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
    onMouseLeave={e => (e.currentTarget.style.borderColor = '')}>
    <div className="dashboard-chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span>WARNINGS <span className="dashboard-chart-subtitle">LAST HOUR</span></span>
      <span style={{ fontSize: '0.65rem', color: 'var(--accent-blue)', fontWeight: 600, letterSpacing: 0.3 }}>VIEW EVENTS →</span>
    </div>
    {(!warnings || warnings.length === 0) ? (
      <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', padding: '18px 0' }}>
        No warning events in the last hour
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
        {warnings.map((w, i) => (
          <div key={i} style={{ fontSize: '0.75rem', borderLeft: '2px solid var(--accent-warning)', paddingLeft: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: 'var(--accent-warning)' }}>{w.reason}</span>
              {w.count > 1 && <span style={{ color: 'var(--text-muted)' }}>×{w.count}</span>}
              <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {w.kind}/{w.namespace ? `${w.namespace}/` : ''}{w.name}
              </span>
            </div>
            <div style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.message}</div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// Recent Helm/Zarf deployments panel.
export const DeploymentsPanel: React.FC<{ deployments: any[]; onViewHelm: () => void }> = ({ deployments, onViewHelm }) => (
  <div className="dashboard-chart-card" style={{ cursor: 'pointer' }} onClick={onViewHelm}
    onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
    onMouseLeave={e => (e.currentTarget.style.borderColor = '')}>
    <div className="dashboard-chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Package size={14} /> RECENT DEPLOYMENTS <span className="dashboard-chart-subtitle">HELM & ZARF</span>
      </span>
      <span style={{ fontSize: '0.65rem', color: 'var(--accent-blue)', fontWeight: 600, letterSpacing: 0.3 }}>VIEW HELM →</span>
    </div>
    {(!deployments || deployments.length === 0) ? (
      <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', padding: '28px 0' }}>
        No recent deployments found
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
        {deployments.map((d, i) => (
          <div key={i} style={{ fontSize: '0.75rem', borderLeft: `2px solid ${d.type === 'helm' ? 'var(--accent-pink)' : 'var(--accent-warning)'}`, paddingLeft: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="badge" style={{ transform: 'none', textTransform: 'uppercase', fontSize: '0.6rem', padding: '1px 4px', background: d.type === 'helm' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(245, 158, 11, 0.15)', color: d.type === 'helm' ? 'var(--accent-pink)' : 'var(--accent-warning)', border: 'none' }}>
                  {d.type}
                </span>
                <span style={{ fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.name}>
                  {d.name}
                </span>
              </div>
              <div style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.7rem', marginTop: 2 }}>
                {d.type === 'helm' ? `ns: ${d.namespace} · version: ${d.version}` : `version: ${d.version || 'unknown'}`}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {d.timestamp ? new Date(d.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'recently'}
              </div>
              <span className="badge" style={{ fontSize: '0.6rem', padding: '0px 4px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-green)', border: 'none', textTransform: 'uppercase', marginTop: 2 }}>
                {d.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);
