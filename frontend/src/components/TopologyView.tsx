import React, { useEffect, useRef } from 'react';
import { Network } from 'vis-network';
import { Settings, X, FileText, Terminal, Globe, SlidersHorizontal, RefreshCw } from 'lucide-react';
import { parseCpu, parseMem, matchesSelector } from '../utils/helpers';

interface TopologyViewProps {
  topologyMode: 'columns' | 'graph';
  topologyData: {
    nodes: any[];
    services: any[];
    deployments: any[];
    pods: any[];
  };
  selectedNs: string;
  hoveredTopologyItem: { type: 'node' | 'service' | 'deployment' | 'pod'; name: string; item: any } | null;
  setHoveredTopologyItem: (item: any) => void;
  selectedTopologyNode: string | null;
  setSelectedTopologyNode: (node: string | null) => void;
  resources: any[];
  podMetrics: any[];
  activeTab: string;
  setActiveTab: (tab: any) => void;
  setModal: (modal: any) => void;
  setSelectedContainer: (container: string) => void;
  handleRestart: (name: string, namespace: string) => void;
  handleScale: (name: string, namespace: string, currentReplicas: number) => void;
  handleDrillDownToPods: (resource: any) => void;
  handleOpenDiagnostics: (name: string, namespace: string) => void;
  handleOpenServiceWebsite: (resource: any) => void;
  nodeMetrics: any[];
  getNodeUsagePercent: (metric: any) => { cpuPercent: number; memPercent: number };
  getNodeCapacity: (name: string) => { cpu: number; memory: number };
}

