import { useState, useEffect, useRef } from 'react';
import { Network } from 'vis-network';
import { 
  Box, Layers, Server, Activity, Trash2, Terminal,
  FileText, Shield, Key, GitCommit, RefreshCw, X, Save, Search, Settings, Info, Power, SlidersHorizontal,
  ArrowDown, Copy, Database, Package, Radio, Command, Code, List
} from 'lucide-react';
import './index.css';

type ResourceKind = 'pods' | 'deployments' | 'services' | 'configmaps' | 'secrets' | 'ingresses' | 'jobs' | 'cronjobs' | 'nodes' | 'topology' | 'persistentvolumes' | 'persistentvolumeclaims' | 'helm' | 'crds' | 'custom' | 'events' | 'zarf' | 'dashboard';
type ModalType = 'yaml' | 'logs' | 'events' | 'terminal' | 'portforward' | 'history';

// Unit parsers for metrics
const parseCpu = (cpuStr: string) => {
  if (!cpuStr) return 0;
  if (cpuStr.endsWith('n')) return parseFloat(cpuStr) / 1000000000;
  if (cpuStr.endsWith('u')) return parseFloat(cpuStr) / 1000000;
  if (cpuStr.endsWith('m')) return parseFloat(cpuStr) / 1000;
  return parseFloat(cpuStr);
};

const parseMem = (memStr: string) => {
  if (!memStr) return 0;
  if (memStr.endsWith('Ki')) return parseFloat(memStr) * 1024;
  if (memStr.endsWith('Mi')) return parseFloat(memStr) * 1024 * 1024;
  if (memStr.endsWith('Gi')) return parseFloat(memStr) * 1024 * 1024 * 1024;
  return parseFloat(memStr);
};

// YAML JSON syntax highlighter
const highlightYaml = (text: string) => {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  html = html.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")(\s*:)/g, '<span class="yaml-key">$1</span>$3');
  html = html.replace(/:(\s*)("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")/g, ':$1<span class="yaml-string">$2</span>');
  html = html.replace(/:(\s*)([0-9.-]+)(?=\s|,|$|\n)/g, ':$1<span class="yaml-number">$2</span>');
  html = html.replace(/:(\s*)(true|false)(?=\s|,|$|\n)/g, ':$1<span class="yaml-boolean">$2</span>');
  html = html.replace(/:(\s*)(null)(?=\s|,|$|\n)/g, ':$1<span class="yaml-null">$2</span>');
  
  return html;
};

// Log viewer with regex colors and search filters
const colorizeLogs = (logs: string, filter: string) => {
  if (!logs) return [];
  const lines = logs.split('\n');
  
  return lines
    .filter(line => !filter || line.toLowerCase().includes(filter.toLowerCase()))
    .map((line, i) => {
      let type = 'normal';
      
      if (/error|fail|exception|fatal/i.test(line)) {
        type = 'error';
      } else if (/warn|warning/i.test(line)) {
        type = 'warn';
      } else if (/info/i.test(line)) {
        type = 'info';
      } else if (/success|ok|ready/i.test(line)) {
        type = 'success';
      }
      
      if (filter) {
        const regex = new RegExp(`(${filter})`, 'gi');
        const parts = line.split(regex);
        return (
          <span key={i} className={`log-line log-${type}`}>
            {parts.map((part, pi) => 
              part.toLowerCase() === filter.toLowerCase() 
                ? <mark key={pi} className="log-highlight">{part}</mark>
                : part
            )}
          </span>
        );
      }
      return <span key={i} className={`log-line log-${type}`}>{line}</span>;
    });
};

const pluralizeKind = (kind: string): string => {
  if (!kind) return '';
  const k = kind.toLowerCase();
  if (k === 'ingress') return 'ingresses';
  if (k === 'persistentvolume') return 'persistentvolumes';
  if (k === 'persistentvolumeclaim') return 'persistentvolumeclaims';
  if (k.endsWith('y')) return k.slice(0, -1) + 'ies';
  return k + 's';
};

const matchesSelector = (labels: any, selector: any) => {
  if (!labels || !selector) return false;
  return Object.keys(selector).every(key => labels[key] === selector[key]);
};

