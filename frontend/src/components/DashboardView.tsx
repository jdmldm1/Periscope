import React, { useState } from 'react';
import {
  Activity, Command, Box, Package, Server, Layers,
  AlertTriangle, AlertCircle, CheckCircle2, ShieldAlert, Cpu, MemoryStick, ChevronRight,
  X, FileText, Image as ImageIcon, Database, ExternalLink, RefreshCw
} from 'lucide-react';
import { useIssueDetail, useIntegrationReadiness } from '../utils/kubeHooks';

interface DashboardViewProps {
  dashboardData: any;
  namespace: string;
  cpuHistory: number[];
  memHistory: number[];
  setActiveTab: (tab: any) => void;
  setSearch: (search: string) => void;
  setIsCmdPaletteOpen: (open: boolean) => void;
  zarfStatus: { installed: boolean; version?: string };
  runningImagesScanResults: Record<string, { sbom: any; vulnerabilities: any; status: 'pending' | 'scanning' | 'success' | 'failed' | 'notScanned'; error?: string }>;
  kubescapeReport: any;
}

interface Issue {
  severity: 'critical' | 'warning' | 'info';
  kind: string;
  namespace: string;
  name: string;
  reason: string;
  message: string;
  restarts?: number;
  ownerKind?: string;
  ownerName?: string;
  count?: number;
}