export const TopologyView: React.FC<TopologyViewProps> = ({
  topologyMode,
  topologyData,
  selectedNs,
  hoveredTopologyItem,
  setHoveredTopologyItem,
  selectedTopologyNode,
  setSelectedTopologyNode,
  podMetrics,
  activeTab,
  setModal,
  handleRestart,
  handleScale,
  handleOpenDiagnostics,
  handleOpenServiceWebsite,
  nodeMetrics,
  getNodeUsagePercent,
}) => {
  const graphRef = useRef<HTMLDivElement>(null);
  const networkInstance = useRef<any>(null);

  const isTopologyItemConnected = (colType: 'node' | 'service' | 'deployment' | 'pod', item: any) => {
    if (!hoveredTopologyItem) return false;
    const { type: hType, name: hName, item: hItem } = hoveredTopologyItem;
    
    if (hType === colType && hName === item.metadata.name) return true;

    if (hType === 'pod') {
      if (colType === 'node') return hItem.spec?.nodeName === item.metadata.name;
      if (colType === 'deployment') return matchesSelector(hItem.metadata?.labels, item.spec?.selector?.matchLabels);
      if (colType === 'service') return matchesSelector(hItem.metadata?.labels, item.spec?.selector);
    }
    
    if (hType === 'node') {
      if (colType === 'pod') return item.spec?.nodeName === hName;
      if (colType === 'deployment' || colType === 'service') {
        const relatedPods = topologyData.pods.filter(p => p.spec?.nodeName === hName);
        if (colType === 'deployment') {
          return relatedPods.some(p => matchesSelector(p.metadata?.labels, item.spec?.selector?.matchLabels));
        }
        if (colType === 'service') {
          return relatedPods.some(p => matchesSelector(p.metadata?.labels, item.spec?.selector));
        }
      }
    }
    
    if (hType === 'deployment') {
      if (colType === 'pod') return matchesSelector(item.metadata?.labels, hItem.spec?.selector?.matchLabels);
      if (colType === 'node') {
        const relatedPods = topologyData.pods.filter(p => matchesSelector(p.metadata?.labels, hItem.spec?.selector?.matchLabels));
        return relatedPods.some(p => p.spec?.nodeName === item.metadata.name);
      }
      if (colType === 'service') {
        const depPods = topologyData.pods.filter(p => matchesSelector(p.metadata?.labels, hItem.spec?.selector?.matchLabels));
        return depPods.some(p => matchesSelector(p.metadata?.labels, item.spec?.selector));
      }
    }
    
    if (hType === 'service') {
      if (colType === 'pod') return matchesSelector(item.metadata?.labels, hItem.spec?.selector);
      if (colType === 'node') {
        const relatedPods = topologyData.pods.filter(p => matchesSelector(p.metadata?.labels, hItem.spec?.selector));
        return relatedPods.some(p => p.spec?.nodeName === item.metadata.name);
      }
      if (colType === 'deployment') {
        const svcPods = topologyData.pods.filter(p => matchesSelector(p.metadata?.labels, hItem.spec?.selector));
        return svcPods.some(p => matchesSelector(p.metadata?.labels, item.spec?.selector?.matchLabels));
      }
    }
    
    return false;
  };

  useEffect(() => {
    if (activeTab === 'topology' && topologyMode === 'graph' && graphRef.current) {
      // 1. Build nodes and edges
      const nodesList: any[] = [];
      const edgesList: any[] = [];

      // Add Nodes
      topologyData.nodes.forEach(n => {
        nodesList.push({
          id: `node-${n.metadata.name}`,
          label: n.metadata.name,
          title: `Node: ${n.metadata.name}\nKubelet: ${n.status?.nodeInfo?.kubeletVersion || 'N/A'}\nOS: ${n.status?.nodeInfo?.operatingSystem || 'N/A'}`,
          group: 'nodes',
          shape: 'box',
          margin: 10,
          color: {
            background: '#0a0a0a',
            border: '#3b82f6',
            highlight: { background: '#1d4ed8', border: '#60a5fa' },
            hover: { background: '#111111', border: '#60a5fa' }
          },
          font: { color: '#ffffff', face: 'Inter', size: 12 }
        });
      });

      // Add Services
      topologyData.services.forEach(s => {
        nodesList.push({
          id: `service-${s.metadata.name}`,
          label: s.metadata.name,
          title: `Service: ${s.metadata.name}\nType: ${s.spec?.type}\nClusterIP: ${s.spec?.clusterIP}`,
          group: 'services',
          shape: 'hexagon',
          color: {
            background: '#0a0a0a',
            border: '#60a5fa',
            highlight: { background: '#2563eb', border: '#60a5fa' },
            hover: { background: '#111111', border: '#60a5fa' }
          },
          font: { color: '#ffffff', face: 'Inter', size: 12 }
        });
      });

      // Add Deployments
      topologyData.deployments.forEach(d => {
        nodesList.push({
          id: `deployment-${d.metadata.name}`,
          label: d.metadata.name,
          title: `Deployment: ${d.metadata.name}\nReplicas: ${d.status?.readyReplicas || 0}/${d.spec?.replicas || 0}`,
          group: 'deployments',
          shape: 'ellipse',
          color: {
            background: '#0a0a0a',
            border: '#8b5cf6',
            highlight: { background: '#6d28d9', border: '#a78bfa' },
            hover: { background: '#111111', border: '#a78bfa' }
          },
          font: { color: '#ffffff', face: 'Inter', size: 12 }
        });
      });

      // Add Pods
      topologyData.pods.forEach(p => {
        const phase = (p.status?.phase || 'Unknown').toLowerCase();
        let color = '#3b82f6'; // running
        if (phase === 'pending') color = '#ffb800';
        if (phase === 'failed') color = '#e00';
        if (phase === 'succeeded') color = '#10b981';

        let borderCol = color;
        let borderDashes = false;
        let nodeLabel = p.metadata.name.length > 20 ? p.metadata.name.substring(0, 17) + '...' : p.metadata.name;
        let nodeTitle = `Pod: ${p.metadata.name}\nStatus: ${p.status?.phase}\nNode: ${p.spec?.nodeName}`;

        nodesList.push({
          id: `pod-${p.metadata.name}`,
          label: nodeLabel,
          title: nodeTitle,
          group: 'pods',
          shape: 'dot',
          size: 16,
          color: {
            background: '#0a0a0a',
            border: borderCol,
            highlight: { background: '#111111', border: borderCol },
            hover: { background: '#111111', border: borderCol }
          },
          shapeProperties: {
            borderDashes: borderDashes
          },
          font: { color: '#ffffff', face: 'Inter', size: 10 }
        });

        // Edges: Pod -> Node
        if (p.spec?.nodeName) {
          edgesList.push({
            from: `pod-${p.metadata.name}`,
            to: `node-${p.spec.nodeName}`,
            color: { color: '#222222', highlight: '#444444' },
            dashes: true,
            title: 'Runs on Node'
          });
        }

        // Edges: Pod -> Deployment
        topologyData.deployments.forEach(d => {
          if (matchesSelector(p.metadata?.labels, d.spec?.selector?.matchLabels)) {
            edgesList.push({
              from: `pod-${p.metadata.name}`,
              to: `deployment-${d.metadata.name}`,
              color: { color: '#8b5cf6', highlight: '#a78bfa' },
              width: 1.5,
              title: 'Managed by Deployment'
            });
          }
        });

        // Edges: Pod -> Service
        topologyData.services.forEach(s => {
          if (matchesSelector(p.metadata?.labels, s.spec?.selector)) {
            edgesList.push({
              from: `pod-${p.metadata.name}`,
              to: `service-${s.metadata.name}`,
              color: { color: '#60a5fa', highlight: '#93c5fd' },
              width: 1.5,
              arrows: 'to',
              title: 'Service Routes to Pod'
            });
          }
        });
      });

      // Initialize vis.Network
      const data = { nodes: nodesList, edges: edgesList };
      const options = {
        nodes: {
          borderWidth: 2,
          shadow: {
            enabled: true,
            color: 'rgba(0,0,0,0.5)',
            size: 4,
            x: 2,
            y: 2
          }
        },
        edges: {
          smooth: {
            enabled: true,
            type: 'continuous',
            roundness: 0.5
          }
        },
        physics: {
          stabilization: {
            enabled: true,
            iterations: 200
          },
          barnesHut: {
            gravitationalConstant: -1800,
            centralGravity: 0.3,
            springLength: 120,
            springConstant: 0.04,
            damping: 0.09
          }
        },
        interaction: {
          hover: true,
          tooltipDelay: 200,
          hideEdgesOnDrag: false
        }
      };

      if (networkInstance.current) {
        networkInstance.current.destroy();
      }

      networkInstance.current = new Network(graphRef.current, data, options);

      // Node double-click / click handler to open modals
      networkInstance.current.on('click', (params: any) => {
        if (params.nodes && params.nodes.length > 0) {
          setSelectedTopologyNode(params.nodes[0]);
        } else {
          setSelectedTopologyNode(null);
        }
      });

      networkInstance.current.on('doubleClick', (params: any) => {
        if (params.nodes && params.nodes.length > 0) {
          const selectedId = params.nodes[0];
          const parts = selectedId.split('-');
          const type = parts[0];
          const name = parts.slice(1).join('-');
          
          if (type === 'pod') {
            const pod = topologyData.pods.find(p => p.metadata.name === name);
            if (pod) {
              setModal({
                type: 'yaml',
                name: pod.metadata.name,
                namespace: pod.metadata.namespace,
                kind: 'pods',
                uid: pod.metadata.uid
              });
            }
          } else if (type === 'deployment') {
            const dep = topologyData.deployments.find(d => d.metadata.name === name);
            if (dep) {
              setModal({
                type: 'yaml',
                name: dep.metadata.name,
                namespace: dep.metadata.namespace,
                kind: 'deployments',
                uid: dep.metadata.uid
              });
            }
          } else if (type === 'service') {
            const svc = topologyData.services.find(s => s.metadata.name === name);
            if (svc) {
              setModal({
                type: 'yaml',
                name: svc.metadata.name,
                namespace: svc.metadata.namespace,
                kind: 'services',
                uid: svc.metadata.uid
              });
            }
          }
        }
      });
    }

    return () => {
      if (networkInstance.current) {
        networkInstance.current.destroy();
        networkInstance.current = null;
      }
    };
  }, [activeTab, topologyMode, topologyData]);

  const renderTopologyOverlay = () => {
    if (!selectedTopologyNode) return null;
    const parts = selectedTopologyNode.split('-');
    const type = parts[0];
    const name = parts.slice(1).join('-');
    
    let item: any = null;
    let category = '';
    let namespace = selectedNs === 'all' ? 'default' : selectedNs;
    let actions: { label: string; icon: any; action: () => void }[] = [];
    
    if (type === 'pod') {
      item = topologyData.pods.find(p => p.metadata.name === name);
      if (item) {
        category = 'Pod';
        namespace = item.metadata.namespace;
        actions = [
          { label: 'View Logs', icon: <FileText size={12}/>, action: () => setModal({ type: 'logs', name: item.metadata.name, namespace: item.metadata.namespace, kind: 'pods', uid: item.metadata.uid }) },
          { label: 'Console', icon: <Terminal size={12}/>, action: () => setModal({ type: 'terminal', name: item.metadata.name, namespace: item.metadata.namespace, kind: 'pods', uid: item.metadata.uid }) },
          { label: 'Files', icon: <FileText size={12}/>, action: () => setModal({ type: 'files', name: item.metadata.name, namespace: item.metadata.namespace, kind: 'pods', uid: item.metadata.uid }) },
          { label: 'Smart Doctor', icon: <span>🩺</span>, action: () => handleOpenDiagnostics(item.metadata.name, item.metadata.namespace) },
          { label: 'View YAML', icon: <Settings size={12}/>, action: () => setModal({ type: 'yaml', name: item.metadata.name, namespace: item.metadata.namespace, kind: 'pods', uid: item.metadata.uid }) }
        ];
      }
    } else if (type === 'deployment') {
      item = topologyData.deployments.find(d => d.metadata.name === name);
      if (item) {
        category = 'Deployment';
        namespace = item.metadata.namespace;
        actions = [
          { label: 'View YAML', icon: <Settings size={12}/>, action: () => setModal({ type: 'yaml', name: item.metadata.name, namespace: item.metadata.namespace, kind: 'deployments', uid: item.metadata.uid }) },
          { label: 'Restart Rollout', icon: <RefreshCw size={12}/>, action: () => handleRestart(item.metadata.name, item.metadata.namespace) },
          { label: 'Scale Replicas', icon: <SlidersHorizontal size={12}/>, action: () => handleScale(item.metadata.name, item.metadata.namespace, item.spec?.replicas || 0) }
        ];
      }
    } else if (type === 'service') {
      item = topologyData.services.find(s => s.metadata.name === name);
      if (item) {
        category = 'Service';
        namespace = item.metadata.namespace;
        actions = [
          { label: 'View YAML', icon: <Settings size={12}/>, action: () => setModal({ type: 'yaml', name: item.metadata.name, namespace: item.metadata.namespace, kind: 'services', uid: item.metadata.uid }) },
          { label: 'Website', icon: <Globe size={12}/>, action: () => handleOpenServiceWebsite(item) }
        ];
      }
    } else if (type === 'node') {
      item = topologyData.nodes.find(n => n.metadata.name === name);
      if (item) {
        category = 'Node';
        namespace = 'Cluster Scope';
        actions = [
          { label: 'View YAML', icon: <Settings size={12}/>, action: () => setModal({ type: 'yaml', name: item.metadata.name, namespace: 'default', kind: 'nodes', uid: item.metadata.uid }) }
        ];
      }
    }
    
    if (!item) return null;
    
    return (
      <div style={{
        position: 'absolute',
        bottom: 12,
        left: 12,
        background: 'rgba(7, 7, 7, 0.9)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--accent-blue)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.8), 0 0 10px rgba(59, 130, 246, 0.2)',
        width: '260px',
        animation: 'slide-in-up 0.2s ease-out'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px' }}>
          <div>
            <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--accent-blue)', fontWeight: 600 }}>{category} ({namespace})</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', wordBreak: 'break-all', marginTop: 2 }}>{item.metadata.name}</div>
          </div>
          <button 
            className="btn btn-icon" 
            style={{ padding: 4 }}
            onClick={() => setSelectedTopologyNode(null)}
          >
            <X size={14} />
          </button>
        </div>
        
        {category === 'Pod' && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Status: <span className={`status-dot ${item.status?.phase?.toLowerCase()}`} style={{ marginRight: 6 }}></span>
            <span style={{ color: 'var(--text-main)' }}>{item.status?.phase}</span>
          </div>
        )}
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          {actions.map((act, idx) => (
            <button
              key={idx}
              className="btn btn-sm btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-start', padding: '6px 10px', fontSize: '0.75rem' }}
              onClick={act.action}
            >
              {act.icon}
              <span>{act.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  if (topologyMode === 'graph') {
    return (
      <div className="topology-container animate-fade-in" style={{ height: 'calc(100vh - 280px)', position: 'relative' }}>
        <div 
          ref={graphRef} 
          className="topology-graph-canvas" 
          style={{ 
            width: '100%', 
            height: '100%', 
            background: '#070707', 
            border: '1px solid var(--border-color)', 
            borderRadius: 'var(--radius-lg)',
            position: 'relative',
            overflow: 'hidden'
          }} 
        />
        {/* Visual Graph Legend */}
        <div style={{
          position: 'absolute',
          top: 12,
          left: 12,
          background: 'rgba(7, 7, 7, 0.85)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: '12px 16px',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          fontSize: '0.75rem',
          width: '160px',
          pointerEvents: 'none'
        }}>
          <div style={{ fontWeight: 600, color: '#fff', marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px', letterSpacing: '0.5px', fontSize: '0.8rem' }}>GRAPH LEGEND</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
            <div style={{ width: '12px', height: '12px', background: '#0a0a0a', border: '2px solid #3b82f6', borderRadius: 'var(--radius-sm)' }} />
            <span>Node</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
            <div style={{ width: '12px', height: '12px', background: '#0a0a0a', border: '2px solid #8b5cf6', borderRadius: '50%' }} />
            <span>Deployment</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
            <svg viewBox="0 0 100 100" width="12" height="12" style={{ display: 'block', flexShrink: 0 }}>
              <polygon points="50,5 95,28 95,72 50,95 5,72 5,28" fill="#0a0a0a" stroke="#60a5fa" strokeWidth="15" />
            </svg>
            <span>Service</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
            <div style={{ width: '8px', height: '8px', background: '#0a0a0a', border: '2px solid #3b82f6', borderRadius: '50%' }} />
            <span>Pod (Running)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
            <div style={{ width: '8px', height: '8px', background: '#0a0a0a', border: '2px solid #10b981', borderRadius: '50%' }} />
            <span>Pod (Succeeded)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
            <div style={{ width: '8px', height: '8px', background: '#0a0a0a', border: '2px solid #ffb800', borderRadius: '50%' }} />
            <span>Pod (Pending)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
            <div style={{ width: '8px', height: '8px', background: '#0a0a0a', border: '2px solid #ef4444', borderRadius: '50%' }} />
            <span>Pod (Failed)</span>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 12, right: 12, fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 4, zIndex: 10, pointerEvents: 'none' }}>
          Click a node for actions | Double-click to inspect
        </div>
        {renderTopologyOverlay()}
      </div>
    );
  }

  return (
    <div className="topology-container animate-fade-in">
      <div className="topology-layout">
        {/* Column 1: Nodes */}
        <div className="topology-col">
          <div className="topology-col-title">Nodes ({topologyData.nodes.length})</div>
          {topologyData.nodes.map(node => {
            const isActive = hoveredTopologyItem ? isTopologyItemConnected('node', node) : false;
            const metric = nodeMetrics.find(nm => nm.metadata.name === node.metadata.name);
            const { cpuPercent, memPercent } = metric ? getNodeUsagePercent(metric) : { cpuPercent: 0, memPercent: 0 };
            
            return (
              <div 
                key={node.metadata.uid} 
                className={`topology-card ${isActive ? 'active' : ''}`}
                onMouseEnter={() => setHoveredTopologyItem({ type: 'node', name: node.metadata.name, item: node })}
                onMouseLeave={() => setHoveredTopologyItem(null)}
              >
                <div className="topology-card-title">{node.metadata.name}</div>
                <div className="topology-card-subtitle">
                  Version: {node.status?.nodeInfo?.kubeletVersion}<br/>
                  OS: {node.status?.nodeInfo?.operatingSystem}
                </div>
                {metric && (
                  <div style={{ marginTop: 8 }}>
                    <div className="metric-bar-wrapper" title={`CPU Usage: ${cpuPercent}%`}>
                      <div className="metric-bar-fill normal" style={{ width: `${cpuPercent}%`, background: 'var(--accent-cyan)' }}></div>
                    </div>
                    <div className="metric-bar-wrapper" style={{ marginTop: 4 }} title={`Memory Usage: ${memPercent}%`}>
                      <div className="metric-bar-fill normal" style={{ width: `${memPercent}%`, background: 'var(--accent-purple)' }}></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Column 2: Services */}
        <div className="topology-col">
          <div className="topology-col-title">Services ({topologyData.services.length})</div>
          {topologyData.services.map(svc => {
            const isActive = hoveredTopologyItem ? isTopologyItemConnected('service', svc) : false;
            
            return (
              <div 
                key={svc.metadata.uid} 
                className={`topology-card ${isActive ? 'active' : ''}`}
                onMouseEnter={() => setHoveredTopologyItem({ type: 'service', name: svc.metadata.name, item: svc })}
                onMouseLeave={() => setHoveredTopologyItem(null)}
                onClick={() => setModal({ type: 'yaml', name: svc.metadata.name, namespace: selectedNs, kind: 'services', uid: svc.metadata.uid })}
              >
                <div className="topology-card-title">{svc.metadata.name}</div>
                <div className="topology-card-subtitle">
                  Type: {svc.spec?.type}<br/>
                  IP: {svc.spec?.clusterIP}<br/>
                  Port: {svc.spec?.ports?.[0]?.port}
                </div>
              </div>
            );
          })}
        </div>

        {/* Column 3: Deployments */}
        <div className="topology-col">
          <div className="topology-col-title">Deployments ({topologyData.deployments.length})</div>
          {topologyData.deployments.map(dep => {
            const isActive = hoveredTopologyItem ? isTopologyItemConnected('deployment', dep) : false;
            
            return (
              <div 
                key={dep.metadata.uid} 
                className={`topology-card ${isActive ? 'active' : ''}`}
                onMouseEnter={() => setHoveredTopologyItem({ type: 'deployment', name: dep.metadata.name, item: dep })}
                onMouseLeave={() => setHoveredTopologyItem(null)}
                onClick={() => setModal({ type: 'yaml', name: dep.metadata.name, namespace: selectedNs, kind: 'deployments', uid: dep.metadata.uid })}
              >
                <div className="topology-card-title">{dep.metadata.name}</div>
                <div className="topology-card-subtitle">
                  Replicas: {dep.status?.readyReplicas || 0}/{dep.spec?.replicas || 0}
                </div>
              </div>
            );
          })}
        </div>

        {/* Column 4: Pods */}
        <div className="topology-col">
          <div className="topology-col-title">Pods ({topologyData.pods.length})</div>
          {topologyData.pods.map(pod => {
            const isActive = hoveredTopologyItem ? isTopologyItemConnected('pod', pod) : false;
            const status = pod.status?.phase?.toLowerCase() || 'unknown';
            const metric = podMetrics.find(pm => pm.metadata.name === pod.metadata.name && pm.metadata.namespace === pod.metadata.namespace);
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
                onClick={() => setModal({ type: 'yaml', name: pod.metadata.name, namespace: selectedNs, kind: 'pods', uid: pod.metadata.uid })}
              >
                <div className="topology-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pod.metadata.name}</span>
                  <button 
                    className="btn btn-icon btn-sm" 
                    style={{ padding: 2, minHeight: 'auto', background: 'transparent', border: 'none' }}
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      handleOpenDiagnostics(pod.metadata.name, pod.metadata.namespace || selectedNs); 
                    }}
                    title="Run Pod Diagnostics"
                  >
                    🩺
                  </button>
                </div>
                <div className="topology-card-subtitle">
                  Status: <span className={`badge ${status}`} style={{ fontSize: '0.65rem', padding: '0px 4px' }}>{status}</span><br/>
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
