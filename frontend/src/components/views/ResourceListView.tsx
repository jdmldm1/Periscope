import React from 'react';
import { Box, FileText, Terminal, Code, Power, SlidersHorizontal, Info, Settings, Trash2, Globe, ExternalLink, FolderOpen, Key, Square, Play } from 'lucide-react';
import { parseCpu, parseMem } from '../../utils/helpers';
import { resolveStatus } from '../../utils/resourceStatus';

interface ResourceListViewProps {
  activeTab: string;
  filteredResources: any[];
  focusedRowIndex: number | null;
  setFocusedRowIndex: (i: number | null) => void;
  setSearch: (s: string) => void;
  setSelectedContainer: (c: string) => void;
  setModal: (m: any) => void;
  podMetrics: any[];
  podMetricsHistory: Record<string, any>;
  nodeMetrics: any[];
  getNodeUsagePercent: (m: any) => { cpuPercent: number; memPercent: number };
  customCrd: any;
  setCustomCrd: (crd: any) => void;
  setActiveTab: (tab: any) => void;
  associatedDeployments: any[];
  associatedPods: any[];
  matchesSelector: (labels: any, selector: any) => boolean;
  pluralizeKind: (k: string) => string;
  handleRestart: (name: string, ns: string) => void;
  handleScale: (name: string, ns: string, current: number) => void;
  handleStop: (name: string, ns: string) => void;
  handleStart: (name: string, ns: string) => void;
  handleDrillDownToPods: (res: any) => void;
  handleOpenServiceWebsite: (res: any) => void;
  establishingPortForward: string | null;
  handleOpenDiagnostics: (name: string, ns: string, kind?: string) => void;
  handleDelete: (res: any) => void;
  setIsEditingYaml: (editing: boolean) => void;
  renderStatusBadge: (res: any) => React.ReactNode;
  renderSmallSparkline: (points: number[], color: string) => React.ReactNode | null;
}


const EVENT_KIND_TO_TAB: Record<string, string> = {
  Pod: 'pods', Deployment: 'deployments', StatefulSet: 'statefulsets', DaemonSet: 'daemonsets',
  Job: 'jobs', CronJob: 'cronjobs', Service: 'services', Ingress: 'ingresses',
  ConfigMap: 'configmaps', Secret: 'secrets', PersistentVolumeClaim: 'persistentvolumeclaims',
  PersistentVolume: 'persistentvolumes', Node: 'nodes', Namespace: 'namespaces',
};


const isBadEventReason = (type: string, reason: string) =>
  type === 'Warning' || /fail|error|back-?off|unhealthy|oom|evict|kill|invalid|exceeded|denied/i.test(reason || '');

