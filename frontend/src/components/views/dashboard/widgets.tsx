import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';

// Pure presentational widgets for the dashboard's cluster-state overview. Each
// is driven entirely by its props (no cluster/state access).

// Health-focused summary card (healthy vs unhealthy).
export const HealthStat: React.FC<{
  icon: React.ReactNode;
  label: string;
  healthy: number;
  total: number;
  badLabel: string;
  bad: number;
  onClick?: () => void;
}> = ({ icon, label, healthy, total, badLabel, bad, onClick }) => {
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

// Compact resource utilization bar (single source of truth).
export const UtilBar: React.FC<{ pct: number; title: string; sub: string; icon: React.ReactNode; available: boolean }> = ({ pct, title, sub, icon, available }) => {
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

// Pod health doughnut (healthy vs failing/pending/not-ready).
export const PodHealthDoughnut: React.FC<{ ph: any }> = ({ ph }) => {
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

// Resource inventory bar chart.
export const ResourceBarChart: React.FC<{ counts: any }> = ({ counts }) => {
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
