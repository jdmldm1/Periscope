import React from 'react';
import {
  Activity, Command, Box, Package, Server, Layers,
  AlertTriangle, AlertCircle, CheckCircle2, ShieldAlert, Cpu, MemoryStick, ChevronRight
} from 'lucide-react';

interface DashboardViewProps {
  dashboardData: any;
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
  setActiveTab,
  setSearch,
  setIsCmdPaletteOpen,
  zarfStatus,
  runningImagesScanResults,
  kubescapeReport,
}) => {
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
            {issues.map((iss, idx) => (
              <div
                key={`${iss.kind}-${iss.namespace}-${iss.name}-${iss.reason}-${idx}`}
                onClick={() => goToResource(iss.kind, iss.name)}
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
                      {iss.namespace ? `${iss.namespace}/` : ''}{iss.name}
                    </span>
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
            ))}
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
          <div style={{ color: overallMeta.color }}>{overallMeta.icon}</div>
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
      </div>

      {/* Inventory + security */}
      <div className="dashboard-charts-grid">
        <div className="dashboard-chart-card">
          <div className="dashboard-chart-title">RESOURCE INVENTORY</div>
          {renderResourceBarChart(counts)}
        </div>
      </div>

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
    </div>
  );
};