export const ResourceListView = ({
  activeTab, filteredResources, focusedRowIndex, setFocusedRowIndex,
  setSearch, setSelectedContainer, setModal,
  podMetrics, podMetricsHistory, nodeMetrics, getNodeUsagePercent,
  customCrd, setCustomCrd, setActiveTab,
  associatedDeployments, associatedPods, matchesSelector,
  handleRestart, handleScale, handleStop, handleStart, handleDrillDownToPods, handleOpenServiceWebsite,
  establishingPortForward, handleOpenDiagnostics, handleDelete,
  setIsEditingYaml, renderStatusBadge, renderSmallSparkline
}: ResourceListViewProps) => {

  const sortedResources = React.useMemo(() => {
    return [...filteredResources].sort((a, b) => {
      if (activeTab === 'events') {
        const rankA = a.type === 'Warning' ? 2 : 0;
        const rankB = b.type === 'Warning' ? 2 : 0;
        return rankB - rankA;
      }
      const statusA = resolveStatus(a, activeTab as any);
      const statusB = resolveStatus(b, activeTab as any);
      
      const rankA = statusA.type === 'error' ? 2 : statusA.type === 'warning' ? 1 : 0;
      const rankB = statusB.type === 'error' ? 2 : statusB.type === 'warning' ? 1 : 0;
      
      return rankB - rankA;
    });
  }, [filteredResources, activeTab]);

  if (sortedResources.length === 0) {
    return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>No resources found.</div>;
  }

  return (
    <div className="resource-list">
      {sortedResources.filter((res: any) => res && res.metadata).map((res: any, i) => {
        const statusInfo = activeTab === 'events' ? { type: 'info' } : resolveStatus(res, activeTab as any);

        return (
          <div 
            key={res.metadata.uid || res.metadata.name} 
            data-row-index={i}
            className={`resource-row animate-fade-in ${focusedRowIndex === i ? 'focused' : ''}`}
            onClick={() => setFocusedRowIndex(i)}
            style={{ 
              animationDelay: `${i * 0.02}s`,
              border: focusedRowIndex === i ? '1px solid var(--accent-green)' : '1px solid var(--border-color)',
              boxShadow: focusedRowIndex === i ? '0 0 10px rgba(59, 130, 246, 0.2)' : 'none',
              minHeight: '80px'
            }}
          >
            <div className="row-main">
              <div className="row-header">
                <div className="row-title">
                  {activeTab === 'events' ? (() => {
                    const isBad = isBadEventReason(res.type, res.reason);
                    const accent = isBad ? 'var(--accent-error)' : '#60a5fa';
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderLeft: `3px solid ${accent}`, paddingLeft: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px', color: accent, background: isBad ? 'rgba(239,68,68,0.1)' : 'rgba(96,165,250,0.1)', border: `1px solid ${accent}33`, borderRadius: 4, padding: '1px 6px' }}>
                            {res.reason || res.type}
                          </span>
                          <span style={{ fontWeight: isBad ? 700 : 600, color: isBad ? 'var(--accent-error)' : 'var(--text-main)' }}>
                            {res.involvedObject?.kind}: {res.involvedObject?.name}
                          </span>
                          {res.count > 1 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>×{res.count}</span>}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                          {res.message}
                        </div>
                      </div>
                    );
                  })() : (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{ 
                        color: statusInfo.type === 'error' ? 'var(--accent-error)' : 'var(--text-main)',
                        fontWeight: statusInfo.type === 'error' ? 700 : 600
                      }}>
                        {res.metadata.name}
                      </span>
                      {activeTab === 'services' && (
                        <span 
                          className="badge" 
                          style={{ 
                            background: 'rgba(16, 185, 129, 0.05)', 
                            color: '#10b981', 
                            border: '1px solid rgba(16, 185, 129, 0.15)',
                            fontSize: '0.7rem',
                            marginLeft: 8,
                            textTransform: 'none',
                            padding: '2px 6px',
                            fontWeight: 600,
                            letterSpacing: 'normal'
                          }}
                        >
                          {res.spec?.type || 'ClusterIP'}
                        </span>
                      )}
                    </div>
                  )}
                  {activeTab !== 'events' && res.metadata.labels && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                      {Object.entries(res.metadata.labels).slice(0, 3).map(([key, val]) => (
                        <span 
                          key={key} 
                          className="badge" 
                          style={{ 
                            background: 'rgba(255,255,255,0.03)', 
                            color: 'var(--text-muted)', 
                            border: '1px solid var(--border-color)',
                            fontSize: '0.65rem',
                            padding: '1px 6px',
                            cursor: 'pointer',
                            textTransform: 'none',
                            letterSpacing: 'normal'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSearch(`label:${key}=${val}`);
                          }}
                        >
                          {key}={String(val)}
                        </span>
                      ))}
                    </div>
                  )}
                  {activeTab === 'secrets' && res.data && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {Object.keys(res.data).map(key => {
                        const b64Val = res.data[key];
                        let decodedVal = '';
                        try {
                          decodedVal = decodeURIComponent(escape(window.atob(b64Val)));
                        } catch (e) {
                          try {
                            decodedVal = window.atob(b64Val);
                          } catch {
                            decodedVal = '[Binary / Undecodable]';
                          }
                        }
                        return (
                          <span 
                            key={key} 
                            className="badge secret-badge" 
                            style={{ 
                              background: 'rgba(16, 185, 129, 0.05)', 
                              color: '#10b981', 
                              border: '1px solid rgba(16, 185, 129, 0.15)',
                              fontSize: '0.7rem',
                              padding: '2px 8px',
                              textTransform: 'none',
                              letterSpacing: 'normal',
                              position: 'relative',
                              cursor: 'pointer'
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {key}
                            <span className="tooltip">
                              {decodedVal}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {activeTab === 'pods' && res.spec?.containers && (
                    <div className="container-badge-group">
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Containers:</span>
                      {res.spec.containers.map((c: any) => (
                        <div key={c.name} className="container-badge">
                          <span>{c.name}</span>
                          <span
                            className="container-badge-action logs"
                            title={`View logs for ${c.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedContainer(c.name);
                              setModal({ type: 'logs', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid });
                            }}
                          >
                            <FileText size={12} />
                          </span>
                          <span
                            className="container-badge-action console"
                            title={`Open a console in ${c.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedContainer(c.name);
                              setModal({ type: 'terminal', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid });
                            }}
                          >
                            <Terminal size={12} />
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {['deployments', 'statefulsets', 'daemonsets'].includes(activeTab) && (() => {
                    const sel = res.spec?.selector?.matchLabels;
                    if (!sel) return null;
                    const pods = (associatedPods || []).filter((p: any) => matchesSelector(p.metadata?.labels, sel));
                    if (pods.length === 0) return null;
                    return (
                      <div className="container-badge-group">
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Pods ({pods.length}):</span>
                        {pods.slice(0, 8).map((p: any) => {
                          const phase = (p.status?.phase || 'Unknown').toLowerCase();
                          const statusColor = phase === 'running' ? 'var(--accent-success)' : phase === 'pending' ? 'var(--accent-warning)' : phase === 'failed' ? 'var(--accent-error)' : phase === 'succeeded' ? '#10b981' : 'var(--text-muted)';
                          const firstContainer = p.spec?.containers?.[0]?.name || '';
                          return (
                            <div key={p.metadata.uid} className="container-badge">
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                              <span
                                onClick={(e) => { e.stopPropagation(); setActiveTab('pods'); setSearch(p.metadata.name); }}
                                title={`Go to pod ${p.metadata.name}`}
                                style={{ cursor: 'pointer' }}
                              >
                                {p.metadata.name.length > 26 ? p.metadata.name.slice(0, 23) + '…' : p.metadata.name}
                              </span>
                              <span
                                className="container-badge-action logs"
                                title={`View logs: ${p.metadata.name}`}
                                onClick={(e) => { e.stopPropagation(); setSelectedContainer(firstContainer); setModal({ type: 'logs', name: p.metadata.name, namespace: p.metadata.namespace, kind: 'pods', uid: p.metadata.uid }); }}
                              >
                                <FileText size={12} />
                              </span>
                              <span
                                className="container-badge-action console"
                                title={`Open a console: ${p.metadata.name}`}
                                onClick={(e) => { e.stopPropagation(); setSelectedContainer(firstContainer); setModal({ type: 'terminal', name: p.metadata.name, namespace: p.metadata.namespace, kind: 'pods', uid: p.metadata.uid }); }}
                              >
                                <Terminal size={12} />
                              </span>
                            </div>
                          );
                        })}
                        {pods.length > 8 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>+{pods.length - 8} more</span>}
                      </div>
                    );
                  })()}
                  {activeTab === 'services' && (() => {
                    const privateIp = res.spec?.clusterIP;
                    const publicIps: string[] = [];
                    if (res.status?.loadBalancer?.ingress) {
                      res.status.loadBalancer.ingress.forEach((ing: any) => {
                        if (ing.ip) publicIps.push(ing.ip);
                        if (ing.hostname) publicIps.push(ing.hostname);
                      });
                    }
                    if (res.spec?.externalIPs) {
                      res.spec.externalIPs.forEach((ip: string) => {
                        if (ip) publicIps.push(ip);
                      });
                    }
                    if (res.spec?.externalName) {
                      publicIps.push(res.spec.externalName);
                    }

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                        {(privateIp || publicIps.length > 0) && (
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                            {privateIp && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Private IP:</span>
                                <span 
                                  className="badge" 
                                  style={{ 
                                    background: 'rgba(255, 255, 255, 0.03)', 
                                    color: 'var(--text-main)', 
                                    border: '1px solid var(--border-color)',
                                    fontSize: '0.7rem',
                                    textTransform: 'none',
                                    padding: '2px 6px',
                                    fontFamily: 'var(--font-mono)'
                                  }}
                                >
                                  {privateIp}
                                </span>
                              </div>
                            )}
                            {publicIps.length > 0 && (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Public IP:</span>
                                {publicIps.map((ip, idx) => (
                                  <span 
                                    key={idx}
                                    className="badge" 
                                    style={{ 
                                      background: 'rgba(16, 185, 129, 0.05)', 
                                      color: '#10b981', 
                                      border: '1px solid rgba(16, 185, 129, 0.15)',
                                      fontSize: '0.7rem',
                                      textTransform: 'none',
                                      padding: '2px 6px',
                                      fontFamily: 'var(--font-mono)'
                                    }}
                                  >
                                    {ip}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Ports:</span>
                        {(res.spec?.ports || []).map((p: any) => (
                          <span 
                            key={`${p.port}-${p.protocol}`} 
                            className="badge" 
                            style={{ 
                              background: 'rgba(96, 165, 250, 0.05)', 
                              color: '#60a5fa', 
                              border: '1px solid rgba(96, 165, 250, 0.15)',
                              fontSize: '0.7rem',
                              textTransform: 'none',
                              padding: '2px 6px'
                            }}
                          >
                            {p.name ? `${p.name} - ` : ''}Port: {p.port} | TargetPort: {p.targetPort}{p.nodePort ? ` | NodePort: ${p.nodePort}` : ''} | Protocol: {p.protocol}
                          </span>
                        ))}
                      </div>
                      {res.spec?.selector && (
                        <>
                          {(() => {
                            const matchingDeps = associatedDeployments.filter(dep => 
                              dep.spec?.selector?.matchLabels && 
                              Object.keys(res.spec.selector).length > 0 &&
                              Object.entries(res.spec.selector).every(([k, v]) => dep.spec.selector.matchLabels[k] === v)
                            );
                            if (matchingDeps.length === 0) return null;
                            return (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Deployments:</span>
                                {matchingDeps.map(dep => (
                                  <span 
                                    key={dep.metadata.uid} 
                                    className="badge" 
                                    style={{ 
                                      background: 'rgba(139, 92, 246, 0.05)', 
                                      color: '#a78bfa', 
                                      border: '1px solid rgba(139, 92, 246, 0.15)',
                                      fontSize: '0.7rem',
                                      textTransform: 'none',
                                      padding: '2px 6px',
                                      cursor: 'pointer'
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveTab('deployments');
                                      setSearch(dep.metadata.name);
                                    }}
                                  >
                                    {dep.metadata.name} <ExternalLink size={10} style={{ marginLeft: 4, opacity: 0.8 }} />
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                          {(() => {
                            const matchingPods = associatedPods.filter(p => matchesSelector(p.metadata?.labels, res.spec.selector));
                            if (matchingPods.length === 0) return null;
                            return (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Matched Pods:</span>
                                {matchingPods.map(pod => {
                                  const phase = (pod.status?.phase || 'Unknown').toLowerCase();
                                  let statusColor = 'var(--text-muted)';
                                  if (phase === 'running') statusColor = 'var(--accent-success)';
                                  else if (phase === 'pending') statusColor = 'var(--accent-warning)';
                                  else if (phase === 'failed') statusColor = 'var(--accent-error)';
                                  else if (phase === 'succeeded') statusColor = '#10b981';
                                  
                                  return (
                                    <span 
                                      key={pod.metadata.uid} 
                                      className="badge" 
                                      style={{ 
                                        background: 'rgba(255,255,255,0.03)', 
                                        color: statusColor, 
                                        border: '1px solid var(--border-color)',
                                        fontSize: '0.7rem',
                                        textTransform: 'none',
                                        padding: '2px 6px',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveTab('pods');
                                        setSearch(pod.metadata.name);
                                      }}
                                    >
                                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
                                      {pod.metadata.name} <ExternalLink size={10} style={{ marginLeft: 4, opacity: 0.8 }} />
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  )})()}
                </div>
                {activeTab !== 'events' && <div className="row-status">{renderStatusBadge(res)}</div>}
              </div>
              
              <div className="row-meta">
                {activeTab === 'pods' && (
                  <div className="meta-cell meta-cell-ip">
                    <span className="meta-label">IP</span>
                    <span className="meta-value" title={res.status?.podIP || ''}>{res.status?.podIP || '—'}</span>
                  </div>
                )}
                {activeTab === 'pods' && (() => {
                  const metric = (podMetrics || []).find(pm => pm && pm.metadata && pm.metadata.name === res.metadata.name && pm.metadata.namespace === res.metadata.namespace);
                  let cpuUsage = 0;
                  let memUsage = 0;
                  if (metric) {
                    metric.containers?.forEach((c: any) => {
                      cpuUsage += parseCpu(c.usage?.cpu || '0');
                      memUsage += parseMem(c.usage?.memory || '0');
                    });
                  }
                  const key = `${res.metadata.namespace}/${res.metadata.name}`;
                  const history = podMetricsHistory ? podMetricsHistory[key] : null;
                  return (
                    <>
                      <div className="meta-cell meta-cell-metric">
                        <span className="meta-label">CPU</span>
                        <span className="meta-value meta-metric">
                          <span style={{ color: 'var(--accent-cyan)' }}>
                            {metric ? (cpuUsage < 1 ? (cpuUsage * 1000).toFixed(0) + 'm' : cpuUsage.toFixed(1) + 'c') : '—'}
                          </span>
                          <span className="meta-spark">{history && renderSmallSparkline(history.cpu, '#38bdf8')}</span>
                        </span>
                      </div>
                      <div className="meta-cell meta-cell-metric">
                        <span className="meta-label">RAM</span>
                        <span className="meta-value meta-metric">
                          <span style={{ color: 'var(--accent-purple)' }}>
                            {metric ? (memUsage / (1024 * 1024)).toFixed(0) + 'MB' : '—'}
                          </span>
                          <span className="meta-spark">{history && renderSmallSparkline(history.mem, '#c084fc')}</span>
                        </span>
                      </div>
                    </>
                  );
                })()}
                {activeTab === 'nodes' && (
                  <div className="meta-cell meta-cell-os">
                    <span className="meta-label">OS</span>
                    <span className="meta-value" title={res.status?.nodeInfo?.operatingSystem || ''}>{res.status?.nodeInfo?.operatingSystem || '—'}</span>
                  </div>
                )}
                {activeTab === 'nodes' && (() => {
                  const metric = (nodeMetrics || []).find(nm => nm && nm.metadata && nm.metadata.name === res.metadata.name);
                  const usage = metric ? getNodeUsagePercent(metric) : null;
                  const cpuPercent = usage ? usage.cpuPercent : 0;
                  const memPercent = usage ? usage.memPercent : 0;
                  return (
                    <>
                      <div className="meta-cell meta-cell-bar">
                        <span className="meta-label">CPU</span>
                        <div className="metric-bar-wrapper" style={{ margin: 0, width: 60, height: 6, background: 'rgba(255, 255, 255, 0.05)', borderRadius: 3, overflow: 'hidden' }}>
                          <div className={`metric-bar-fill ${cpuPercent > 80 ? 'critical' : cpuPercent > 60 ? 'warning' : 'normal'}`} style={{ height: '100%', width: `${metric ? cpuPercent : 0}%` }}></div>
                        </div>
                        <span className="meta-value">{metric ? `${cpuPercent}%` : '—'}</span>
                      </div>
                      <div className="meta-cell meta-cell-bar">
                        <span className="meta-label">RAM</span>
                        <div className="metric-bar-wrapper" style={{ margin: 0, width: 60, height: 6, background: 'rgba(255, 255, 255, 0.05)', borderRadius: 3, overflow: 'hidden' }}>
                          <div className={`metric-bar-fill ${memPercent > 80 ? 'critical' : memPercent > 60 ? 'warning' : 'normal'}`} style={{ height: '100%', width: `${metric ? memPercent : 0}%` }}></div>
                        </div>
                        <span className="meta-value">{metric ? `${memPercent}%` : '—'}</span>
                      </div>
                    </>
                  );
                })()}
                {(activeTab === 'deployments' || activeTab === 'statefulsets' || activeTab === 'daemonsets') && (() => {
                  const isDaemon = activeTab === 'daemonsets';
                  const desired = isDaemon ? (res.status?.desiredNumberScheduled ?? 0) : (res.spec?.replicas ?? 0);
                  const ready = isDaemon ? (res.status?.numberReady ?? 0) : (res.status?.readyReplicas ?? 0);
                  const updated = isDaemon ? (res.status?.updatedNumberScheduled ?? 0) : (res.status?.updatedReplicas ?? 0);
                  const available = isDaemon ? (res.status?.numberAvailable ?? 0) : (res.status?.availableReplicas ?? 0);
                  const pct = desired > 0 ? Math.round((ready / desired) * 100) : (ready > 0 ? 100 : 0);
                  const allReady = desired > 0 && ready === desired;
                  const barColor = allReady ? 'var(--accent-success)' : ready > 0 ? 'var(--accent-warning)' : 'var(--accent-error)';
                  const containers = res.spec?.template?.spec?.containers || [];
                  const images = containers.map((c: any) => c.image).filter(Boolean);
                  const primaryImage = images[0] ? images[0].split('/').pop() : '—';
                  const strategy = isDaemon ? (res.spec?.updateStrategy?.type || 'RollingUpdate') : (res.spec?.strategy?.type || 'RollingUpdate');
                  return (
                    <>
                      <div className="meta-cell meta-cell-bar">
                        <span className="meta-label">Ready</span>
                        <div className="metric-bar-wrapper" style={{ margin: 0, width: 60, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: barColor, transition: 'width 0.4s ease' }}></div>
                        </div>
                        <span className="meta-value" style={{ color: barColor, fontWeight: 600 }}>{ready}/{desired}</span>
                      </div>
                      <div className="meta-cell meta-cell-text">
                        <span className="meta-label">Up-to-date / Avail</span>
                        <span className="meta-value">{updated} / {available}</span>
                      </div>
                      <div className="meta-cell meta-cell-text">
                        <span className="meta-label">Strategy</span>
                        <span className="meta-value">{strategy}</span>
                      </div>
                      <div className="meta-cell meta-cell-text" style={{ maxWidth: 200 }}>
                        <span className="meta-label">Image{images.length > 1 ? `s (${images.length})` : ''}</span>
                        <span className="meta-value" title={images.join('\n')} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                          {primaryImage}{images.length > 1 ? ` +${images.length - 1}` : ''}
                        </span>
                      </div>
                      <div className="meta-cell meta-cell-metric">
                        <span className="meta-label">Containers</span>
                        <span className="meta-value">{containers.length}</span>
                      </div>
                    </>
                  );
                })()}
                {activeTab === 'crds' && (
                  <div className="meta-cell meta-cell-text">
                    <span className="meta-label">Group / Scope</span>
                    <span className="meta-value" title={`${res.spec?.group} | ${res.spec?.scope}`}>{res.spec?.group} | {res.spec?.scope}</span>
                  </div>
                )}
                {activeTab === 'custom' && customCrd && (
                  <div className="meta-cell meta-cell-text">
                    <span className="meta-label">Kind / API</span>
                    <span className="meta-value" title={`${res.kind} | ${customCrd.group}/${customCrd.version}`}>{res.kind} | {customCrd.group}/{customCrd.version}</span>
                  </div>
                )}
                {res.metadata.namespace && (
                  <div className="meta-cell meta-cell-ns">
                    <span className="meta-label">Namespace</span>
                    <span className="meta-value" title={res.metadata.namespace}>{res.metadata.namespace}</span>
                  </div>
                )}
                <div className="meta-cell meta-cell-age">
                  <span className="meta-label">Age</span>
                  <span className="meta-value">{(() => {
                    const timestamp = res.lastTimestamp || res.metadata.creationTimestamp || new Date().toISOString();
                    const diffMs = Date.now() - new Date(timestamp).getTime();
                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    if (diffDays > 0) return `${diffDays}d`;
                    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                    if (diffHrs > 0) return `${diffHrs}h`;
                    const diffMins = Math.floor(diffMs / (1000 * 60));
                    return `${diffMins}m`;
                  })()}</span>
                </div>
              </div>

              <div className="row-actions">
                {activeTab === 'events' && res.involvedObject?.kind && EVENT_KIND_TO_TAB[res.involvedObject.kind] && (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={(e) => { e.stopPropagation(); setActiveTab(EVENT_KIND_TO_TAB[res.involvedObject.kind]); setSearch(res.involvedObject.name); }}
                  >
                    <ExternalLink size={12} /> View {res.involvedObject.kind}
                  </button>
                )}
                {activeTab === 'persistentvolumeclaims' && (
                  <button 
                    className="btn btn-sm btn-primary" 
                    onClick={(e) => { 
                      e.stopPropagation();
                      setModal({ type: 'pvc-files', name: res.metadata.name, namespace: res.metadata.namespace || 'default', kind: activeTab, uid: res.metadata.uid });
                    }}
                  >
                    <FolderOpen size={12} /> Browse Files
                  </button>
                )}

                {activeTab === 'persistentvolumes' && res.spec?.claimRef && (
                  <button 
                    className="btn btn-sm btn-primary" 
                    onClick={(e) => { 
                      e.stopPropagation();
                      setModal({ 
                        type: 'pvc-files', 
                        name: res.spec.claimRef.name, 
                        namespace: res.spec.claimRef.namespace || 'default', 
                        kind: activeTab, 
                        uid: res.spec.claimRef.uid || res.metadata.uid 
                      });
                    }}
                  >
                    <FolderOpen size={12} /> Browse Files
                  </button>
                )}

                {activeTab === 'secrets' && (
                  <button 
                    className="btn btn-sm btn-primary" 
                    onClick={(e) => { 
                      e.stopPropagation();
                      setModal({ type: 'decoded', name: res.metadata.name, namespace: res.metadata.namespace || 'default', kind: activeTab, uid: res.metadata.uid });
                    }}
                  >
                    <Key size={12} /> Decoded
                  </button>
                )}

                {activeTab === 'deployments' && (
                  <>
                    {(res.spec?.replicas ?? 0) === 0 ? (
                      <button className="btn btn-sm" style={{ color: 'var(--accent-success)' }} onClick={(e) => { e.stopPropagation(); handleStart(res.metadata.name, res.metadata.namespace); }}>
                        <Play size={12} /> Start
                      </button>
                    ) : (
                      <button className="btn btn-sm" style={{ color: 'var(--accent-warning)' }} onClick={(e) => { e.stopPropagation(); handleStop(res.metadata.name, res.metadata.namespace); }}>
                        <Square size={12} /> Stop
                      </button>
                    )}
                    <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); handleRestart(res.metadata.name, res.metadata.namespace); }}>
                      <Power size={12} /> Restart
                    </button>
                    <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); handleScale(res.metadata.name, res.metadata.namespace, res.spec?.replicas || 0); }}>
                      <SlidersHorizontal size={12} /> Scale
                    </button>
                    <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); handleOpenDiagnostics(res.metadata.name, res.metadata.namespace, 'deployments'); }}>🩺 Diagnose</button>
                    <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); handleDrillDownToPods(res); }}>
                      <Box size={12} /> Pods
                    </button>
                  </>
                )}
                
                {activeTab === 'services' && (
                  <button 
                    className="btn btn-sm btn-primary" 
                    onClick={(e) => { 
                      e.stopPropagation();
                      handleOpenServiceWebsite(res);
                    }}
                    disabled={establishingPortForward === res.metadata.name}
                  >
                    <Globe size={12} /> {establishingPortForward === res.metadata.name ? 'Connecting...' : 'Website'}
                  </button>
                )}

                {activeTab === 'pods' && (
                  <>
                    {res.metadata?.deletionTimestamp ? (
                      <button className="btn btn-sm" disabled style={{ color: 'var(--accent-warning)' }}>
                        <Square size={12} /> Terminating…
                      </button>
                    ) : (
                      <button className="btn btn-sm" style={{ color: 'var(--accent-warning)' }} onClick={(e) => { e.stopPropagation(); handleDelete(res); }}>
                        <Square size={12} /> Stop
                      </button>
                    )}
                    <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); handleOpenDiagnostics(res.metadata.name, res.metadata.namespace); }}>🩺 Diagnose</button>
                    <button className="btn btn-sm" onClick={(e) => { 
                      e.stopPropagation();
                      setSelectedContainer(res.spec?.containers?.[0]?.name || '');
                      setModal({ type: 'terminal', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid });
                    }}>
                      <Terminal size={12} /> Console
                    </button>
                    <button className="btn btn-sm" onClick={(e) => { 
                      e.stopPropagation();
                      setSelectedContainer(res.spec?.containers?.[0]?.name || '');
                      setModal({ type: 'logs', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid });
                    }}>
                      <FileText size={12} /> Logs
                    </button>
                    <button className="btn btn-sm" onClick={(e) => { 
                      e.stopPropagation();
                      setSelectedContainer(res.spec?.containers?.[0]?.name || '');
                      setModal({ type: 'files', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid });
                    }}>
                      <FolderOpen size={12} /> Files
                    </button>
                  </>
                )}
                
                {activeTab === 'crds' && (
                  <button 
                    className="btn btn-sm btn-primary" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setCustomCrd({
                        group: res.spec.group,
                        version: res.spec.versions.find((v: any) => v.served)?.name || res.spec.versions[0].name,
                        plural: res.spec.names.plural,
                        name: res.metadata.name
                      });
                      setActiveTab('custom');
                    }}
                  >
                    <FileText size={12} /> View Instances
                  </button>
                )}

                {activeTab !== 'nodes' && activeTab !== 'crds' && activeTab !== 'events' && (
                  <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setModal({ type: 'events', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid }); }}>
                    <Info size={12} /> Events
                  </button>
                )}
                
                {activeTab !== 'nodes' && activeTab !== 'crds' && activeTab !== 'events' && (
                  <>
                    <button className="btn btn-sm" onClick={(e) => { 
                      e.stopPropagation(); 
                      setIsEditingYaml(false); 
                      setModal({ type: 'yaml', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid }); 
                    }}>
                      <Settings size={12} /> YAML
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={(e) => { 
                      e.stopPropagation(); 
                      setIsEditingYaml(true); 
                      setModal({ type: 'yaml', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid }); 
                    }}>
                      <Code size={12} /> Edit
                    </button>
                  </>
                )}
                
                {activeTab !== 'nodes' && activeTab !== 'crds' && activeTab !== 'events' && (
                  <button className="btn btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); handleDelete(res); }}>
                    <Trash2 size={12} /> Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
