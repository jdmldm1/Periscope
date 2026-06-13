import React from 'react';
import { Activity, Command, Box, Package } from 'lucide-react';

interface DashboardViewProps {
  dashboardData: any;
  cpuHistory: number[];
  memHistory: number[];
  setActiveTab: (tab: any) => void;
  setSearch: (search: string) => void;
  setIsCmdPaletteOpen: (open: boolean) => void;
  zarfStatus: { installed: boolean; version?: string };
  runningImagesScanResults: Record<string, { sbom: any; vulnerabilities: any; status: 'pending' | 'scanning' | 'success' | 'failed'; error?: string }>;
  kubescapeReport: any;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  dashboardData,
  cpuHistory,
  memHistory,
  setActiveTab,
  setSearch,
  setIsCmdPaletteOpen,
  zarfStatus,
  runningImagesScanResults,
  kubescapeReport,
}) => {
  const renderSecuritySection = () => {
    let criticalVulns = 0;
    let highVulns = 0;
    let mediumVulns = 0;
    let lowVulns = 0;

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
    const failedControls = kubescapeReport?.summary?.critical + kubescapeReport?.summary?.high + kubescapeReport?.summary?.medium + kubescapeReport?.summary?.low || 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontSize: '1.1rem', margin: 0, letterSpacing: 0.5 }}>SECURITY COMPLIANCE & SCANS</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {/* Vulnerability Summary Card */}
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

          {/* Compliance Summary Card */}
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

  const renderPodStatusDoughnut = (phases: { running: number, pending: number, succeeded: number, failed: number }) => {
    const total = phases.running + phases.pending + phases.succeeded + phases.failed;
    if (total === 0) {
      return <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>No active Pods in namespace</div>;
    }
    const r = 40;
    const circ = 2 * Math.PI * r; // 251.3
    
    const runPct = phases.running / total;
    const penPct = phases.pending / total;
    const failPct = phases.failed / total;
    const succPct = phases.succeeded / total;
    
    const runOffset = 0;
    const penOffset = runPct * circ;
    const failOffset = (runPct + penPct) * circ;
    const succOffset = (runPct + penPct + failPct) * circ;
    
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, justifyContent: 'center' }}>
        <svg width="130" height="130" viewBox="0 0 120 120">
          <defs>
            <filter id="doughnutGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle cx="60" cy="60" r={r} fill="transparent" stroke="var(--border-color)" strokeWidth="12" />
          
          {phases.running > 0 && (
            <circle cx="60" cy="60" r={r} fill="transparent" 
              stroke="var(--accent-green)" 
              strokeWidth="12" 
              strokeDasharray={`${runPct * circ} ${circ}`} 
              strokeDashoffset={-runOffset} 
              transform="rotate(-90 60 60)"
              filter="url(#doughnutGlow)"
            />
          )}
          
          {phases.pending > 0 && (
            <circle cx="60" cy="60" r={r} fill="transparent" 
              stroke="var(--accent-warning)" 
              strokeWidth="12" 
              strokeDasharray={`${penPct * circ} ${circ}`} 
              strokeDashoffset={-penOffset} 
              transform="rotate(-90 60 60)"
              filter="url(#doughnutGlow)"
            />
          )}
          
          {phases.failed > 0 && (
            <circle cx="60" cy="60" r={r} fill="transparent" 
              stroke="var(--accent-error)" 
              strokeWidth="12" 
              strokeDasharray={`${failPct * circ} ${circ}`} 
              strokeDashoffset={-failOffset} 
              transform="rotate(-90 60 60)"
              filter="url(#doughnutGlow)"
            />
          )}
          
          {phases.succeeded > 0 && (
            <circle cx="60" cy="60" r={r} fill="transparent" 
              stroke="var(--accent-blue)" 
              strokeWidth="12" 
              strokeDasharray={`${succPct * circ} ${circ}`} 
              strokeDashoffset={-succOffset} 
              transform="rotate(-90 60 60)"
              filter="url(#doughnutGlow)"
            />
          )}
          
          <text x="60" y="58" textAnchor="middle" dy="0.3em" className="circular-gauge-text" style={{ fontSize: '1.2rem' }}>
            {total}
          </text>
          <text x="60" y="78" textAnchor="middle" className="circular-gauge-label" style={{ fontSize: '0.55rem' }}>
            Pods Total
          </text>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-green)', display: 'inline-block' }}></span>
            <span style={{ color: 'var(--text-muted)', width: 65 }}>Running:</span>
            <span style={{ fontWeight: 600 }}>{phases.running} ({Math.round(runPct * 100)}%)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-warning)', display: 'inline-block' }}></span>
            <span style={{ color: 'var(--text-muted)', width: 65 }}>Pending:</span>
            <span style={{ fontWeight: 600 }}>{phases.pending} ({Math.round(penPct * 100)}%)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-error)', display: 'inline-block' }}></span>
            <span style={{ color: 'var(--text-muted)', width: 65 }}>Failed:</span>
            <span style={{ fontWeight: 600 }}>{phases.failed} ({Math.round(failPct * 100)}%)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent-blue)', display: 'inline-block' }}></span>
            <span style={{ color: 'var(--text-muted)', width: 65 }}>Succeeded:</span>
            <span style={{ fontWeight: 600 }}>{phases.succeeded} ({Math.round(succPct * 100)}%)</span>
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
                <div 
                  style={{ 
                    width: '100%', 
                    height: barHeight, 
                    background: d.color, 
                    borderRadius: '2px 2px 0 0',
                    boxShadow: `0 0 10px ${d.color}33`,
                    transition: 'height 1s ease-out'
                  }} 
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {data.map(d => (
            <div key={d.name} style={{ flex: 1, fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              {d.name}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderSparkline = (history: number[], color: string) => {
    let activeHistory = [...history];
    if (activeHistory.length === 0) {
      activeHistory = [30, 32, 28, 35, 42, 38, 45, 41, 48, 52, 47, 50, 48, 55, 62, 58, 65, 60, 68, 62];
    }
    const width = 300;
    const height = 100;
    const maxVal = 100;
    const pad = 5;
    
    const points = activeHistory.map((val, idx) => {
      const x = pad + (idx * (width - 2 * pad)) / (activeHistory.length - 1 || 1);
      const y = height - pad - (val / maxVal) * (height - 2 * pad);
      return `${x},${y}`;
    }).join(' ');
    
    const areaPoints = `${pad},${height - pad} ${points} ${width - pad},${height - pad}`;
    
    return (
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`areaGlow-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.15" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id={`lineGlow-${color}`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <polygon points={areaPoints} fill={`url(#areaGlow-${color})`} />
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.03)" strokeDasharray="3 3" />
        <polyline 
          fill="none" 
          stroke={color} 
          strokeWidth="2.5" 
          points={points} 
          filter={`url(#lineGlow-${color})`}
        />
        {activeHistory.length > 0 && (() => {
          const lastVal = activeHistory[activeHistory.length - 1];
          const x = width - pad;
          const y = height - pad - (lastVal / maxVal) * (height - 2 * pad);
          return (
            <circle cx={x} cy={y} r="4" fill={color} stroke="var(--bg-main)" strokeWidth="1" />
          );
        })()}
      </svg>
    );
  };

  if (!dashboardData) return <div className="loader-container"><div className="loader"></div></div>;
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
  
  const { counts, podPhases, resources: dashboardRes } = dashboardData;
  
  const cpuPct = dashboardRes?.cpuPct || 0;
  const memPct = dashboardRes?.memPct || 0;
  const cpuUse = dashboardRes?.cpuUse || 0;
  const cpuCap = dashboardRes?.cpuCap || 0;
  const memUse = dashboardRes?.memUse || 0;
  const memCap = dashboardRes?.memCap || 0;
  
  const formattedMemUse = (memUse / (1024 * 1024 * 1024)).toFixed(1);
  const formattedMemCap = (memCap / (1024 * 1024 * 1024)).toFixed(1);
  
  return (
    <div className="dashboard-container animate-fade-in">
      {/* Welcome Hero Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(13, 27, 42, 0.45) 0%, rgba(27, 38, 59, 0.2) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px 32px',
        marginBottom: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '24px',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.25)'
      }}>
        {/* Subtle background glow */}
        <div style={{
          position: 'absolute',
          top: '-50%',
          right: '-10%',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(96, 165, 250, 0.12) 0%, transparent 70%)',
          filter: 'blur(30px)',
          pointerEvents: 'none'
        }} />
        
        <div style={{ flex: 1, zIndex: 1 }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff', marginBottom: '8px', letterSpacing: '-0.5px' }}>
            Welcome to Periscope
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5', maxWidth: '620px', margin: 0 }}>
            Advanced control plane for Kubernetes clusters and Zarf package deployments. 
            Monitor metrics, trace topologies, execute terminal commands, manage Helm charts, and explore container files instantly.
          </p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button className="btn btn-primary btn-sm" onClick={() => { setActiveTab('topology'); setSearch(''); }} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity size={12} /> Open Topology Graph
            </button>
            <button className="btn btn-sm" onClick={() => setIsCmdPaletteOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
              <Command size={12} /> Command Palette
            </button>
          </div>
        </div>
        
        <div style={{ width: '220px', height: '125px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', position: 'relative', zIndex: 1, flexShrink: 0, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.02)' }}>
          <img 
            src="/logo.png" 
            alt="Periscope Logo" 
            style={{ width: '80%', height: '80%', objectFit: 'contain' }} 
          />
        </div>
      </div>

      <div className="dashboard-row">
        <div className="dashboard-chart-card" style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '100%', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16, fontWeight: 600, letterSpacing: 0.5 }}>CLUSTER CPU UTILIZATION</div>
          <svg width="140" height="140" viewBox="0 0 120 120">
            <defs>
              <linearGradient id="cpuGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--accent-cyan)" />
                <stop offset="100%" stopColor="var(--accent-blue)" />
              </linearGradient>
              <filter id="cpuGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle cx="60" cy="60" r="45" fill="transparent" stroke="var(--border-color)" strokeWidth="8" />
            <circle cx="60" cy="60" r="45" fill="transparent" 
              stroke="url(#cpuGradient)" 
              strokeWidth="8" 
              strokeDasharray="282.7" 
              strokeDashoffset={282.7 - (282.7 * cpuPct) / 100} 
              transform="rotate(-90 60 60)"
              filter="url(#cpuGlow)"
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s ease-out' }}
            />
            <text x="60" y="58" textAnchor="middle" dy="0.3em" className="circular-gauge-text">
              {cpuPct}%
            </text>
            <text x="60" y="78" textAnchor="middle" className="circular-gauge-label">
              {cpuUse.toFixed(1)} / {cpuCap.toFixed(0)} Cores
            </text>
          </svg>
        </div>
        
        <div className="dashboard-chart-card" style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ width: '100%', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 16, fontWeight: 600, letterSpacing: 0.5 }}>CLUSTER RAM UTILIZATION</div>
          <svg width="140" height="140" viewBox="0 0 120 120">
            <defs>
              <linearGradient id="memGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--accent-purple)" />
                <stop offset="100%" stopColor="var(--accent-pink)" />
              </linearGradient>
              <filter id="memGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle cx="60" cy="60" r="45" fill="transparent" stroke="var(--border-color)" strokeWidth="8" />
            <circle cx="60" cy="60" r="45" fill="transparent" 
              stroke="url(#memGradient)" 
              strokeWidth="8" 
              strokeDasharray="282.7" 
              strokeDashoffset={282.7 - (282.7 * memPct) / 100} 
              transform="rotate(-90 60 60)"
              filter="url(#memGlow)"
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s ease-out' }}
            />
            <text x="60" y="58" textAnchor="middle" dy="0.3em" className="circular-gauge-text">
              {memPct}%
            </text>
            <text x="60" y="78" textAnchor="middle" className="circular-gauge-label">
              {formattedMemUse} / {formattedMemCap} GB
            </text>
          </svg>
        </div>
      </div>

      <div className="dashboard-charts-grid">
        <div className="dashboard-chart-card">
          <div className="dashboard-chart-title">
            CPU UTILIZATION TIMELINE
            <span className="dashboard-chart-subtitle">LIVE LOAD SPARKLINE</span>
          </div>
          {renderSparkline(cpuHistory, 'var(--accent-cyan)')}
        </div>

        <div className="dashboard-chart-card">
          <div className="dashboard-chart-title">
            MEMORY UTILIZATION TIMELINE
            <span className="dashboard-chart-subtitle">HISTORICAL GRAPH</span>
          </div>
          {renderSparkline(memHistory, 'var(--accent-purple)')}
        </div>
      </div>

      <div className="dashboard-charts-grid">
        <div className="dashboard-chart-card">
          <div className="dashboard-chart-title">POD WORKLOAD STATUSES</div>
          {renderPodStatusDoughnut(podPhases)}
        </div>
        
        <div className="dashboard-chart-card">
          <div className="dashboard-chart-title">NAMESPACE RESOURCE TOTALS</div>
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