interface RecentWarning {
  reason: string;
  message: string;
  kind: string;
  name: string;
  namespace: string;
  count: number;
  timestamp?: string;
}

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--accent-error)',
  warning: 'var(--accent-warning)',
  info: 'var(--accent-blue)',
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  dashboardData,
  namespace,
  setActiveTab,
  setSearch,
  setIsCmdPaletteOpen,
  zarfStatus,
  runningImagesScanResults,
  kubescapeReport,
}) => {
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const integration = useIntegrationReadiness(namespace);
  const issueDetailParams = selectedIssue
    ? { kind: selectedIssue.kind, namespace: selectedIssue.namespace, name: selectedIssue.name }
    : null;
  const { data: issueDetail, isLoading: issueLoading } = useIssueDetail(issueDetailParams);

  const goToResource = (kind: string, name: string) => {
    const tab = kind === 'Node' ? 'nodes'
      : kind === 'Deployment' ? 'deployments'
      : kind === 'Pod' ? 'pods'
      : 'pods';
    setSearch(name || '');
    setActiveTab(tab);
  };

  // ---- Health-focused summary card (healthy vs unhealthy) ----
  const renderHealthStat = (opts: {
    icon: React.ReactNode;
    label: string;
    healthy: number;
    total: number;
    badLabel: string;
    bad: number;
    onClick?: () => void;
  }) => {
    const { icon, label, healthy, total, badLabel, bad, onClick } = opts;
    const ok = bad === 0;
    const pct = total > 0 ? Math.round((healthy / total) * 100) : 100;
    const accent = ok ? 'var(--accent-green)' : (badLabel.toLowerCase().includes('critical') || bad > 0 && label === 'Nodes' ? 'var(--accent-error)' : 'var(--accent-warning)');
    return (
      <div
        className="dashboard-chart-card"
        style={{ cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 10, borderLeft: `3px solid ${ok ? 'var(--accent-green)' : accent}` }}
        onClick={onClick}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {icon} {label}
          </div>
          {ok
            ? <CheckCircle2 size={18} style={{ color: 'var(--accent-green)' }} />
            : <AlertTriangle size={18} style={{ color: accent }} />}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--text-main)' }}>{healthy}</span>
          <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/ {total} healthy</span>
        </div>
        <div className="metric-bar-wrapper" style={{ height: 6 }}>
          <div className={`metric-bar-fill ${ok ? 'normal' : (accent === 'var(--accent-error)' ? 'critical' : 'warning')}`} style={{ width: `${pct}%` }} />
        </div>
        <div style={{ fontSize: '0.75rem', color: ok ? 'var(--text-muted)' : accent, fontWeight: ok ? 400 : 700 }}>
          {ok ? 'All healthy' : `${bad} ${badLabel}`}
        </div>
      </div>
    );
  };

  // ---- Compact resource utilization bar (single source of truth) ----
  const renderUtilBar = (opts: { pct: number; title: string; sub: string; icon: React.ReactNode; available: boolean }) => {
    const { pct, title, sub, icon, available } = opts;
    const color = pct >= 90 ? 'var(--accent-error)' : pct >= 75 ? 'var(--accent-warning)' : 'var(--accent-green)';
    const cls = pct >= 90 ? 'critical' : pct >= 75 ? 'warning' : 'normal';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 0.4 }}>
            {icon} {title}
          </span>
          {available
            ? <span style={{ fontSize: '0.95rem', fontWeight: 800, color }}>{pct}%</span>
            : <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>metrics-server unavailable</span>}
        </div>
        <div className="metric-bar-wrapper" style={{ height: 8 }}>
          <div className={`metric-bar-fill ${cls}`} style={{ width: available ? `${pct}%` : '0%' }} />
        </div>
        {available && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sub}</span>}
      </div>
    );
  };

  // ---- Pod health doughnut (healthy vs failing/pending/not-ready) ----
  const renderPodHealthDoughnut = (ph: any) => {
    if (!ph) return null;
    const failing = (ph.crashLooping || 0) + (ph.imagePullError || 0) + (ph.configError || 0) + (ph.oomKilled || 0) + (ph.failed || 0);
    const notReady = (ph.notReady || 0) + (ph.terminating || 0);
    const pending = ph.pending || 0;
    const healthy = ph.healthy || 0;
    const segments = [
      { label: 'Healthy', value: healthy, color: 'var(--accent-green)' },
      { label: 'Failing', value: failing, color: 'var(--accent-error)' },
      { label: 'Pending', value: pending, color: 'var(--accent-warning)' },
      { label: 'Not Ready', value: notReady, color: 'var(--accent-cyan)' },
    ];
    const total = segments.reduce((s, x) => s + x.value, 0);
    if (total === 0) {
      return <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>No Pods in scope</div>;
    }
    const r = 40;
    const circ = 2 * Math.PI * r;
    let offset = 0;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
        <svg width="130" height="130" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={r} fill="transparent" stroke="var(--border-color)" strokeWidth="12" />
          {segments.map((seg) => {
            if (seg.value === 0) return null;
            const pct = seg.value / total;
            const dash = `${pct * circ} ${circ}`;
            const el = (
              <circle key={seg.label} cx="60" cy="60" r={r} fill="transparent"
                stroke={seg.color} strokeWidth="12"
                strokeDasharray={dash} strokeDashoffset={-offset}
                transform="rotate(-90 60 60)"
              />
            );
            offset += pct * circ;
            return el;
          })}
          <text x="60" y="56" textAnchor="middle" dy="0.3em" className="circular-gauge-text" style={{ fontSize: '1.4rem', fill: failing > 0 ? 'var(--accent-error)' : 'var(--accent-green)' }}>
            {Math.round((healthy / total) * 100)}%
          </text>
          <text x="60" y="78" textAnchor="middle" className="circular-gauge-label" style={{ fontSize: '0.5rem' }}>
            Healthy
          </text>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem' }}>
          {segments.map(seg => (
            <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, display: 'inline-block' }} />
              <span style={{ color: 'var(--text-muted)', width: 80 }}>{seg.label}:</span>
              <span style={{ fontWeight: 600 }}>{seg.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ---- Active issues panel — the core troubleshooting view ----
  const renderIssuesPanel = (issues: Issue[], criticalCount: number, warningCount: number) => {
    return (
      <div className="dashboard-chart-card" style={{ gridColumn: '1 / -1' }}>
        <div className="dashboard-chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldAlert size={15} /> ACTIVE ISSUES
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
                onClick={() => setSelectedIssue(iss)}
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
  };

  // ---- Recent warning events panel ----
  const renderWarningsPanel = (warnings: RecentWarning[]) => (
    <div className="dashboard-chart-card">
      <div className="dashboard-chart-title">
        RECENT WARNING EVENTS
        <span className="dashboard-chart-subtitle">LAST HOUR</span>
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

  const renderDeploymentsPanel = (deployments: any[]) => (
    <div className="dashboard-chart-card">
      <div className="dashboard-chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Package size={14} /> RECENT DEPLOYMENTS
        </span>
        <span className="dashboard-chart-subtitle">HELM & ZARF</span>
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

  // ---- Issue drill-down drawer (evidence for resolution) ----
  const renderIssueDrawer = () => {
    if (!selectedIssue) return null;
    const d = issueDetail;
    const sevColor = SEV_COLOR[selectedIssue.severity];
    return (
      <>
        <div onClick={() => setSelectedIssue(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, animation: 'fadeIn 0.15s' }} />
        <div style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(620px, 95vw)', zIndex: 201,
          background: 'var(--bg-card, #0d1b2a)', borderLeft: `1px solid var(--border-color)`,
          boxShadow: '-12px 0 40px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
        }}>
          {/* header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: sevColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>{selectedIssue.reason}</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4 }}>{selectedIssue.kind}</span>
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: 4, wordBreak: 'break-all' }}>
                {selectedIssue.namespace ? `${selectedIssue.namespace}/` : ''}{selectedIssue.name}
              </div>
              {(selectedIssue.count || 1) > 1 && (
                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Showing one of {selectedIssue.count} affected pods · owner {selectedIssue.ownerKind}/{selectedIssue.ownerName}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button className="btn btn-sm" title="Open in resource view" onClick={() => { goToResource(selectedIssue.kind, selectedIssue.name); setSelectedIssue(null); }} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)' }}>
                <ExternalLink size={12} /> Open
              </button>
              <button className="btn btn-sm" onClick={() => setSelectedIssue(null)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)' }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {/* body */}
          <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18, fontSize: '0.82rem' }}>
            {issueLoading && !d && <div className="loader-container" style={{ padding: 30 }}><div className="loader" /></div>}

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

            {d && !issueLoading && !d.error
              && !(d.containers?.length) && !(d.events?.length) && !d.logs && !d.replicas && (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No additional detail available.</div>
            )}
          </div>
        </div>
      </>
    );
  };

  // ---- Integration readiness section (#4) ----
  const renderIntegrationSection = () => {
    const data = integration.data;
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
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', alignItems: 'center' }}>
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
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem' }}>
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

  const renderSecuritySection = () => {
    let criticalVulns = 0, highVulns = 0, mediumVulns = 0, lowVulns = 0;
    Object.values(runningImagesScanResults).forEach(res => {
      if (res.status === 'success' && res.vulnerabilities && res.vulnerabilities.matches) {
        res.vulnerabilities.matches.forEach((m: any) => {
          const sev = (m.vulnerability?.severity || '').toLowerCase();
          if (sev === 'critical') criticalVulns++;
          else if (sev === 'high') highVulns++;
          else if (sev === 'medium') mediumVulns++;
          else if (sev === 'low') lowVulns++;
        });
      }
    });

    const complianceScore = kubescapeReport?.frameworks?.[0]?.complianceScore ?? null;
    const summary = kubescapeReport?.summary || {};
    const failedControls = (summary.critical || 0) + (summary.high || 0) + (summary.medium || 0) + (summary.low || 0);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontSize: '1.1rem', margin: 0, letterSpacing: 0.5 }}>SECURITY COMPLIANCE & SCANS</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <div
            className="dashboard-chart-card"
            style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
            onClick={() => setActiveTab('image-scanner')}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}
          >
            <div className="dashboard-chart-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              IMAGE VULNERABILITIES
              <span style={{ fontSize: '0.7rem', color: 'var(--accent-blue)' }}>VIEW SCANNER →</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 10 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>{criticalVulns}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Critical</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f59e0b' }}>{highVulns}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>High</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fbbf24' }}>{mediumVulns}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Medium</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#60a5fa' }}>{lowVulns}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Low</div>
              </div>
            </div>
          </div>

          <div
            className="dashboard-chart-card"
            style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
            onClick={() => setActiveTab('kubescape')}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'none'}
          >
            <div className="dashboard-chart-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              CLUSTER COMPLIANCE
              <span style={{ fontSize: '0.7rem', color: 'var(--accent-success)' }}>VIEW REPORT →</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <div>
                {complianceScore !== null ? (
                  <>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: complianceScore > 80 ? 'var(--accent-green)' : complianceScore > 50 ? 'var(--accent-warning)' : 'var(--accent-error)' }}>
                      {complianceScore}%
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>NSA-CISA SCORE</div>
                  </>
                ) : (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No Scan Data</div>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: failedControls > 0 ? '#ef4444' : 'var(--text-muted)' }}>{failedControls}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Failed Controls</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderResourceBarChart = (counts: any) => {
    const data = [
      { name: 'Pods', value: counts.pods || 0, color: 'var(--accent-green)' },
      { name: 'Deploys', value: counts.deployments || 0, color: 'var(--accent-cyan)' },
      { name: 'Services', value: counts.services || 0, color: 'var(--accent-blue)' },
      { name: 'Configs', value: (counts.configmaps || 0) + (counts.secrets || 0), color: 'var(--accent-purple)' },
      { name: 'Helm', value: counts.helmreleases || 0, color: 'var(--accent-pink)' },
      { name: 'Zarf', value: counts.zarfpackages || 0, color: 'var(--accent-warning)' },
    ];
    const maxVal = Math.max(...data.map(d => d.value), 1);
    const chartHeight = 100;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
        <div style={{ display: 'flex', height: chartHeight, alignItems: 'flex-end', gap: 16, borderBottom: '1px solid var(--border-color)', paddingBottom: 6 }}>
          {data.map(d => {
            const barHeight = Math.max(4, Math.round((d.value / maxVal) * chartHeight));
            return (
              <div key={d.name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: 2 }}>{d.value}</div>
                <div style={{ width: '100%', height: barHeight, background: d.color, borderRadius: '2px 2px 0 0', boxShadow: `0 0 10px ${d.color}33`, transition: 'height 1s ease-out' }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {data.map(d => (
            <div key={d.name} style={{ flex: 1, fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>{d.name}</div>
          ))}
        </div>
      </div>
    );
  };

  if (!dashboardData || Object.keys(dashboardData).length === 0) return <div className="loader-container"><div className="loader"></div></div>;
  if ('error' in (dashboardData as any)) {
    return (
      <div style={{ padding: '32px', color: 'var(--accent-error)', fontFamily: 'var(--font-mono)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Failed to Load Dashboard Stats</h2>
        <div style={{ background: 'rgba(238, 0, 0, 0.05)', border: '1px solid rgba(238, 0, 0, 0.2)', padding: '16px', borderRadius: '6px', fontSize: '0.9rem' }}>
          {(dashboardData as any).error}
        </div>
      </div>
    );
  }

  const counts = (dashboardData as any).counts || {};
  const dashboardRes = (dashboardData as any).resources || {};
  const health = (dashboardData as any).health || {};
  const podHealth = (dashboardData as any).podHealth || {};
  const issues: Issue[] = (dashboardData as any).issues || [];
  const recentWarnings: RecentWarning[] = (dashboardData as any).recentWarnings || [];
  const recentDeployments: any[] = (dashboardData as any).recentDeployments || [];

  const cpuPct = dashboardRes?.cpuPct || 0;
  const memPct = dashboardRes?.memPct || 0;
  // cpuUse/cpuCap are millicores; memUse/memCap are Ki
  const cpuUseCores = (dashboardRes?.cpuUse || 0) / 1000;
  const cpuCapCores = (dashboardRes?.cpuCap || 0) / 1000;
  const memUseGiB = (dashboardRes?.memUse || 0) / (1024 * 1024);
  const memCapGiB = (dashboardRes?.memCap || 0) / (1024 * 1024);
  // Usage is only populated when metrics-server is installed
  const metricsAvailable = (dashboardRes?.cpuUse || 0) > 0 || (dashboardRes?.memUse || 0) > 0;

  const overall = health.overall || 'healthy';
  const overallMeta = overall === 'critical'
    ? { color: 'var(--accent-error)', label: 'CRITICAL', icon: <AlertCircle size={26} /> }
    : overall === 'degraded'
    ? { color: 'var(--accent-warning)', label: 'DEGRADED', icon: <AlertTriangle size={26} /> }
    : { color: 'var(--accent-green)', label: 'HEALTHY', icon: <CheckCircle2 size={26} /> };

  const nodes = health.nodes || { total: counts.nodes || 0, ready: counts.nodes || 0, notReady: 0 };
  const podsH = health.pods || { total: counts.pods || 0, healthy: counts.pods || 0, unhealthy: 0 };
  const workloads = health.workloads || { total: counts.deployments || 0, healthy: counts.deployments || 0, degraded: 0 };

  return (
    <div className="dashboard-container animate-fade-in">
      {/* Cluster Health Banner */}
      <div style={{
        background: `linear-gradient(135deg, ${overallMeta.color}1a 0%, rgba(27, 38, 59, 0.15) 100%)`,
        border: `1px solid ${overallMeta.color}40`,
        borderRadius: 'var(--radius-lg)',
        padding: '20px 28px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '24px',
        flexWrap: 'wrap',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.25)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ position: 'relative', width: 62, height: 62, flexShrink: 0 }}>
            <svg width="62" height="62" viewBox="0 0 60 60">
              <circle cx="30" cy="30" r="26" fill="transparent" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="4" />
              <circle 
                cx="30" 
                cy="30" 
                r="26" 
                fill="transparent" 
                stroke={overallMeta.color} 
                strokeWidth="4" 
                strokeDasharray={`${2 * Math.PI * 26}`}
                strokeDashoffset={`${2 * Math.PI * 26 * (1 - (health.score ?? 100) / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 30 30)"
                style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
              />
            </svg>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                {health.score ?? 100}%
              </span>
              <span style={{ fontSize: '0.42rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.2px', marginTop: 2 }}>HEALTH</span>
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.5px' }}>Cluster Health</h1>
              <span style={{ background: overallMeta.color, color: '#000', fontWeight: 800, fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, letterSpacing: 0.5 }}>
                {overallMeta.label}
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '6px 0 0' }}>
              {issues.length === 0
                ? 'No active issues — all nodes, workloads and pods are healthy.'
                : <>
                    <span style={{ color: 'var(--accent-error)', fontWeight: 700 }}>{health.criticalCount || 0} critical</span>
                    {' · '}
                    <span style={{ color: 'var(--accent-warning)', fontWeight: 700 }}>{health.warningCount || 0} warning</span>
                    {' issues need attention'}
                  </>}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-primary btn-sm" onClick={() => { setActiveTab('topology'); setSearch(''); }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Activity size={12} /> Topology
          </button>
          <button className="btn btn-sm" onClick={() => setIsCmdPaletteOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
            <Command size={12} /> Command Palette
          </button>
        </div>
      </div>

      {/* Active issues — primary error-resolution panel */}
      <div className="dashboard-charts-grid" style={{ gridTemplateColumns: '1fr' }}>
        {renderIssuesPanel(issues, health.criticalCount || 0, health.warningCount || 0)}
      </div>

      {/* Cluster state overview: health (healthy vs unhealthy) + resource utilization, once */}
      <h2 style={{ fontSize: '1.1rem', margin: '4px 0 0', letterSpacing: 0.5 }}>CLUSTER STATE OVERVIEW</h2>
      <div className="dashboard-charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {renderHealthStat({
          icon: <Server size={14} />, label: 'Nodes',
          healthy: nodes.ready, total: nodes.total,
          bad: nodes.notReady, badLabel: 'not ready',
          onClick: () => setActiveTab('nodes'),
        })}
        {renderHealthStat({
          icon: <Box size={14} />, label: 'Pods',
          healthy: podsH.healthy, total: podsH.total,
          bad: podsH.unhealthy, badLabel: 'unhealthy',
          onClick: () => setActiveTab('pods'),
        })}
        {renderHealthStat({
          icon: <Layers size={14} />, label: 'Deployments',
          healthy: workloads.healthy, total: workloads.total,
          bad: workloads.degraded, badLabel: 'degraded',
          onClick: () => setActiveTab('deployments'),
        })}
        <div className="dashboard-chart-card" style={{ display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center' }}>
          {renderUtilBar({ pct: cpuPct, title: 'CPU', sub: `${cpuUseCores.toFixed(1)} / ${cpuCapCores.toFixed(0)} cores`, icon: <Cpu size={13} />, available: metricsAvailable })}
          {renderUtilBar({ pct: memPct, title: 'MEMORY', sub: `${memUseGiB.toFixed(1)} / ${memCapGiB.toFixed(1)} GiB`, icon: <MemoryStick size={13} />, available: metricsAvailable })}
        </div>
      </div>

      {/* Pod health + recent warnings */}
      <div className="dashboard-charts-grid">
        <div className="dashboard-chart-card">
          <div className="dashboard-chart-title">POD HEALTH BREAKDOWN</div>
          {renderPodHealthDoughnut(podHealth)}
        </div>
        {renderWarningsPanel(recentWarnings)}
        {renderDeploymentsPanel(recentDeployments)}
      </div>

      {/* Inventory + security */}
      <div className="dashboard-charts-grid">
        <div className="dashboard-chart-card">
          <div className="dashboard-chart-title">RESOURCE INVENTORY</div>
          {renderResourceBarChart(counts)}
        </div>
      </div>

      {renderIntegrationSection()}

      {renderSecuritySection()}

      <div>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 14, letterSpacing: 0.5 }}>QUICK ACTION CONSOLE</h2>
        <div className="dashboard-quick-actions">
          <div className="quick-action-btn" onClick={() => setActiveTab('pods')}>
            <Box size={24} style={{ color: 'var(--accent-green)' }} />
            <span>Inspect Workloads</span>
          </div>
          <div className="quick-action-btn" onClick={() => setActiveTab('topology')}>
            <Activity size={24} style={{ color: 'var(--accent-cyan)' }} />
            <span>Topology Maps</span>
          </div>
          <div className="quick-action-btn" onClick={() => setActiveTab('helm')}>
            <Package size={24} style={{ color: 'var(--accent-pink)' }} />
            <span>Helm Deployer</span>
          </div>
          {zarfStatus.installed && (
            <div className="quick-action-btn" onClick={() => setActiveTab('zarf')}>
              <Package size={24} style={{ color: 'var(--accent-warning)' }} />
              <span>Zarf Console</span>
            </div>
          )}
          <div className="quick-action-btn" onClick={() => setIsCmdPaletteOpen(true)}>
            <Command size={24} style={{ color: 'var(--accent-purple)' }} />
            <span>Command Palette</span>
          </div>
        </div>
      </div>

      {renderIssueDrawer()}
    </div>
  );
};