function App() {
  const [activeTab, setActiveTab] = useState<ResourceKind>('dashboard');
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [selectedNs, setSelectedNs] = useState<string>('all');
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [modal, setModal] = useState<{type: ModalType, name: string, namespace: string, kind: string, uid?: string} | null>(null);
  const [modalData, setModalData] = useState<any>(null);
  const [yamlEdit, setYamlEdit] = useState('');
  
  // Dashboard Stats
  const [stats, setStats] = useState({ nodes: 0, pods: 0, deployments: 0 });
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [dashboardData, setDashboardData] = useState<{
    counts: {
      pods: number;
      deployments: number;
      nodes: number;
      services: number;
      configmaps: number;
      secrets: number;
      persistentvolumes: number;
      persistentvolumeclaims: number;
      helmreleases: number;
      zarfpackages: number;
    };
    podPhases: {
      running: number;
      pending: number;
      succeeded: number;
      failed: number;
    };
    resources: {
      cpuPct: number;
      memPct: number;
      cpuUse: number;
      cpuCap: number;
      memUse: number;
      memCap: number;
    };
  } | null>(null);

  // Advanced Features States
  const [nodeMetrics, setNodeMetrics] = useState<any[]>([]);
  const [podMetrics, setPodMetrics] = useState<any[]>([]);
  const [isEditingYaml, setIsEditingYaml] = useState(false);
  
  // Container Selection
  const [selectedContainer, setSelectedContainer] = useState('');
  
  // Terminal execution states
  const [cmdInput, setCmdInput] = useState('');
  const [cmdHistory, setCmdHistory] = useState<{cmd: string, output: string, error?: boolean}[]>([]);
  const [cmdLoading, setCmdLoading] = useState(false);
  
  // Log search state
  const [logSearch, setLogSearch] = useState('');
  const [isStreamingLogs, setIsStreamingLogs] = useState(false);
  
  // Topology state
  const [topologyData, setTopologyData] = useState<{
    nodes: any[],
    services: any[],
    deployments: any[],
    pods: any[]
  }>({ nodes: [], services: [], deployments: [], pods: [] });
  const [hoveredTopologyItem, setHoveredTopologyItem] = useState<{type: 'node' | 'service' | 'deployment' | 'pod', name: string, item: any} | null>(null);
  const [topologyMode, setTopologyMode] = useState<'columns' | 'graph'>('columns');
  const graphRef = useRef<HTMLDivElement>(null);
  const networkInstance = useRef<any>(null);

  // Custom states for CRD & Command Palette
  const [customCrd, setCustomCrd] = useState<{group: string, version: string, plural: string, name: string} | null>(null);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [cmdPaletteSearch, setCmdPaletteSearch] = useState('');

  // Zarf & Helm Management States
  const [zarfStatus, setZarfStatus] = useState<{installed: boolean, version?: string}>({ installed: false });
  const [isDeployHelmModalOpen, setIsDeployHelmModalOpen] = useState(false);
  const [isDeployZarfModalOpen, setIsDeployZarfModalOpen] = useState(false);
  const [helmDeployForm, setHelmDeployForm] = useState({ releaseName: '', namespace: 'default', chartName: '', valuesYaml: '' });
  const [zarfDeployForm, setZarfDeployForm] = useState({ packagePath: '' });
  const [isSubmittingHelmDeploy, setIsSubmittingHelmDeploy] = useState(false);
  const [isSubmittingZarfDeploy, setIsSubmittingZarfDeploy] = useState(false);

  const fetchZarfStatus = () => {
    fetch('/api/zarf/status')
      .then(res => res.json())
      .then(data => {
        setZarfStatus(data);
      })
      .catch(console.error);
  };

  const fetchNamespaces = () => {
    fetch('/api/namespaces').then(res => res.json()).then(data => {
      if (Array.isArray(data)) setNamespaces(['all', ...data]);
    }).catch(console.error);
  };

  const fetchResources = () => {
    setLoading(true);
    if (activeTab === 'dashboard') {
      fetch(`/api/dashboard/stats?namespace=${selectedNs}`)
        .then(res => res.json())
        .then(data => {
          setDashboardData(data);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
      return;
    }

    const endpoint = activeTab === 'nodes' 
      ? '/api/nodes' 
      : activeTab === 'helm'
      ? `/api/helm?namespace=${selectedNs}`
      : activeTab === 'zarf'
      ? '/api/zarf/packages'
      : activeTab === 'crds'
      ? '/api/crds'
      : activeTab === 'custom' && customCrd
      ? `/api/custom/${customCrd.group}/${customCrd.version}/${customCrd.plural}?namespace=${selectedNs}`
      : `/api/resource/${activeTab}?namespace=${selectedNs}`;
    
    fetch(endpoint).then(res => res.json()).then(data => {
      let normalized = Array.isArray(data) ? data : [];
      if (activeTab === 'helm') {
        normalized = normalized.map((hr: any) => {
          let cleanDate = hr.updated ? new Date(hr.updated.replace(/\s+[A-Z]+(?=\s*[-+]\d+|$)/g, '')) : new Date();
          let timestamp = isNaN(cleanDate.getTime()) ? new Date().toISOString() : cleanDate.toISOString();
          return {
            metadata: {
              name: hr.name,
              namespace: hr.namespace,
              uid: `helm-${hr.namespace}-${hr.name}`,
              creationTimestamp: timestamp
            },
            status: {
              phase: hr.status
            },
            revision: hr.revision,
            chart: hr.chart,
            appVersion: hr.app_version,
            updated: hr.updated
          };
        });
      }
      setResources(normalized);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setResources([]);
      setLoading(false);
    });
    
    // Fetch stats in background
    Promise.all([
      fetch('/api/nodes').then(res => res.json()).catch(() => []),
      fetch(`/api/resource/pods?namespace=${selectedNs}`).then(res => res.json()).catch(() => []),
      fetch(`/api/resource/deployments?namespace=${selectedNs}`).then(res => res.json()).catch(() => [])
    ]).then(([n, p, d]) => {
      setStats({
        nodes: n?.length || 0,
        pods: p?.length || 0,
        deployments: d?.length || 0
      });
    });
  };

  const fetchTopologyData = async () => {
    setLoading(true);
    try {
      const [n, s, d, p] = await Promise.all([
        fetch('/api/nodes').then(res => res.json()).catch(() => []),
        fetch(`/api/resource/services?namespace=${selectedNs}`).then(res => res.json()).catch(() => []),
        fetch(`/api/resource/deployments?namespace=${selectedNs}`).then(res => res.json()).catch(() => []),
        fetch(`/api/resource/pods?namespace=${selectedNs}`).then(res => res.json()).catch(() => [])
      ]);
      setTopologyData({
        nodes: Array.isArray(n) ? n : [],
        services: Array.isArray(s) ? s : [],
        deployments: Array.isArray(d) ? d : [],
        pods: Array.isArray(p) ? p : []
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetrics = () => {
    fetch('/api/metrics/nodes').then(res => res.json()).then(data => {
      if (Array.isArray(data)) {
        setNodeMetrics(data);
        
        let totalCpuPct = 0;
        let totalMemPct = 0;
        let validNodesCount = 0;
        
        data.forEach(nm => {
          try {
            const usage = getNodeUsagePercent(nm);
            totalCpuPct += usage.cpuPercent;
            totalMemPct += usage.memPercent;
            validNodesCount++;
          } catch (e) {
            console.error('Error calculating node usage metrics:', e);
          }
        });
        
        if (validNodesCount > 0) {
          const avgCpu = Math.round(totalCpuPct / validNodesCount);
          const avgMem = Math.round(totalMemPct / validNodesCount);
          
          setCpuHistory(prev => [...prev.slice(-19), avgCpu]);
          setMemHistory(prev => [...prev.slice(-19), avgMem]);
        }
      }
    }).catch(console.error);

    fetch('/api/metrics/pods').then(res => res.json()).then(data => {
      if (Array.isArray(data)) setPodMetrics(data);
    }).catch(console.error);
  };

  const runCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmdInput.trim() || !modal) return;
    const currentCmd = cmdInput;
    setCmdInput('');
    setCmdLoading(true);
    
    setCmdHistory(prev => [...prev, { cmd: currentCmd, output: 'Running...' }]);
    
    try {
      const res = await fetch(`/api/resource/pods/${modal.namespace}/${modal.name}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: currentCmd, container: selectedContainer })
      });
      const data = await res.json();
      
      setCmdHistory(prev => {
        const next = [...prev];
        next[next.length - 1] = {
          cmd: currentCmd,
          output: data.stdout || data.stderr || 'Command executed with no output.',
          error: !!data.stderr || !!data.error
        };
        return next;
      });
    } catch (err: any) {
      setCmdHistory(prev => {
        const next = [...prev];
        next[next.length - 1] = {
          cmd: currentCmd,
          output: err.message || 'Failed to connect to container.',
          error: true
        };
        return next;
      });
    } finally {
      setCmdLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(yamlEdit);
    alert('Copied to clipboard!');
  };

  const downloadYaml = () => {
    if (!modal) return;
    const blob = new Blob([yamlEdit], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${modal.name}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadLogs = () => {
    if (!modal) return;
    const blob = new Blob([modalData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${modal.name}-logs.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const scrollToBottomLogs = () => {
    const el = document.querySelector('.terminal-container');
    if (el) el.scrollTop = el.scrollHeight;
  };

  const getPodContainers = (): string[] => {
    if (!modal || modal.kind !== 'pods') return [];
    const pod = resources.find(r => r.metadata.name === modal.name && r.metadata.namespace === modal.namespace) 
      || topologyData.pods.find(p => p.metadata.name === modal.name && p.metadata.namespace === modal.namespace);
    return pod?.spec?.containers?.map((c: any) => c.name as string) || [];
  };

  useEffect(() => {
    fetchNamespaces();
    fetchZarfStatus();
  }, []);

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

        nodesList.push({
          id: `pod-${p.metadata.name}`,
          label: p.metadata.name.length > 20 ? p.metadata.name.substring(0, 17) + '...' : p.metadata.name,
          title: `Pod: ${p.metadata.name}\nStatus: ${p.status?.phase}\nNode: ${p.spec?.nodeName}`,
          group: 'pods',
          shape: 'dot',
          size: 16,
          color: {
            background: '#0a0a0a',
            border: color,
            highlight: { background: '#111111', border: color },
            hover: { background: '#111111', border: color }
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

  useEffect(() => {
    setResources([]);
    setLoading(true);
    if (activeTab === 'topology') {
      fetchTopologyData();
      const interval = setInterval(fetchTopologyData, 10000);
      return () => clearInterval(interval);
    } else {
      fetchResources();
      const interval = setInterval(fetchResources, 10000);
      return () => clearInterval(interval);
    }
  }, [activeTab, selectedNs, customCrd]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCmdPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [selectedNs]);

  useEffect(() => {
    if (modal) {
      setCmdHistory([]);
      setCmdInput('');
      setLogSearch('');
      setIsEditingYaml(false);
      setIsStreamingLogs(false);
      
      if (modal.kind === 'pods') {
        const containers = getPodContainers();
        setSelectedContainer(containers[0] || '');
      } else {
        setSelectedContainer('');
      }
    }
  }, [modal?.name, modal?.type]);

  useEffect(() => {
    if (modal) fetchModalData(modal.type);
  }, [modal?.type, modal?.name, selectedContainer]);

  useEffect(() => {
    if (!modal || modal.type !== 'logs' || !isStreamingLogs) return;
    const interval = setInterval(() => {
      fetch(`/api/logs/${modal.namespace}/${modal.name}?container=${selectedContainer}`)
        .then(res => res.text())
        .then(text => {
          setModalData(text || 'No logs available.');
        })
        .catch(console.error);
    }, 2000);
    return () => clearInterval(interval);
  }, [modal?.name, modal?.type, selectedContainer, isStreamingLogs]);

  const fetchModalData = async (type: ModalType) => {
    if (!modal) return;
    setModalData(null);
    try {
      if (type === 'yaml') {
        const url = modal.kind === 'custom' && customCrd
          ? `/api/custom/yaml/${customCrd.group}/${customCrd.version}/${customCrd.plural}/${modal.namespace}/${modal.name}`
          : `/api/yaml/${modal.kind}/${modal.namespace}/${modal.name}`;
        const res = await fetch(url);
        const data = await res.json();
        const yamlStr = JSON.stringify(data, null, 2);
        setYamlEdit(yamlStr);
        setModalData(yamlStr);
      } else if (type === 'logs') {
        const res = await fetch(`/api/logs/${modal.namespace}/${modal.name}?container=${selectedContainer}`);
        const text = await res.text();
        setModalData(text || 'No logs available.');
      } else if (type === 'events') {
        if (modal.kind === 'helm') {
          const res = await fetch(`/api/helm/${modal.namespace}/${modal.name}/status`);
          const data = await res.json();
          setModalData(data.status || 'No status available.');
        } else {
          const res = await fetch(`/api/events/${modal.namespace}/${modal.uid}`);
          const data = await res.json();
          setModalData(data);
        }
      } else if (type === 'terminal') {
        setModalData('terminal-ready');
      } else if (type === 'portforward') {
        const res = await fetch('/api/portforward');
        const data = await res.json();
        setModalData(data);
      } else if (type === 'history') {
        const res = await fetch(`/api/helm/${modal.namespace}/${modal.name}/history`);
        const data = await res.json();
        setModalData(data);
      }
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (res: any) => {
    const { name, namespace } = res.metadata;
    if (!window.confirm(`Are you sure you want to delete ${activeTab} ${name}?`)) return;
    try {
      const endpoint = activeTab === 'helm' 
        ? `/api/helm/${namespace}/${name}` 
        : activeTab === 'custom' && customCrd
        ? `/api/custom/${customCrd.group}/${customCrd.version}/${customCrd.plural}/${namespace}/${name}`
        : `/api/resource/${activeTab}/${namespace}/${name}`;
      const response = await fetch(endpoint, { method: 'DELETE' });
      if (response.ok) setResources(prev => prev.filter(r => r.metadata.uid !== res.metadata.uid));
    } catch (err) { console.error(err); }
  };

  const handleRollback = async (namespace: string, name: string, revision: number) => {
    if (!window.confirm(`Are you sure you want to rollback release ${name} to revision #${revision}?`)) return;
    try {
      const res = await fetch(`/api/helm/${namespace}/${name}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Successfully rolled back release ${name} to revision #${revision}`);
        fetchModalData('history');
        fetchResources();
      } else {
        alert(`Failed to rollback: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error rolling back: ${err.message}`);
    }
  };

  const handleRemoveZarfPackage = async (name: string) => {
    if (!window.confirm(`Are you sure you want to remove Zarf package "${name}"? This will delete all components of the package from the cluster.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/zarf/packages/${name}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        alert(`Successfully removed Zarf package "${name}"`);
        fetchResources();
      } else {
        alert(`Failed to remove package: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      alert(`Error removing package: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveYaml = async () => {
    if (!modal) return;
    try {
      const url = modal.kind === 'custom' && customCrd
        ? `/api/custom/yaml/${customCrd.group}/${customCrd.version}/${customCrd.plural}/${modal.namespace}/${modal.name}`
        : `/api/yaml/${modal.kind}/${modal.namespace}/${modal.name}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: yamlEdit
      });
      if (res.ok) {
        setModal(null);
        fetchResources();
      } else {
        const err = await res.json();
        alert('Failed to save: ' + err.error);
      }
    } catch (err) { console.error(err); }
  };

  const handleRestart = async (name: string, namespace: string) => {
    if (!window.confirm(`Restart deployment ${name}?`)) return;
    try {
      await fetch(`/api/deployments/${namespace}/${name}/restart`, { method: 'PUT' });
      fetchResources();
    } catch (err) { console.error(err); }
  };

  const handleScale = async (name: string, namespace: string, current: number) => {
    const scaleTo = window.prompt(`Scale deployment ${name} to:`, current.toString());
    if (scaleTo === null || isNaN(Number(scaleTo))) return;
    try {
      await fetch(`/api/deployments/${namespace}/${name}/scale`, { 
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replicas: Number(scaleTo) })
      });
      fetchResources();
    } catch (err) { console.error(err); }
  };

  const renderStatusBadge = (resource: any) => {
    if (activeTab === 'pods') {
      const status = resource.status?.phase?.toLowerCase() || 'unknown';
      return <span className={`badge ${status}`}>{status}</span>;
    }
    if (activeTab === 'deployments') {
      const ready = resource.status?.readyReplicas || 0;
      const total = resource.spec?.replicas || 0;
      return <span className={`badge ${ready === total ? 'ready' : 'pending'}`}>{ready}/{total}</span>;
    }
    if (activeTab === 'nodes') {
      const readyCondition = resource.status?.conditions?.find((c: any) => c.type === 'Ready');
      return <span className={`badge ${readyCondition?.status === 'True' ? 'ready' : 'error'}`}>
        {readyCondition?.status === 'True' ? 'Ready' : 'Not Ready'}
      </span>;
    }
    if (activeTab === 'persistentvolumes') {
      const status = resource.status?.phase?.toLowerCase() || 'unknown';
      return <span className={`badge ${status === 'bound' || status === 'available' ? 'ready' : 'pending'}`}>{status}</span>;
    }
    if (activeTab === 'persistentvolumeclaims') {
      const status = resource.status?.phase?.toLowerCase() || 'unknown';
      return <span className={`badge ${status === 'bound' ? 'ready' : status === 'pending' ? 'pending' : 'error'}`}>{status}</span>;
    }
    if (activeTab === 'helm') {
      const status = resource.status?.phase?.toLowerCase() || 'unknown';
      return <span className={`badge ${status === 'deployed' ? 'ready' : 'error'}`}>{status}</span>;
    }
    return <span className="badge ready">Active</span>;
  };

  const getNodeCapacity = (nodeName: string) => {
    const node = resources.find(r => r.metadata.name === nodeName) || topologyData.nodes.find(r => r.metadata.name === nodeName);
    if (!node) return { cpu: 1, memory: 1 };
    const cpuCap = parseCpu(node.status?.capacity?.cpu || '1');
    const memCap = parseMem(node.status?.capacity?.memory || '1Ki');
    return { cpu: cpuCap, memory: memCap };
  };

  const getNodeUsagePercent = (nodeMetric: any) => {
    const { cpu, memory } = getNodeCapacity(nodeMetric.metadata.name);
    const cpuUse = parseCpu(nodeMetric.usage?.cpu || '0');
    const memUse = parseMem(nodeMetric.usage?.memory || '0');
    return {
      cpuPercent: Math.min(100, Math.round((cpuUse / cpu) * 100)),
      memPercent: Math.min(100, Math.round((memUse / memory) * 100))
    };
  };

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

  const renderTopologyView = () => {
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
          <div style={{ position: 'absolute', bottom: 12, right: 12, fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 4, zIndex: 10, pointerEvents: 'none' }}>
            Double-click a node to inspect resource
          </div>
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
                  <div className="topology-card-title">{pod.metadata.name}</div>
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
            <div key={d.name} style={{ flex: 1, textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
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

  const renderDashboardView = () => {
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

  const renderZarfView = () => {
    return (
      <div className="zarf-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Zarf Status Banner */}
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            padding: '16px 20px', 
            background: zarfStatus.installed ? 'rgba(57, 255, 20, 0.05)' : 'rgba(238, 0, 0, 0.05)', 
            border: `1px solid ${zarfStatus.installed ? 'rgba(57, 255, 20, 0.2)' : 'rgba(238, 0, 0, 0.2)'}`, 
            borderRadius: 8 
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Package size={24} style={{ color: zarfStatus.installed ? 'var(--accent-green)' : 'var(--accent-error)' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                Zarf Status: {zarfStatus.installed ? `Installed (Version: ${zarfStatus.version})` : 'Not Found / Offline'}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {zarfStatus.installed 
                  ? 'Ready to deploy offline Zarf package archives' 
                  : 'Ensure the zarf binary is installed and present in the host system PATH'}
              </div>
            </div>
          </div>
          {zarfStatus.installed && (
            <button className="btn btn-primary" onClick={() => setIsDeployZarfModalOpen(true)}>
              <Package size={14} /> Deploy Package
            </button>
          )}
        </div>

        {/* Deployed Zarf Packages List */}
        <div>
          <h2 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Deployed Packages ({filteredResources.length})</h2>
          {!zarfStatus.installed ? (
            <div style={{ color: 'var(--text-muted)', padding: '20px 0' }}>Please install Zarf on the host to list packages.</div>
          ) : filteredResources.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-color)', borderRadius: 8 }}>
              No deployed packages found in this cluster.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredResources.filter((pkg: any) => pkg && !pkg.metadata).map((pkg: any) => {
                const name = pkg.name || pkg.Name || pkg.package || pkg.Package || 'Unknown';
                const version = pkg.version || pkg.Version || 'N/A';
                const arch = pkg.architecture || pkg.arch || pkg.Architecture || 'N/A';
                const components = Array.isArray(pkg.components) 
                  ? pkg.components.join(', ') 
                  : (Array.isArray(pkg.deployedComponents) 
                    ? pkg.deployedComponents.map((c: any) => c.name || c).join(', ') 
                    : String(pkg.components || 'N/A'));
                
                return (
                  <div 
                    key={name}
                    className="resource-row animate-fade-in"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '16px 20px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-main)' }}>{name}</span>
                        <span className="badge badge-running" style={{ textTransform: 'none' }}>{arch}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Version: <span style={{ color: 'var(--text-main)', marginRight: 12 }}>{version}</span>
                        Components: <span style={{ color: 'var(--text-main)' }}>{components}</span>
                      </div>
                    </div>
                    
                    <button 
                      className="btn btn-danger"
                      onClick={() => handleRemoveZarfPackage(name)}
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const filteredResources = resources.filter(r => {
    const term = search.toLowerCase();
    if (!term) return true;
    
    if (activeTab === 'zarf') {
      const name = r.name || r.Name || r.package || r.Package || '';
      return name.toLowerCase().includes(term);
    }
    
    if (term.startsWith('label:')) {
      const labelQuery = search.slice(6).trim();
      if (!labelQuery) return true;
      const parts = labelQuery.split('=');
      const key = parts[0];
      const val = parts[1] || '';
      if (!r.metadata?.labels) return false;
      if (val) {
        return r.metadata.labels[key] === val;
      }
      return r.metadata.labels.hasOwnProperty(key);
    }
    
    return (r.metadata?.name || '').toLowerCase().includes(term);
  });

  return (
    <div className="layout-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" className="brand-logo" alt="logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>Periscope</span>
            <span style={{ 
              fontSize: '0.62rem', 
              color: '#60a5fa', 
              fontWeight: 600, 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px', 
              marginTop: '4px',
              letterSpacing: '0.5px',
              textTransform: 'uppercase'
            }}>
              <svg viewBox="0 0 256 250" width="11" height="11" style={{ display: 'inline-block', flexShrink: 0 }}>
                <path d="M128 0L239.53 53.64V178.6L128 250L16.47 178.6V53.64L128 0Z" fill="#326CE5"/>
                <path d="M128 35.12L208.57 73.84V163.66L128 215.12L47.43 163.66V73.84L128 35.12Z" fill="white"/>
                <path d="M128 53.68V95.73M128 153.27V195.32M74.96 158.73L104.7 128.99M181.04 90.27L151.3 120.01M53.68 128H95.73M153.27 128H195.32M74.96 97.27L104.7 127.01M181.04 151.73L151.3 121.99" stroke="#326CE5" strokeWidth="18" strokeLinecap="round"/>
                <circle cx="128" cy="128" r="28" fill="#326CE5"/>
              </svg>
              Kubernetes
            </span>
          </div>
        </div>
        
        <div className="nav-section">
          <div className="nav-section-title">Cluster</div>
          <nav className="nav-menu">
            <a className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}><SlidersHorizontal size={16} /> Dashboard</a>
            <a className={`nav-item ${activeTab === 'topology' ? 'active' : ''}`} onClick={() => setActiveTab('topology')}><Activity size={16} /> Topology</a>
            <a className={`nav-item ${activeTab === 'nodes' ? 'active' : ''}`} onClick={() => setActiveTab('nodes')}><Server size={16} /> Nodes</a>
            <a className={`nav-item ${activeTab === 'events' ? 'active' : ''}`} onClick={() => setActiveTab('events')}><List size={16} /> Events</a>
          </nav>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Workloads</div>
          <nav className="nav-menu">
            <a className={`nav-item ${activeTab === 'pods' ? 'active' : ''}`} onClick={() => setActiveTab('pods')}><Box size={16} /> Pods</a>
            <a className={`nav-item ${activeTab === 'deployments' ? 'active' : ''}`} onClick={() => setActiveTab('deployments')}><Layers size={16} /> Deployments</a>
            <a className={`nav-item ${activeTab === 'jobs' ? 'active' : ''}`} onClick={() => setActiveTab('jobs')}><Activity size={16} /> Jobs</a>
            <a className={`nav-item ${activeTab === 'cronjobs' ? 'active' : ''}`} onClick={() => setActiveTab('cronjobs')}><RefreshCw size={16} /> CronJobs</a>
          </nav>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Network</div>
          <nav className="nav-menu">
            <a className={`nav-item ${activeTab === 'services' ? 'active' : ''}`} onClick={() => setActiveTab('services')}><GitCommit size={16} /> Services</a>
            <a className={`nav-item ${activeTab === 'ingresses' ? 'active' : ''}`} onClick={() => setActiveTab('ingresses')}><Shield size={16} /> Ingresses</a>
          </nav>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Config</div>
          <nav className="nav-menu">
            <a className={`nav-item ${activeTab === 'configmaps' ? 'active' : ''}`} onClick={() => setActiveTab('configmaps')}><FileText size={16} /> ConfigMaps</a>
            <a className={`nav-item ${activeTab === 'secrets' ? 'active' : ''}`} onClick={() => setActiveTab('secrets')}><Key size={16} /> Secrets</a>
          </nav>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Storage</div>
          <nav className="nav-menu">
            <a className={`nav-item ${activeTab === 'persistentvolumes' ? 'active' : ''}`} onClick={() => setActiveTab('persistentvolumes')}><Database size={16} /> PVs</a>
            <a className={`nav-item ${activeTab === 'persistentvolumeclaims' ? 'active' : ''}`} onClick={() => setActiveTab('persistentvolumeclaims')}><Database size={16} /> PVCs</a>
          </nav>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Apps</div>
          <nav className="nav-menu">
            <a className={`nav-item ${activeTab === 'helm' ? 'active' : ''}`} onClick={() => setActiveTab('helm')}><Package size={16} /> Helm Releases</a>
            <a className={`nav-item ${activeTab === 'zarf' ? 'active' : ''}`} onClick={() => setActiveTab('zarf')}><Package size={16} /> Zarf Packages</a>
          </nav>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Custom Resources</div>
          <nav className="nav-menu">
            <a className={`nav-item ${activeTab === 'crds' ? 'active' : ''}`} onClick={() => setActiveTab('crds')}><Code size={16} /> CRD Explorer</a>
            <a className={`nav-item ${activeTab === 'custom' && customCrd?.name === 'helmcharts.helm.cattle.io' ? 'active' : ''}`} onClick={() => { setCustomCrd({ group: 'helm.cattle.io', version: 'v1', plural: 'helmcharts', name: 'helmcharts.helm.cattle.io' }); setActiveTab('custom'); }}><Code size={16} /> K3s HelmCharts</a>
            <a className={`nav-item ${activeTab === 'custom' && customCrd?.name === 'helmchartconfigs.helm.cattle.io' ? 'active' : ''}`} onClick={() => { setCustomCrd({ group: 'helm.cattle.io', version: 'v1', plural: 'helmchartconfigs', name: 'helmchartconfigs.helm.cattle.io' }); setActiveTab('custom'); }}><Code size={16} /> K3s ChartConfigs</a>
          </nav>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="topbar">
          <div className="search-box">
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Search resources..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button 
              onClick={() => setIsCmdPaletteOpen(true)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-muted)',
                padding: '2px 6px',
                fontSize: '0.7rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                marginLeft: '8px'
              }}
              title="Open Command Palette (Ctrl+K)"
            >
              <Command size={10} /> K
            </button>
          </div>
          <div className="controls-bar">
            {activeTab !== 'nodes' && activeTab !== 'persistentvolumes' && (
              <select className="select-ns" value={selectedNs} onChange={e => setSelectedNs(e.target.value)}>
                {namespaces.map(ns => <option key={ns} value={ns}>{ns === 'all' ? 'All Namespaces' : ns}</option>)}
              </select>
            )}
            <button 
              className="btn btn-icon" 
              onClick={activeTab === 'topology' ? fetchTopologyData : fetchResources} 
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        <div className="content-area">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon"><Server size={24}/></div>
              <div className="stat-info">
                <span className="stat-value">{stats.nodes}</span>
                <span className="stat-label">Total Nodes</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><Box size={24}/></div>
              <div className="stat-info">
                <span className="stat-value">{stats.pods}</span>
                <span className="stat-label">Active Pods</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon"><Layers size={24}/></div>
              <div className="stat-info">
                <span className="stat-value">{stats.deployments}</span>
                <span className="stat-label">Deployments</span>
              </div>
            </div>
            {nodeMetrics.length > 0 && (() => {
              let totalCpuUse = 0;
              let totalCpuCap = 0;
              let totalMemUse = 0;
              let totalMemCap = 0;
              
              nodeMetrics.forEach(nm => {
                const { cpu, memory } = getNodeCapacity(nm.metadata.name);
                totalCpuCap += cpu;
                totalMemCap += memory;
                totalCpuUse += parseCpu(nm.usage?.cpu || '0');
                totalMemUse += parseMem(nm.usage?.memory || '0');
              });
              
              const cpuPercent = totalCpuCap > 0 ? Math.min(100, Math.round((totalCpuUse / totalCpuCap) * 100)) : 0;
              const memPercent = totalMemCap > 0 ? Math.min(100, Math.round((totalMemUse / totalMemCap) * 100)) : 0;
              
              return (
                <>
                  <div className="stat-card animate-fade-in">
                    <div className="stat-icon" style={{ background: 'rgba(0, 240, 255, 0.1)', color: 'var(--accent-cyan)' }}><Activity size={24}/></div>
                    <div className="stat-info" style={{ flex: 1 }}>
                      <span className="stat-value">{cpuPercent}%</span>
                      <span className="stat-label">Cluster CPU</span>
                      <div className="metric-bar-wrapper" style={{ marginTop: 4 }}>
                        <div className={`metric-bar-fill ${cpuPercent > 80 ? 'critical' : cpuPercent > 60 ? 'warning' : 'normal'}`} style={{ width: `${cpuPercent}%` }}></div>
                      </div>
                    </div>
                  </div>
                  <div className="stat-card animate-fade-in">
                    <div className="stat-icon" style={{ background: 'rgba(248, 30, 229, 0.1)', color: 'var(--accent-purple)' }}><SlidersHorizontal size={24}/></div>
                    <div className="stat-info" style={{ flex: 1 }}>
                      <span className="stat-value">{memPercent}%</span>
                      <span className="stat-label">Cluster RAM</span>
                      <div className="metric-bar-wrapper" style={{ marginTop: 4 }}>
                        <div className={`metric-bar-fill ${memPercent > 80 ? 'critical' : memPercent > 60 ? 'warning' : 'normal'}`} style={{ width: `${memPercent}%` }}></div>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="header animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 className="title">
                {activeTab === 'helm' 
                  ? 'Helm Releases' 
                  : activeTab === 'zarf' 
                  ? 'Zarf Packages' 
                  : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </h1>
              <div className="subtitle">
                {activeTab === 'topology' 
                  ? `Visualizing cluster relationships in ${selectedNs}` 
                  : activeTab === 'zarf'
                  ? 'Manage and deploy offline packages in your cluster'
                  : `Managing ${filteredResources.length} resources in ${activeTab !== 'nodes' ? selectedNs : 'cluster'}`}
              </div>
            </div>
            {activeTab === 'topology' && (
              <div className="topology-toggle-group" style={{ display: 'flex', gap: 0 }}>
                <button 
                  type="button"
                  className={`btn ${topologyMode === 'columns' ? 'btn-primary' : ''}`}
                  onClick={() => setTopologyMode('columns')}
                  style={{ borderRadius: '4px 0 0 4px', borderRight: 'none' }}
                >
                  Columns View
                </button>
                <button 
                  type="button"
                  className={`btn ${topologyMode === 'graph' ? 'btn-primary' : ''}`}
                  onClick={() => setTopologyMode('graph')}
                  style={{ borderRadius: '0 4px 4px 0' }}
                >
                  Interactive Graph
                </button>
              </div>
            )}
            {activeTab === 'helm' && (
              <button className="btn btn-primary" onClick={() => setIsDeployHelmModalOpen(true)}>
                <Package size={16} /> Deploy Chart
              </button>
            )}
            {activeTab === 'zarf' && zarfStatus.installed && (
              <button className="btn btn-primary" onClick={() => setIsDeployZarfModalOpen(true)}>
                <Package size={16} /> Deploy Zarf Package
              </button>
            )}
          </div>

          {loading ? (
            <div className="loader-container"><div className="loader"></div></div>
          ) : activeTab === 'topology' ? (
            renderTopologyView()
          ) : activeTab === 'zarf' ? (
            renderZarfView()
          ) : activeTab === 'dashboard' ? (
            renderDashboardView()
          ) : (
            <div className="resource-list">
              {filteredResources.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>No resources found.</div>
              ) : (
                filteredResources.filter((res: any) => res && res.metadata).map((res: any, i) => (
                  <div key={res.metadata.uid || res.metadata.name} className="resource-row animate-fade-in" style={{ animationDelay: `${i * 0.02}s` }}>
                    <div className="row-main">
                      <div className="row-title">
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
                          <div>{res.metadata.name}</div>
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
                                title="Click to filter by this label"
                              >
                                {key}={String(val)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {renderStatusBadge(res)}
                      <div className="row-meta">
                        {activeTab === 'pods' && res.status?.podIP && <span>IP: {res.status.podIP}</span>}
                        {activeTab === 'pods' && (() => {
                          const metric = podMetrics.find(pm => pm.metadata.name === res.metadata.name && pm.metadata.namespace === res.metadata.namespace);
                          if (!metric) return null;
                          let cpuUsage = 0;
                          let memUsage = 0;
                          metric.containers?.forEach((c: any) => {
                            cpuUsage += parseCpu(c.usage?.cpu || '0');
                            memUsage += parseMem(c.usage?.memory || '0');
                          });
                          return (
                            <span style={{ color: 'var(--accent-cyan)' }}>
                              CPU: {cpuUsage < 1 ? (cpuUsage * 1000).toFixed(0) + 'm' : cpuUsage.toFixed(1) + 'c'} | RAM: {(memUsage / (1024 * 1024)).toFixed(0)}MB
                            </span>
                          );
                        })()}
                        {activeTab === 'nodes' && <span>OS: {res.status?.nodeInfo?.operatingSystem}</span>}
                        {activeTab === 'nodes' && (() => {
                          const metric = nodeMetrics.find(nm => nm.metadata.name === res.metadata.name);
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
                        {activeTab === 'persistentvolumes' && (
                          <span>Cap: {res.spec?.capacity?.storage || 'N/A'} | Reclaim: {res.spec?.persistentVolumeReclaimPolicy || 'N/A'}</span>
                        )}
                        {activeTab === 'persistentvolumeclaims' && (
                          <span>Vol: {res.spec?.volumeName || 'None'} | Cap: {res.status?.capacity?.storage || res.spec?.resources?.requests?.storage || 'N/A'}</span>
                        )}
                        {activeTab === 'helm' && (
                          <span>Chart: {res.chart} | Rev: {res.revision}</span>
                        )}
                        {activeTab === 'crds' && (
                          <span>Group: {res.spec?.group} | Scope: {res.spec?.scope}</span>
                        )}
                        {activeTab === 'custom' && customCrd && (
                          <span>Kind: {res.kind} | API: {customCrd.group}/{customCrd.version}</span>
                        )}
                        {activeTab === 'events' && (
                          <span style={{ color: res.type === 'Warning' ? 'var(--accent-warning)' : 'var(--text-muted)' }}>Type: {res.type}</span>
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
                      {activeTab === 'deployments' && (
                        <>
                          <button className="btn" onClick={() => handleRestart(res.metadata.name, res.metadata.namespace)}>
                            <Power size={14} /> Restart
                          </button>
                          <button className="btn" onClick={() => handleScale(res.metadata.name, res.metadata.namespace, res.spec?.replicas || 0)}>
                            <SlidersHorizontal size={14} /> Scale
                          </button>
                        </>
                      )}
                      
                      {activeTab === 'crds' && (
                        <button 
                          className="btn btn-primary" 
                          onClick={() => {
                            setCustomCrd({
                              group: res.spec.group,
                              version: res.spec.versions.find((v: any) => v.served)?.name || res.spec.versions[0].name,
                              plural: res.spec.names.plural,
                              name: res.metadata.name
                            });
                            setActiveTab('custom');
                          }}
                        >
                          <Search size={14} /> View Instances
                        </button>
                      )}

                      {activeTab === 'events' && res.involvedObject && (
                        <button 
                          className="btn" 
                          onClick={() => setModal({ 
                            type: 'yaml', 
                            name: res.involvedObject.name, 
                            namespace: res.involvedObject.namespace || 'default', 
                            kind: pluralizeKind(res.involvedObject.kind), 
                            uid: res.involvedObject.uid 
                          })}
                        >
                          <Search size={14} /> View Resource
                        </button>
                      )}

                      {activeTab !== 'nodes' && activeTab !== 'crds' && activeTab !== 'events' && (
                        <button className="btn" onClick={() => setModal({ type: 'events', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid })}>
                          <Info size={14} /> Describe
                        </button>
                      )}

                      {activeTab === 'pods' && (
                        <button className="btn" onClick={() => setModal({ type: 'logs', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid })}>
                          <Terminal size={14} /> Logs
                        </button>
                      )}
                      
                      {activeTab !== 'nodes' && activeTab !== 'crds' && activeTab !== 'events' && (
                        <button className="btn" onClick={() => setModal({ type: 'yaml', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid })}>
                          <Settings size={14} /> YAML
                        </button>
                      )}
                      
                      {activeTab !== 'nodes' && activeTab !== 'crds' && activeTab !== 'events' && (
                        <button className="btn btn-danger" onClick={() => handleDelete(res)}>
                          <Trash2 size={14} /> Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                {modal.name}
              </div>
              <button className="btn btn-icon" onClick={() => setModal(null)}><X size={16}/></button>
            </div>
            
            <div className="modal-tabs">
              {((modal.kind === 'helm' ? ['yaml', 'events', 'history'] : ['yaml', 'events']) as ModalType[])
                .concat(modal.kind === 'pods' ? ['logs', 'terminal', 'portforward'] : [])
                .map(t => (
                  <div 
                    key={t}
                    className={`modal-tab ${modal.type === t ? 'active' : ''}`}
                    onClick={() => setModal({ ...modal, type: t })}
                  >
                    {t === 'yaml' && <Settings size={14}/>}
                    {t === 'events' && <Info size={14}/>}
                    {t === 'logs' && <FileText size={14}/>}
                    {t === 'terminal' && <Terminal size={14}/>}
                    {t === 'portforward' && <Radio size={14}/>}
                    {t === 'history' && <Activity size={14}/>}
                    {t === 'terminal' ? 'Console' : t === 'portforward' ? 'Port Forward' : t === 'events' && modal.kind === 'helm' ? 'Status' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </div>
                ))}
            </div>
 
            <div className="modal-body">
              {modalData === null ? (
                <div className="loader-container"><div className="loader"></div></div>
              ) : modal.type === 'yaml' ? (
                typeof modalData !== 'string' ? (
                  <div className="loader-container"><div className="loader"></div></div>
                ) : (
                  <div className="editor-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 0 10px 0', borderBottom: '1px solid #222', marginBottom: 10, gap: 8 }}>
                      <button className="btn" onClick={copyToClipboard} title="Copy YAML to clipboard"><Copy size={14}/> Copy</button>
                      <button className="btn" onClick={downloadYaml} title="Download Spec"><Save size={14}/> Download</button>
                      {modal.kind !== 'helm' && (
                        <>
                          <button className={`btn ${!isEditingYaml ? 'btn-primary' : ''}`} onClick={() => setIsEditingYaml(false)}>Preview</button>
                          <button className={`btn ${isEditingYaml ? 'btn-primary' : ''}`} onClick={() => setIsEditingYaml(true)}>Edit</button>
                        </>
                      )}
                    </div>
                    {!isEditingYaml ? (
                      <pre 
                        className="editor-textarea" 
                        style={{ overflowY: 'auto', userSelect: 'text', whiteSpace: 'pre-wrap' }}
                        dangerouslySetInnerHTML={{ __html: highlightYaml(yamlEdit) }}
                      />
                    ) : (
                      <textarea 
                        className="editor-textarea" 
                        value={yamlEdit} 
                        onChange={e => setYamlEdit(e.target.value)}
                        spellCheck={false}
                      />
                    )}
                  </div>
                )
              ) : modal.type === 'logs' ? (
                typeof modalData !== 'string' ? (
                  <div className="loader-container"><div className="loader"></div></div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                    <div className="log-controls">
                      <div className="log-search">
                        <Search size={14}/>
                        <input 
                          type="text" 
                          placeholder="Filter logs..." 
                          value={logSearch} 
                          onChange={e => setLogSearch(e.target.value)}
                        />
                      </div>
                      {getPodContainers().length > 1 && (
                        <select 
                          className="select-ns" 
                          style={{ fontSize: '0.8rem', padding: '4px 8px', height: 'auto', background: 'var(--bg-main)' }}
                          value={selectedContainer} 
                          onChange={e => setSelectedContainer(e.target.value)}
                        >
                          {getPodContainers().map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      )}
                      <button 
                        className={`btn ${isStreamingLogs ? 'btn-primary' : ''}`} 
                        onClick={() => setIsStreamingLogs(!isStreamingLogs)}
                        title="Follow logs in real time"
                      >
                        {isStreamingLogs ? 'Stop Follow' : 'Follow'}
                      </button>
                      <button className="btn" onClick={scrollToBottomLogs} title="Scroll to bottom"><ArrowDown size={14}/> Bottom</button>
                      <button className="btn" onClick={downloadLogs} title="Download Logs"><Save size={14}/> Download</button>
                      <button className="btn" onClick={() => fetchModalData('logs')}>
                        <RefreshCw size={14}/> Refresh
                      </button>
                    </div>
                    <div className="terminal-container" style={{ flex: 1, overflowY: 'auto' }}>
                      {colorizeLogs(modalData, logSearch)}
                    </div>
                  </div>
                )
              ) : modal.type === 'terminal' ? (
                <div className="exec-terminal">
                  <div className="exec-output">
                    <div style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #222', paddingBottom: 10, marginBottom: 10 }}>
                      <div>
                        # Inline Command Executor inside container '{selectedContainer || modal.name}'
                      </div>
                      {getPodContainers().length > 1 && (
                        <select 
                          className="select-ns" 
                          style={{ fontSize: '0.8rem', padding: '4px 8px', height: 'auto', background: 'var(--bg-main)' }}
                          value={selectedContainer} 
                          onChange={e => setSelectedContainer(e.target.value)}
                        >
                          {getPodContainers().map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      )}
                    </div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: 10 }}>
                      # Type commands below (e.g. ls, env, df -h, uname -a)
                    </div>
                    {cmdHistory.map((h, idx) => (
                      <div key={idx}>
                        <div><span className="exec-prompt">$</span> {h.cmd}</div>
                        <div style={{ color: h.error ? '#f85149' : '#ededed', paddingLeft: 12, marginTop: 4, marginBottom: 12 }}>{h.output}</div>
                      </div>
                    ))}
                    {cmdLoading && <div className="loader" style={{ width: 12, height: 12 }}></div>}
                  </div>
                  <form onSubmit={runCommand} className="exec-input-line">
                    <span className="exec-prompt">$</span>
                    <input 
                      type="text" 
                      className="exec-input" 
                      placeholder="Type a command and press Enter..." 
                      value={cmdInput} 
                      onChange={e => setCmdInput(e.target.value)}
                      disabled={cmdLoading}
                      autoFocus
                    />
                  </form>
                </div>
              ) : modal.type === 'events' ? (
                modal.kind === 'helm' ? (
                  typeof modalData !== 'string' ? (
                    <div className="loader-container"><div className="loader"></div></div>
                  ) : (
                    <pre className="editor-textarea" style={{ overflowY: 'auto', userSelect: 'text', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                      {modalData}
                    </pre>
                  )
                ) : (
                  !Array.isArray(modalData) ? (
                    <div className="loader-container"><div className="loader"></div></div>
                  ) : (
                    <div className="events-container">
                      {modalData.length === 0 ? (
                        <div style={{ color: 'var(--text-muted)' }}>No events found for this resource.</div>
                      ) : (
                        modalData.map((ev: any) => (
                          <div key={ev.metadata.uid} className="event-row">
                            <div className="event-meta">
                              <span className={`event-type ${ev.type}`}>{ev.type}</span>
                              <span>{ev.reason}</span>
                              <span>{new Date(ev.lastTimestamp).toLocaleString()}</span>
                            </div>
                            <div className="event-message">{ev.message}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )
                )
              ) : modal.type === 'history' ? (
                !Array.isArray(modalData) ? (
                  <div className="loader-container"><div className="loader"></div></div>
                ) : (
                  <div className="history-container" style={{ overflowY: 'auto', maxHeight: '400px' }}>
                    {modalData.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)' }}>No history found for this release.</div>
                    ) : (
                      <table className="crd-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                            <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Revision</th>
                            <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Updated</th>
                            <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Status</th>
                            <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Chart</th>
                            <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Description</th>
                            <th style={{ padding: '8px 12px', color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {modalData.map((rev: any) => (
                            <tr key={rev.revision} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600 }}>#{rev.revision}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{rev.updated}</td>
                              <td style={{ padding: '8px 12px' }}>
                                <span className={`badge ${rev.status === 'deployed' ? 'badge-running' : 'badge-failed'}`} style={{ textTransform: 'capitalize' }}>
                                  {rev.status}
                                </span>
                              </td>
                              <td style={{ padding: '8px 12px', fontSize: '0.8rem' }}>{rev.chart}</td>
                              <td style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{rev.description}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                <button 
                                  className="btn btn-primary" 
                                  style={{ padding: '2px 8px', fontSize: '0.75rem', display: 'inline-flex' }}
                                  onClick={() => handleRollback(modal.namespace, modal.name, rev.revision)}
                                >
                                  Rollback
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
              ) : modal.type === 'portforward' ? (
                !Array.isArray(modalData) ? (
                  <div className="loader-container"><div className="loader"></div></div>
                ) : (
                  <div className="portforward-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <form 
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const remote = (e.currentTarget.elements.namedItem('remotePort') as HTMLInputElement).value;
                        const local = (e.currentTarget.elements.namedItem('localPort') as HTMLInputElement).value;
                        if (!remote) return alert('Remote port is required');
                        try {
                          const res = await fetch('/api/portforward', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              namespace: modal.namespace,
                              podName: modal.name,
                              remotePort: Number(remote),
                              localPort: local ? Number(local) : undefined
                            })
                          });
                          const data = await res.json();
                          if (data.success) {
                            fetchModalData('portforward');
                            (e.currentTarget.elements.namedItem('remotePort') as HTMLInputElement).value = '';
                            (e.currentTarget.elements.namedItem('localPort') as HTMLInputElement).value = '';
                          } else {
                            alert('Failed to start port forward: ' + data.error);
                          }
                        } catch (err: any) {
                          alert('Error: ' + err.message);
                        }
                      }}
                      style={{
                        display: 'flex', 
                        gap: 12, 
                        alignItems: 'flex-end', 
                        padding: 16, 
                        background: 'rgba(255,255,255,0.02)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: 8 
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Remote Pod Port</label>
                        <input 
                          name="remotePort" 
                          type="number" 
                          placeholder="e.g. 80" 
                          className="exec-input" 
                          style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '6px 10px' }} 
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                        <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Local Port (Optional)</label>
                        <input 
                          name="localPort" 
                          type="number" 
                          placeholder="e.g. 8080 (auto if empty)" 
                          className="exec-input" 
                          style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '6px 10px' }} 
                        />
                      </div>
                      <button type="submit" className="btn btn-primary" style={{ height: 38 }}>
                        Forward Port
                      </button>
                    </form>

                    <div>
                      <h3 style={{ fontSize: '0.9rem', marginBottom: 10, color: 'var(--text-muted)' }}>Active Port Forwards</h3>
                      {modalData.filter((pf: any) => pf.podName === modal.name && pf.namespace === modal.namespace).length === 0 ? (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '10px 0' }}>No active port forwards for this pod.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {modalData
                            .filter((pf: any) => pf.podName === modal.name && pf.namespace === modal.namespace)
                            .map((pf: any) => (
                              <div 
                                key={pf.id} 
                                style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center', 
                                  padding: '10px 14px', 
                                  background: 'rgba(0, 240, 255, 0.03)', 
                                  border: '1px solid rgba(0, 240, 255, 0.15)', 
                                  borderRadius: 6 
                                }}
                              >
                                <div style={{ fontSize: '0.85rem' }}>
                                  <span style={{ color: 'var(--accent-cyan)' }}>127.0.0.1:{pf.localPort}</span>
                                  <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>&rarr;</span>
                                  <span>Pod:{pf.remotePort}</span>
                                </div>
                                <button 
                                  className="btn btn-danger" 
                                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  onClick={async () => {
                                    if (!window.confirm('Stop port forwarding?')) return;
                                    try {
                                      const res = await fetch('/api/portforward', {
                                        method: 'DELETE',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ id: pf.id })
                                      });
                                      if (res.ok) {
                                        fetchModalData('portforward');
                                      } else {
                                        const err = await res.json();
                                        alert('Error stopping forward: ' + err.error);
                                      }
                                    } catch (err: any) {
                                      alert('Error: ' + err.message);
                                    }
                                  }}
                                >
                                  Stop
                                </button>
                              </div>
                            ))
                          }
                        </div>
                      )}
                    </div>
                  </div>
                )
              ) : null}
            </div>
            
            {modal.type === 'yaml' && isEditingYaml && (
              <div className="modal-footer">
                <button className="btn" onClick={() => { setIsEditingYaml(false); setYamlEdit(modalData); }}>Cancel</button>
                <button className="btn btn-primary" onClick={saveYaml}><Save size={16}/> Save Changes</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Command Palette Modal */}
      {isCmdPaletteOpen && (
        <div 
          className="modal-overlay" 
          onClick={() => setIsCmdPaletteOpen(false)}
          style={{ zIndex: 1000 }}
        >
          <div 
            className="modal-content animate-fade-in" 
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: 550,
              height: 'auto',
              maxHeight: '400px',
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(10, 10, 10, 0.85)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.8), 0 0 20px rgba(57, 255, 20, 0.1)'
            }}
          >
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                padding: '12px 16px'
              }}
            >
              <Search size={18} style={{ color: 'var(--accent-green)' }} />
              <input
                type="text"
                placeholder="Search views, namespaces, custom resources..."
                value={cmdPaletteSearch}
                onChange={e => setCmdPaletteSearch(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-main)',
                  width: '100%',
                  fontSize: '1rem',
                  fontFamily: 'var(--font-sans)'
                }}
                autoFocus
              />
              <button 
                className="btn btn-icon" 
                style={{ padding: 4 }}
                onClick={() => setIsCmdPaletteOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div 
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                gap: 16
              }}
            >
              {(() => {
                const items = [
                  // Views
                  { name: 'Topology Map', category: 'Views', action: () => { setActiveTab('topology'); setIsCmdPaletteOpen(false); } },
                  { name: 'Node Status', category: 'Views', action: () => { setActiveTab('nodes'); setIsCmdPaletteOpen(false); } },
                  { name: 'Cluster Events Feed', category: 'Views', action: () => { setActiveTab('events'); setIsCmdPaletteOpen(false); } },
                  { name: 'Pods List', category: 'Views', action: () => { setActiveTab('pods'); setIsCmdPaletteOpen(false); } },
                  { name: 'Deployments Scale & Restart', category: 'Views', action: () => { setActiveTab('deployments'); setIsCmdPaletteOpen(false); } },
                  { name: 'Services Network', category: 'Views', action: () => { setActiveTab('services'); setIsCmdPaletteOpen(false); } },
                  { name: 'Ingresses SSL Routing', category: 'Views', action: () => { setActiveTab('ingresses'); setIsCmdPaletteOpen(false); } },
                  { name: 'Jobs Batch run', category: 'Views', action: () => { setActiveTab('jobs'); setIsCmdPaletteOpen(false); } },
                  { name: 'CronJobs Schedule list', category: 'Views', action: () => { setActiveTab('cronjobs'); setIsCmdPaletteOpen(false); } },
                  { name: 'ConfigMaps key-values', category: 'Views', action: () => { setActiveTab('configmaps'); setIsCmdPaletteOpen(false); } },
                  { name: 'Secrets encrypted items', category: 'Views', action: () => { setActiveTab('secrets'); setIsCmdPaletteOpen(false); } },
                  { name: 'Persistent Volumes (PVs)', category: 'Views', action: () => { setActiveTab('persistentvolumes'); setIsCmdPaletteOpen(false); } },
                  { name: 'Persistent Volume Claims (PVCs)', category: 'Views', action: () => { setActiveTab('persistentvolumeclaims'); setIsCmdPaletteOpen(false); } },
                  { name: 'Helm Chart Releases', category: 'Views', action: () => { setActiveTab('helm'); setIsCmdPaletteOpen(false); } },
                  { name: 'CRD Explorer (Custom Objects)', category: 'Views', action: () => { setActiveTab('crds'); setIsCmdPaletteOpen(false); } },
                  { name: 'K3s HelmCharts addon', category: 'Views', action: () => { setCustomCrd({ group: 'helm.cattle.io', version: 'v1', plural: 'helmcharts', name: 'helmcharts.helm.cattle.io' }); setActiveTab('custom'); setIsCmdPaletteOpen(false); } },
                  { name: 'K3s HelmChartConfigs spec overrides', category: 'Views', action: () => { setCustomCrd({ group: 'helm.cattle.io', version: 'v1', plural: 'helmchartconfigs', name: 'helmchartconfigs.helm.cattle.io' }); setActiveTab('custom'); setIsCmdPaletteOpen(false); } },
                  
                  // Namespaces
                  ...namespaces.map(ns => ({
                    name: `Switch Namespace: ${ns === 'all' ? 'All Namespaces' : ns}`,
                    category: 'Namespaces',
                    action: () => { setSelectedNs(ns); setIsCmdPaletteOpen(false); }
                  })),

                  // Actions
                  { name: 'Refresh Active Tab View', category: 'Commands', action: () => { fetchResources(); setIsCmdPaletteOpen(false); } },
                  { name: 'Clear Active Search Filter', category: 'Commands', action: () => { setSearch(''); setIsCmdPaletteOpen(false); } }
                ];

                const filtered = items.filter(item => 
                  item.name.toLowerCase().includes(cmdPaletteSearch.toLowerCase()) ||
                  item.category.toLowerCase().includes(cmdPaletteSearch.toLowerCase())
                );

                if (filtered.length === 0) {
                  return <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>No matches found.</div>;
                }

                // Group by category
                const groups: { [key: string]: typeof items } = {};
                filtered.forEach(item => {
                  if (!groups[item.category]) groups[item.category] = [];
                  groups[item.category].push(item);
                });

                return Object.entries(groups).map(([cat, catItems]) => (
                  <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--accent-green)', fontWeight: 600, letterSpacing: '0.5px' }}>{cat}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {catItems.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={item.action}
                          style={{
                            padding: '8px 12px',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.04)',
                            borderRadius: '4px',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(57, 255, 20, 0.05)';
                            e.currentTarget.style.borderColor = 'rgba(57, 255, 20, 0.2)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
                          }}
                        >
                          <span>{item.name}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4 }}>Select</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
            
            <div 
              style={{
                borderTop: '1px solid rgba(255,255,255,0.08)',
                padding: '10px 16px',
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
                display: 'flex',
                justifyContent: 'space-between'
              }}
            >
              <span>Use typing to filter results</span>
              <span>ESC to close</span>
            </div>
          </div>
        </div>
      )}

      {/* Deploy Zarf Package Modal */}
      {isDeployZarfModalOpen && (
        <div className="modal-overlay" onClick={() => setIsDeployZarfModalOpen(false)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <div className="modal-title">Deploy Zarf Package</div>
              <button className="btn btn-icon" onClick={() => setIsDeployZarfModalOpen(false)}><X size={16}/></button>
            </div>
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                if (!zarfDeployForm.packagePath) return alert('Package Path is required');
                setIsSubmittingZarfDeploy(true);
                try {
                  const res = await fetch('/api/zarf/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ packagePath: zarfDeployForm.packagePath })
                  });
                  const data = await res.json();
                  if (res.ok) {
                    alert('Zarf package deployed successfully');
                    setIsDeployZarfModalOpen(false);
                    setZarfDeployForm({ packagePath: '' });
                    fetchResources();
                  } else {
                    alert('Failed to deploy package: ' + (data.error || 'Unknown error'));
                  }
                } catch (err: any) {
                  alert('Error: ' + err.message);
                } finally {
                  setIsSubmittingZarfDeploy(false);
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 0' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Local Zarf Package Path / OCI Reference</label>
                <input 
                  type="text"
                  placeholder="e.g. zarf-package-periscope-amd64-1.0.0.tar.zst"
                  className="exec-input"
                  style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '8px 12px' }}
                  value={zarfDeployForm.packagePath}
                  onChange={e => setZarfDeployForm({ packagePath: e.target.value })}
                  disabled={isSubmittingZarfDeploy}
                  required
                />
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Provide the absolute path to the Zarf package tarball on the host filesystem or an OCI package reference.
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                <button type="button" className="btn" onClick={() => setIsDeployZarfModalOpen(false)} disabled={isSubmittingZarfDeploy}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmittingZarfDeploy}>
                  {isSubmittingZarfDeploy ? 'Deploying...' : 'Deploy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deploy Helm Chart Modal */}
      {isDeployHelmModalOpen && (
        <div className="modal-overlay" onClick={() => setIsDeployHelmModalOpen(false)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <div className="modal-title">Deploy Helm Chart</div>
              <button className="btn btn-icon" onClick={() => setIsDeployHelmModalOpen(false)}><X size={16}/></button>
            </div>
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                const { releaseName, namespace, chartName, valuesYaml } = helmDeployForm;
                if (!releaseName || !namespace || !chartName) return alert('Release Name, Namespace, and Chart Name/Path are required');
                setIsSubmittingHelmDeploy(true);
                try {
                  const res = await fetch('/api/helm/deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ releaseName, namespace, chartName, valuesYaml })
                  });
                  const data = await res.json();
                  if (res.ok) {
                    alert('Helm chart deployed successfully');
                    setIsDeployHelmModalOpen(false);
                    setHelmDeployForm({ releaseName: '', namespace: 'default', chartName: '', valuesYaml: '' });
                    fetchResources();
                  } else {
                    alert('Failed to deploy chart: ' + (data.error || 'Unknown error'));
                  }
                } catch (err: any) {
                  alert('Error: ' + err.message);
                } finally {
                  setIsSubmittingHelmDeploy(false);
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 0' }}
            >
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Release Name</label>
                  <input 
                    type="text"
                    placeholder="e.g. my-release"
                    className="exec-input"
                    style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '8px 12px' }}
                    value={helmDeployForm.releaseName}
                    onChange={e => setHelmDeployForm({ ...helmDeployForm, releaseName: e.target.value })}
                    disabled={isSubmittingHelmDeploy}
                    required
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Namespace</label>
                  <input 
                    type="text"
                    placeholder="e.g. default"
                    className="exec-input"
                    style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '8px 12px' }}
                    value={helmDeployForm.namespace}
                    onChange={e => setHelmDeployForm({ ...helmDeployForm, namespace: e.target.value })}
                    disabled={isSubmittingHelmDeploy}
                    required
                  />
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Chart Name / Local Path / Repository URL</label>
                <input 
                  type="text"
                  placeholder="e.g. bitnami/nginx or ./charts/periscope"
                  className="exec-input"
                  style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '8px 12px' }}
                  value={helmDeployForm.chartName}
                  onChange={e => setHelmDeployForm({ ...helmDeployForm, chartName: e.target.value })}
                  disabled={isSubmittingHelmDeploy}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Custom values.yaml (Optional)</label>
                <textarea 
                  placeholder="replicaCount: 2&#10;service:&#10;  type: ClusterIP"
                  className="editor-textarea"
                  style={{ minHeight: '120px', fontSize: '0.85rem', fontFamily: 'monospace', padding: '10px' }}
                  value={helmDeployForm.valuesYaml}
                  onChange={e => setHelmDeployForm({ ...helmDeployForm, valuesYaml: e.target.value })}
                  disabled={isSubmittingHelmDeploy}
                  spellCheck={false}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                <button type="button" className="btn" onClick={() => setIsDeployHelmModalOpen(false)} disabled={isSubmittingHelmDeploy}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmittingHelmDeploy}>
                  {isSubmittingHelmDeploy ? 'Deploying...' : 'Deploy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
