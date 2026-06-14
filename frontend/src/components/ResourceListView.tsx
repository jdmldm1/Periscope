import React from 'react';
import { Box, FileText, Terminal, Code, Power, SlidersHorizontal, Info, Settings, Trash2, Globe, ExternalLink, FolderOpen } from 'lucide-react';
import { parseCpu, parseMem } from '../utils/helpers';

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
  handleDrillDownToPods: (res: any) => void;
  handleOpenServiceWebsite: (res: any) => void;
  establishingPortForward: string | null;
  handleOpenDiagnostics: (name: string, ns: string) => void;
  handleDelete: (res: any) => void;
  setIsEditingYaml: (editing: boolean) => void;
  renderStatusBadge: (res: any) => React.ReactNode;
  renderSmallSparkline: (points: number[], color: string) => React.ReactNode | null;
  setPvcExplorerNs?: (ns: string) => void;
  setPvcExplorerName?: (name: string) => void;
}

export const ResourceListView = ({
  activeTab, filteredResources, focusedRowIndex, setFocusedRowIndex,
  setSearch, setSelectedContainer, setModal,
  podMetrics, podMetricsHistory, nodeMetrics, getNodeUsagePercent,
  customCrd, setCustomCrd, setActiveTab,
  associatedDeployments, associatedPods, matchesSelector,
  handleRestart, handleScale, handleDrillDownToPods, handleOpenServiceWebsite,
  establishingPortForward, handleOpenDiagnostics, handleDelete,
  setIsEditingYaml, renderStatusBadge, renderSmallSparkline,
  setPvcExplorerNs, setPvcExplorerName
}: ResourceListViewProps) => {
  if (filteredResources.length === 0) {
    return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>No resources found.</div>;
  }

  return (
    <div className="resource-list">
      {filteredResources.filter((res: any) => res && res.metadata).map((res: any, i) => (
        <div 
          key={res.metadata.uid || res.metadata.name} 
          data-row-index={i}
          className={`resource-row animate-fade-in ${focusedRowIndex === i ? 'focused' : ''}`}
          onClick={() => setFocusedRowIndex(i)}
          style={{ 
            animationDelay: `${i * 0.02}s`,
            border: focusedRowIndex === i ? '1px solid var(--accent-green)' : '1px solid var(--border-color)',
            boxShadow: focusedRowIndex === i ? '0 0 10px rgba(59, 130, 246, 0.2)' : 'none',
            minHeight: '80px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px'
          }}
        >
          <div className="row-main" style={{ flex: '1 1 400px', minWidth: 0 }}>
            <div className="row-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeTab === 'events' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontWeight: 600, color: res.type === 'Warning' ? 'var(--accent-warning)' : 'var(--text-main)' }}>
                    {res.involvedObject?.kind}: {res.involvedObject?.name} ({res.reason})
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'normal', wordBreak: 'break-all' }}>
                    {res.message}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span>{res.metadata.name}</span>
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
              {activeTab === 'pods' && res.spec?.containers && (
                <div className="container-badge-group">
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Containers:</span>
                  {res.spec.containers.map((c: any) => (
                    <div key={c.name} className="container-badge">
                      <span>{c.name}</span>
                      <span 
                        className="container-badge-action logs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedContainer(c.name);
                          setModal({ type: 'logs', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid });
                        }}
                      >
                        <FileText size={10} />
                      </span>
                      <span 
                        className="container-badge-action console"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedContainer(c.name);
                          setModal({ type: 'terminal', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid });
                        }}
                      >
                        <Terminal size={10} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {activeTab === 'services' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
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
              )}
            </div>
            {renderStatusBadge(res)}
            <div className="row-meta">
              {activeTab === 'pods' && res.status?.podIP && <span>IP: {res.status.podIP}</span>}
              {activeTab === 'pods' && (() => {
                const metric = (podMetrics || []).find(pm => pm && pm.metadata && pm.metadata.name === res.metadata.name && pm.metadata.namespace === res.metadata.namespace);
                if (!metric) return null;
                let cpuUsage = 0;
                let memUsage = 0;
                metric.containers?.forEach((c: any) => {
                  cpuUsage += parseCpu(c.usage?.cpu || '0');
                  memUsage += parseMem(c.usage?.memory || '0');
                });
                const key = `${res.metadata.namespace}/${res.metadata.name}`;
                const history = podMetricsHistory ? podMetricsHistory[key] : null;
                return (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--accent-cyan)' }}>
                      CPU: {cpuUsage < 1 ? (cpuUsage * 1000).toFixed(0) + 'm' : cpuUsage.toFixed(1) + 'c'}
                    </span>
                    {history && renderSmallSparkline(history.cpu, '#38bdf8')}
                    <span style={{ color: 'var(--text-muted)', marginLeft: 2, marginRight: 2 }}>|</span>
                    <span style={{ color: 'var(--accent-purple)' }}>
                      RAM: {(memUsage / (1024 * 1024)).toFixed(0)}MB
                    </span>
                    {history && renderSmallSparkline(history.mem, '#c084fc')}
                  </span>
                );
              })()}
              {activeTab === 'nodes' && <span>OS: {res.status?.nodeInfo?.operatingSystem}</span>}
              {activeTab === 'nodes' && (() => {
                const metric = (nodeMetrics || []).find(nm => nm && nm.metadata && nm.metadata.name === res.metadata.name);
                if (!metric) return null;
                const { cpuPercent, memPercent } = getNodeUsagePercent(metric);
                return (
                  <div className="row-metrics" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 100 }}>
                      <div style={{ fontSize: '0.65rem', display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                        <span>CPU</span><span>{cpuPercent}%</span>
                      </div>
                      <div className="metric-bar-wrapper" style={{ margin: 0 }}><div className={`metric-bar-fill ${cpuPercent > 80 ? 'critical' : cpuPercent > 60 ? 'warning' : 'normal'}`} style={{ width: `${cpuPercent}%` }}></div></div>
                    </div>
                    <div style={{ width: 100 }}>
                      <div style={{ fontSize: '0.65rem', display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
                        <span>RAM</span><span>{memPercent}%</span>
                      </div>
                      <div className="metric-bar-wrapper" style={{ margin: 0 }}><div className={`metric-bar-fill ${memPercent > 80 ? 'critical' : memPercent > 60 ? 'warning' : 'normal'}`} style={{ width: `${memPercent}%` }}></div></div>
                    </div>
                  </div>
                );
              })()}
              {activeTab === 'crds' && (
                <span>Group: {res.spec?.group} | Scope: {res.spec?.scope}</span>
              )}
              {activeTab === 'custom' && customCrd && (
                <span>Kind: {res.kind} | API: {customCrd.group}/{customCrd.version}</span>
              )}
              {res.metadata.namespace && <span>NS: {res.metadata.namespace}</span>}
              <span>{(() => {
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
            {activeTab === 'persistentvolumeclaims' && (
              <button 
                className="btn btn-sm btn-primary" 
                onClick={(e) => { 
                  e.stopPropagation();
                  if (setPvcExplorerNs) setPvcExplorerNs(res.metadata.namespace || 'default');
                  if (setPvcExplorerName) setPvcExplorerName(res.metadata.name);
                  setActiveTab('pvc-explorer');
                }}
              >
                <FolderOpen size={12} /> Browse Files
              </button>
            )}

            {activeTab === 'deployments' && (
              <>
                <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); handleRestart(res.metadata.name, res.metadata.namespace); }}>
                  <Power size={12} /> Restart
                </button>
                <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); handleScale(res.metadata.name, res.metadata.namespace, res.spec?.replicas || 0); }}>
                  <SlidersHorizontal size={12} /> Scale
                </button>
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
      ))}
    </div>
  );
};
