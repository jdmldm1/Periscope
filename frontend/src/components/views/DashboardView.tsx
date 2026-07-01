import { useState, useEffect } from 'react';
import {
  Activity, Command, Box, Package, Server, Layers,
  AlertTriangle, AlertCircle, CheckCircle2, Cpu, MemoryStick
} from 'lucide-react';
import { useIssueDetail, useIntegrationReadiness } from '../../utils/kubeHooks';
import { type Issue, type RecentWarning } from './dashboard/types';
import { HealthStat, UtilBar, PodHealthDoughnut, ResourceBarChart, Sparkline } from './dashboard/widgets';
import { IssuesPanel, WarningsPanel, DeploymentsPanel } from './dashboard/panels';
import { IssueDrawer } from './dashboard/IssueDrawer';
import { IntegrationSection } from './dashboard/IntegrationSection';
import { SecuritySection } from './dashboard/SecuritySection';

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

  // History tracking state
  const [scoreHistory, setScoreHistory] = useState<number[]>([]);
  const [podUnhealthyHistory, setPodUnhealthyHistory] = useState<number[]>([]);
  const [deploymentDegradedHistory, setDeploymentDegradedHistory] = useState<number[]>([]);
  const [cpuHistoryState, setCpuHistoryState] = useState<number[]>([]);
  const [memHistoryState, setMemHistoryState] = useState<number[]>([]);

  const goToResource = (kind: string, name: string) => {
    const tab = kind === 'Node' ? 'nodes'
      : kind === 'Deployment' ? 'deployments'
      : kind === 'Pod' ? 'pods'
      : 'pods';
    setSearch(name || '');
    setActiveTab(tab);
  };

  const goToPod = (name: string) => {
    setSearch(name);
    setActiveTab('pods');
  };

  useEffect(() => {
    if (!dashboardData || Object.keys(dashboardData).length === 0 || 'error' in dashboardData) return;
    
    const currentScore = dashboardData.health?.score ?? 100;
    const currentUnhealthy = dashboardData.health?.pods?.unhealthy ?? 0;
    const currentDegraded = dashboardData.health?.workloads?.degraded ?? 0;
    
    const dashboardRes = dashboardData.resources || {};
    const currentCpu = dashboardRes.cpuPct ?? 0;
    const currentMem = dashboardRes.memPct ?? 0;

    setScoreHistory(prev => [...prev.slice(-14), currentScore]);
    setPodUnhealthyHistory(prev => [...prev.slice(-14), currentUnhealthy]);
    setDeploymentDegradedHistory(prev => [...prev.slice(-14), currentDegraded]);
    setCpuHistoryState(prev => [...prev.slice(-14), currentCpu]);
    setMemHistoryState(prev => [...prev.slice(-14), currentMem]);
  }, [dashboardData]);



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
  const cpuUseCores = (dashboardRes?.cpuUse || 0) / 1000;
  const cpuCapCores = (dashboardRes?.cpuCap || 0) / 1000;
  const memUseGiB = (dashboardRes?.memUse || 0) / (1024 * 1024);
  const memCapGiB = (dashboardRes?.memCap || 0) / (1024 * 1024);
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
                className="health-score-ring"
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
                style={{ 
                  transition: 'stroke-dashoffset 1s ease-in-out',
                  // @ts-ignore
                  '--pulse-color': overallMeta.color 
                }}
              />
              <line 
                x1="30" y1="30" x2="30" y2="4" 
                stroke={overallMeta.color} 
                strokeWidth="1.5" 
                strokeLinecap="round"
                className="health-radar-line"
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
              {scoreHistory.length >= 2 && (
                <div style={{ marginLeft: 12, display: 'inline-flex', opacity: 0.6 }}>
                  <Sparkline data={scoreHistory} color={overallMeta.color} min={0} max={100} />
                </div>
              )}
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



      {/* Active issues & deployments — primary top row */}
      <div className="dashboard-charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        <IssuesPanel
          issues={issues}
          criticalCount={health.criticalCount || 0}
          warningCount={health.warningCount || 0}
          onSelectIssue={setSelectedIssue}
          style={{ gridColumn: 'auto' }}
        />
        <DeploymentsPanel deployments={recentDeployments} onViewHelm={() => setActiveTab('helm')} />
      </div>

      {/* Cluster state overview: health (healthy vs unhealthy) + resource utilization */}
      <h2 style={{ fontSize: '1.1rem', margin: '4px 0 0', letterSpacing: 0.5 }}>CLUSTER STATE OVERVIEW</h2>
      <div className="dashboard-charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <HealthStat icon={<Server size={14} />} label="Nodes" healthy={nodes.ready} total={nodes.total} bad={nodes.notReady} badLabel="not ready" onClick={() => setActiveTab('nodes')} />
        <HealthStat icon={<Box size={14} />} label="Pods" healthy={podsH.healthy} total={podsH.total} bad={podsH.unhealthy} badLabel="unhealthy" onClick={() => setActiveTab('pods')} history={podUnhealthyHistory} />
        <HealthStat icon={<Layers size={14} />} label="Deployments" healthy={workloads.healthy} total={workloads.total} bad={workloads.degraded} badLabel="degraded" onClick={() => setActiveTab('deployments')} history={deploymentDegradedHistory} />
        <div className="dashboard-chart-card" style={{ display: 'flex', flexDirection: 'column', gap: 16, justifyContent: 'center' }}>
          <UtilBar pct={cpuPct} title="CPU" sub={`${cpuUseCores.toFixed(1)} / ${cpuCapCores.toFixed(0)} cores`} icon={<Cpu size={13} />} available={metricsAvailable} history={cpuHistoryState} />
          <UtilBar pct={memPct} title="MEMORY" sub={`${memUseGiB.toFixed(1)} / ${memCapGiB.toFixed(1)} GiB`} icon={<MemoryStick size={13} />} available={metricsAvailable} history={memHistoryState} />
        </div>
      </div>

      {/* Pod health + recent warnings */}
      <div className="dashboard-charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        <div className="dashboard-chart-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('pods')}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = '')}>
          <div className="dashboard-chart-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>POD HEALTH BREAKDOWN</span>
            <span style={{ fontSize: '0.65rem', color: 'var(--accent-blue)', fontWeight: 600, letterSpacing: 0.3 }}>VIEW PODS →</span>
          </div>
          <PodHealthDoughnut ph={podHealth} />
        </div>
        <WarningsPanel warnings={recentWarnings} onViewEvents={() => setActiveTab('events')} />
      </div>

      {/* Inventory + security */}
      <div className="dashboard-charts-grid">
        <div className="dashboard-chart-card">
          <div className="dashboard-chart-title">RESOURCE INVENTORY</div>
          <ResourceBarChart counts={counts} />
        </div>
      </div>

      <IntegrationSection data={integration.data} namespace={namespace} onSelectPod={goToPod} />

      <SecuritySection scanResults={runningImagesScanResults} kubescapeReport={kubescapeReport} onNavigate={setActiveTab} />

      {/* Quick Action Console */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 14, letterSpacing: 0.5 }}>QUICK ACTION CONSOLE</h2>
        <div className="dashboard-quick-actions">
          <div className="quick-action-btn" onClick={() => setActiveTab('pods')}>
            <Box size={24} style={{ color: 'var(--accent-green)' }} />
            <span>Pods</span>
          </div>
          <div className="quick-action-btn" onClick={() => setActiveTab('topology')}>
            <Activity size={24} style={{ color: 'var(--accent-cyan)' }} />
            <span>Topology</span>
          </div>
          <div className="quick-action-btn" onClick={() => setActiveTab('helm')}>
            <Package size={24} style={{ color: 'var(--accent-pink)' }} />
            <span>Helm Releases</span>
          </div>
          {zarfStatus.installed && (
            <div className="quick-action-btn" onClick={() => setActiveTab('zarf')}>
              <Package size={24} style={{ color: 'var(--accent-warning)' }} />
              <span>Zarf Packages</span>
            </div>
          )}
          <div className="quick-action-btn" onClick={() => setIsCmdPaletteOpen(true)}>
            <Command size={24} style={{ color: 'var(--accent-purple)' }} />
            <span>Command Palette</span>
          </div>
        </div>
      </div>

      {selectedIssue && (
        <IssueDrawer
          issue={selectedIssue}
          detail={issueDetail}
          loading={issueLoading}
          onClose={() => setSelectedIssue(null)}
          onOpenResource={goToResource}
        />
      )}
    </div>
  );
};
