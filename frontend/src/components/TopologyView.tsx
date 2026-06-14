import { useEffect, useRef } from 'react';
import { Network, type Options } from 'vis-network';
import { Globe } from 'lucide-react';
import { parseCpu, parseMem, matchesSelector } from '../utils/helpers';

interface TopologyViewProps {
  topologyMode: 'graph' | 'columns';
  topologyData: {
    nodes: any[];
    services: any[];
    deployments: any[];
    pods: any[];
  };
  selectedNs: string;
  hoveredTopologyItem: any;
  setHoveredTopologyItem: (item: any) => void;
  podMetrics: any[];
  setModal: (m: any) => void;
  handleOpenDiagnostics: (name: string, ns: string) => void;
  nodeMetrics: any[];
  getNodeUsagePercent: (m: any) => { cpuPercent: number; memPercent: number };
}

export const TopologyView = ({ 
  topologyMode,
  topologyData = { nodes: [], services: [], deployments: [], pods: [] },
  hoveredTopologyItem,
  setHoveredTopologyItem,
  podMetrics,
  setModal,
  handleOpenDiagnostics,
  nodeMetrics,
  getNodeUsagePercent,
}: TopologyViewProps) => {
  const visJsRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);

  useEffect(() => {
    if (topologyMode === 'graph' && visJsRef.current && topologyData) {
      const nodes: any[] = [];
      const edges: any[] = [];

      (topologyData.nodes || []).forEach(node => {
        nodes.push({ id: node.metadata.name, label: node.metadata.name, group: 'node', shape: 'dot', size: 25 });
      });

      (topologyData.services || []).forEach(svc => {
        nodes.push({ id: `svc-${svc.metadata.uid}`, label: svc.metadata.name, group: 'service', shape: 'diamond' });
      });

      (topologyData.deployments || []).forEach(deploy => {
        nodes.push({ id: `deploy-${deploy.metadata.uid}`, label: deploy.metadata.name, group: 'deployment', shape: 'square' });
      });

      (topologyData.pods || []).forEach(pod => {
        nodes.push({ id: `pod-${pod.metadata.uid}`, label: pod.metadata.name, group: 'pod', shape: 'dot', size: 15 });
        if (pod.spec?.nodeName) {
          edges.push({ from: `pod-${pod.metadata.uid}`, to: pod.spec.nodeName, dashes: true, color: 'rgba(255,255,255,0.2)' });
        }
      });

      (topologyData.services || []).forEach(svc => {
        (topologyData.pods || []).forEach(pod => {
          if (matchesSelector(pod.metadata?.labels, svc.spec?.selector)) {
            edges.push({ from: `svc-${svc.metadata.uid}`, to: `pod-${pod.metadata.uid}`, color: 'rgba(0,188,212,0.4)', width: 2 });
          }
        });
      });

      (topologyData.deployments || []).forEach(deploy => {
        (topologyData.pods || []).forEach(pod => {
          if (matchesSelector(pod.metadata?.labels, deploy.spec?.selector?.matchLabels)) {
            edges.push({ from: `deploy-${deploy.metadata.uid}`, to: `pod-${pod.metadata.uid}`, color: 'rgba(168,85,247,0.4)' });
          }
        });
      });

      const options: Options = {
        nodes: { font: { color: '#fff', size: 12 }, borderWidth: 2, shadow: true },
        edges: { smooth: { enabled: true, type: 'continuous', roundness: 0.5 } },
        physics: { stabilization: true, barnesHut: { gravitationalConstant: -2000, springLength: 200 } },
        groups: {
          node: { color: { background: '#1e293b', border: '#3b82f6' } },
          service: { color: { background: '#083344', border: '#06b6d4' } },
          deployment: { color: { background: '#3b0764', border: '#a855f7' } },
          pod: { color: { background: '#064e3b', border: '#10b981' } }
        }
      };

      networkRef.current = new Network(visJsRef.current, { nodes, edges }, options);
      networkRef.current.on('click', (params) => {
        if (params.nodes.length > 0) {
          const id = params.nodes[0];
          if (id.startsWith('pod-')) {
            const uid = id.replace('pod-', '');
            const pod = (topologyData.pods || []).find(p => p.metadata.uid === uid);
            if (pod) {
              setModal({ type: 'yaml', name: pod.metadata.name, namespace: pod.metadata.namespace || 'default', kind: 'pods', uid: pod.metadata.uid });
            }
          } else if (id.startsWith('svc-')) {
            const uid = id.replace('svc-', '');
            const svc = (topologyData.services || []).find(s => s.metadata.uid === uid);
            if (svc) {
              setModal({ type: 'yaml', name: svc.metadata.name, namespace: svc.metadata.namespace || 'default', kind: 'services', uid: svc.metadata.uid });
            }
          } else if (id.startsWith('deploy-')) {
            const uid = id.replace('deploy-', '');
            const deploy = (topologyData.deployments || []).find(d => d.metadata.uid === uid);
            if (deploy) {
              setModal({ type: 'yaml', name: deploy.metadata.name, namespace: deploy.metadata.namespace || 'default', kind: 'deployments', uid: deploy.metadata.uid });
            }
          } else {
            // Node
            const node = (topologyData.nodes || []).find(n => n.metadata.name === id);
            if (node) {
              setModal({ type: 'yaml', name: node.metadata.name, namespace: '', kind: 'nodes', uid: node.metadata.uid });
            }
          }
        }
      });
    }

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [topologyMode, topologyData, setModal]);

  const isTopologyItemConnected = (colType: string, item: any) => {
    if (!hoveredTopologyItem) return false;
    const { type: hType, name: hName, item: hItem } = hoveredTopologyItem;
    if (hType === colType && hName === item.metadata.name) return true;

    if (hType === 'node') {
      if (colType === 'pod') return item.spec?.nodeName === hName;
      if (colType === 'deployment' || colType === 'service') {
        const relatedPods = (topologyData.pods || []).filter(p => p.spec?.nodeName === hName);
        if (colType === 'deployment') {
          return relatedPods.some(p => matchesSelector(p.metadata?.labels, item.spec?.selector?.matchLabels));
        }
        if (colType === 'service') {
          return relatedPods.some(p => matchesSelector(p.metadata?.labels, item.spec?.selector));
        }
      }
    }

    if (hType === 'pod') {
       if (colType === 'node') return hItem.spec?.nodeName === item.metadata.name;
       if (colType === 'service') return matchesSelector(hItem.metadata?.labels, item.spec?.selector);
       if (colType === 'deployment') return matchesSelector(hItem.metadata?.labels, item.spec?.selector?.matchLabels);
    }

    if (hType === 'service') {
       if (colType === 'pod') return matchesSelector(item.metadata?.labels, hItem.spec?.selector);
       if (colType === 'node') {
         const podsOnNode = (topologyData.pods || []).filter(p => p.spec?.nodeName === item.metadata.name);
         return podsOnNode.some(p => matchesSelector(p.metadata?.labels, hItem.spec?.selector));
       }
    }

    if (hType === 'deployment') {
       if (colType === 'pod') return matchesSelector(item.metadata?.labels, hItem.spec?.selector?.matchLabels);
       if (colType === 'node') {
         const podsOnNode = (topologyData.pods || []).filter(p => p.spec?.nodeName === item.metadata.name);
         return podsOnNode.some(p => matchesSelector(p.metadata?.labels, hItem.spec?.selector?.matchLabels));
       }
    }

    return false;
  };

  return (
    <div className="topology-container animate-fade-in" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      
      {/* Graph View */}
      <div 
        className="topology-view-wrapper animate-fade-in" 
        style={{ 
          display: topologyMode === 'graph' ? 'block' : 'none',
          position: 'relative', 
          height: 'calc(100vh - 200px)', 
          background: 'rgba(0,0,0,0.2)', 
          borderRadius: 12, 
          border: '1px solid var(--border-color)', 
          overflow: 'hidden' 
        }}
      >
        <div ref={visJsRef} style={{ width: '100%', height: '100%' }} className="topology-graph-canvas" />
        <div className="topology-legend" style={{ position: 'absolute', bottom: 20, left: 20, background: 'rgba(15,23,42,0.8)', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-color)', display: 'flex', gap: 16, fontSize: '0.75rem', backdropFilter: 'blur(8px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6' }}></span> Node</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#06b6d4', transform: 'rotate(45deg)' }}></span> Service</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, background: '#a855f7' }}></span> Deployment</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }}></span> Pod</div>
        </div>
      </div>

      {/* List / Columns View */}
      <div 
        className="topology-layout"
        style={{ display: topologyMode === 'columns' ? 'flex' : 'none' }}
      >
        {/* Column 1: Nodes */}
        <div className="topology-col">
          <div className="topology-col-title">Nodes ({(topologyData.nodes || []).length})</div>
          {(topologyData.nodes || []).map(node => {
            const isActive = hoveredTopologyItem ? isTopologyItemConnected('node', node) : false;
            const metric = (nodeMetrics || []).find(nm => nm && nm.metadata && nm.metadata.name === node.metadata.name);
            const { cpuPercent, memPercent } = metric ? getNodeUsagePercent(metric) : { cpuPercent: 0, memPercent: 0 };
            
            return (
              <div 
                key={node.metadata.uid} 
                className={`topology-card ${isActive ? 'active' : ''}`}
                onMouseEnter={() => setHoveredTopologyItem({ type: 'node', name: node.metadata.name, item: node })}
                onMouseLeave={() => setHoveredTopologyItem(null)}
                onClick={() => setModal({ type: 'yaml', name: node.metadata.name, namespace: '', kind: 'nodes', uid: node.metadata.uid })}
              >
                <div className="topology-card-title">{node.metadata.name}</div>
                <div className="topology-card-subtitle">IP: {node.status?.addresses?.find((a: any) => a.type === 'InternalIP')?.address}</div>
                <div className="topology-card-metrics">
                   <div className="mini-metric"><div className="mini-metric-fill" style={{ width: `${cpuPercent}%` }}></div></div>
                   <div className="mini-metric"><div className="mini-metric-fill" style={{ width: `${memPercent}%`, background: 'var(--accent-purple)' }}></div></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Column 2: Services */}
        <div className="topology-col">
          <div className="topology-col-title">Services ({(topologyData.services || []).length})</div>
          {(topologyData.services || []).map(svc => {
            const isActive = hoveredTopologyItem ? isTopologyItemConnected('service', svc) : false;
            return (
              <div 
                key={svc.metadata.uid} 
                className={`topology-card ${isActive ? 'active' : ''}`}
                onMouseEnter={() => setHoveredTopologyItem({ type: 'service', name: svc.metadata.name, item: svc })}
                onMouseLeave={() => setHoveredTopologyItem(null)}
                onClick={() => setModal({ type: 'yaml', name: svc.metadata.name, namespace: svc.metadata.namespace, kind: 'services', uid: svc.metadata.uid })}
              >
                <div className="topology-card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  {svc.metadata.name}
                  {svc.spec?.type === 'LoadBalancer' && <Globe size={12} style={{ color: 'var(--accent-cyan)' }} />}
                </div>
                <div className="topology-card-subtitle">{svc.spec?.type} • {svc.spec?.clusterIP}</div>
              </div>
            );
          })}
        </div>

        {/* Column 3: Deployments */}
        <div className="topology-col">
          <div className="topology-col-title">Deployments ({(topologyData.deployments || []).length})</div>
          {(topologyData.deployments || []).map(deploy => {
            const isActive = hoveredTopologyItem ? isTopologyItemConnected('deployment', deploy) : false;
            return (
              <div 
                key={deploy.metadata.uid} 
                className={`topology-card ${isActive ? 'active' : ''}`}
                onMouseEnter={() => setHoveredTopologyItem({ type: 'deployment', name: deploy.metadata.name, item: deploy })}
                onMouseLeave={() => setHoveredTopologyItem(null)}
                onClick={() => setModal({ type: 'yaml', name: deploy.metadata.name, namespace: deploy.metadata.namespace, kind: 'deployments', uid: deploy.metadata.uid })}
              >
                <div className="topology-card-title">{deploy.metadata.name}</div>
                <div className="topology-card-subtitle">{deploy.status?.readyReplicas || 0}/{deploy.status?.replicas || 0} Replicas</div>
              </div>
            );
          })}
        </div>

        {/* Column 4: Pods */}
        <div className="topology-col">
          <div className="topology-col-title">Pods ({(topologyData.pods || []).length})</div>
          {(topologyData.pods || []).map(pod => {
            const isActive = hoveredTopologyItem ? isTopologyItemConnected('pod', pod) : false;
            const status = pod.status?.phase?.toLowerCase() || 'unknown';
            const metric = (podMetrics || []).find(pm => pm && pm.metadata && pm.metadata.name === pod.metadata.name && pm.metadata.namespace === pod.metadata.namespace);
            let cpuUsage = 0;
            let memUsage = 0;
            metric?.containers?.forEach((c: any) => {
              cpuUsage += parseCpu(c.usage?.cpu || '0');
              memUsage += parseMem(c.usage?.memory || '0');
            });

            return (
              <div 
                key={pod.metadata.uid} 
                className={`topology-card ${isActive ? 'active' : ''}`}
                onMouseEnter={() => setHoveredTopologyItem({ type: 'pod', name: pod.metadata.name, item: pod })}
                onMouseLeave={() => setHoveredTopologyItem(null)}
                onClick={() => setModal({ type: 'yaml', name: pod.metadata.name, namespace: pod.metadata.namespace || 'default', kind: 'pods', uid: pod.metadata.uid })}
              >
                <div className="topology-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pod.metadata.name}</span>
                  <button 
                    className="btn btn-icon btn-sm" 
                    style={{ padding: 2, minHeight: 'auto', background: 'transparent', border: 'none' }}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      handleOpenDiagnostics(pod.metadata.name, pod.metadata.namespace || 'default'); 
                    }}
                    title="Run Pod Diagnostics"
                  >
                    🩺
                  </button>
                </div>
                <div className="topology-card-subtitle">
                  Status: <span className={`badge badge-running`} style={{ fontSize: '0.65rem', padding: '0px 4px', background: status === 'running' ? 'var(--accent-green)20' : 'transparent', color: status === 'running' ? 'var(--accent-green)' : 'inherit' }}>{status}</span><br/>
                  Node: {pod.spec?.nodeName}
                </div>
                {metric && (
                  <div style={{ marginTop: 8, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    CPU: {cpuUsage < 1 ? (cpuUsage * 1000).toFixed(0) + 'm' : cpuUsage.toFixed(1) + 'c'} | RAM: {(memUsage / (1024 * 1024)).toFixed(0)}MB
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
