import { useState, useEffect, useRef } from 'react';
import { Network } from 'vis-network';
import { 
  Box, Layers, Server, Activity, Trash2, Terminal,
  FileText, Shield, Key, GitCommit, RefreshCw, X, Save, Search, Settings, Info, Power, SlidersHorizontal,
  ArrowDown, Copy, Database, Package, Radio, Command, Code, List, Globe, ExternalLink, Download, Upload,
  Bell
} from 'lucide-react';
import './index.css';

type ResourceKind = 'pods' | 'deployments' | 'services' | 'configmaps' | 'secrets' | 'ingresses' | 'jobs' | 'cronjobs' | 'nodes' | 'topology' | 'persistentvolumes' | 'persistentvolumeclaims' | 'helm' | 'helm-install' | 'helm-repos' | 'crds' | 'custom' | 'events' | 'zarf' | 'zarf-deploy' | 'zarf-registry' | 'zarf-creds' | 'zarf-sbom' | 'cluster-auditor' | 'dashboard' | 'image-scanner' | 'zarf-state';
type ModalType = 'yaml' | 'logs' | 'events' | 'terminal' | 'portforward' | 'history' | 'files' | 'values';

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
  const [contexts, setContexts] = useState<any[]>([]);
  const [currentContext, setCurrentContext] = useState<string>('');
  const [associatedPods, setAssociatedPods] = useState<any[]>([]);
  const [associatedDeployments, setAssociatedDeployments] = useState<any[]>([]);
  const [establishingPortForward, setEstablishingPortForward] = useState<string | null>(null);
  
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

  // Command Executor Ref & Zarf Registry States
  const cmdInputRef = useRef<HTMLInputElement>(null);
  const [registryPullSource, setRegistryPullSource] = useState('');
  const [registryPullTarget, setRegistryPullTarget] = useState('');
  const [registryPushTarget, setRegistryPushTarget] = useState('');
  const [isPullingRegistry, setIsPullingRegistry] = useState(false);
  const [isPushingRegistry, setIsPushingRegistry] = useState(false);


  // Custom states for CRD & Command Palette
  const [customCrd, setCustomCrd] = useState<{group: string, version: string, plural: string, name: string} | null>(null);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [cmdPaletteSearch, setCmdPaletteSearch] = useState('');
  const [activePaletteIndex, setActivePaletteIndex] = useState(0);
  
  // Advanced Diagnostics & Interactivity States
  const [selectedTopologyNode, setSelectedTopologyNode] = useState<string | null>(null);
  const [helmValuesEdit, setHelmValuesEdit] = useState<string>('');
  const [isSavingHelmValues, setIsSavingHelmValues] = useState<boolean>(false);
  const [podMetricsHistory, setPodMetricsHistory] = useState<Record<string, { cpu: number[]; mem: number[] }>>({});

  // Zarf & Helm Management States
  const [zarfStatus, setZarfStatus] = useState<{installed: boolean, version?: string}>({ installed: false });
  const [isDeployHelmModalOpen, setIsDeployHelmModalOpen] = useState(false);
  const [isDeployZarfModalOpen, setIsDeployZarfModalOpen] = useState(false);
  const [helmDeployForm, setHelmDeployForm] = useState({ releaseName: '', namespace: 'default', chartName: '', valuesYaml: '' });
  const [zarfDeployForm, setZarfDeployForm] = useState({ packagePath: '' });
  const [isSubmittingHelmDeploy, setIsSubmittingHelmDeploy] = useState(false);
  const [isSubmittingZarfDeploy, setIsSubmittingZarfDeploy] = useState(false);

  // Sidebar collapsed sections state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sidebar_collapsed');
      return saved ? JSON.parse(saved) : {
        cluster: false,
        workloads: true,
        network: true,
        config: true,
        storage: true,
        helm: true,
        zarf: true,
        custom: true
      };
    } catch (e) {
      return { cluster: false, workloads: true, network: true, config: true, storage: true, helm: true, zarf: true, custom: true };
    }
  });

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const updated = { ...prev, [section]: !prev[section] };
      localStorage.setItem('sidebar_collapsed', JSON.stringify(updated));
      return updated;
    });
  };

  // Helm expanded console states
  const [helmRepos, setHelmRepos] = useState<any[]>([]);
  const [helmSearchQuery, setHelmSearchQuery] = useState('');
  const [helmSearchResults, setHelmSearchResults] = useState<any[]>([]);
  const [isSearchingHelm, setIsSearchingHelm] = useState(false);
  const [newHelmRepo, setNewHelmRepo] = useState({ name: '', url: '' });
  const [isSubmittingHelmRepo, setIsSubmittingHelmRepo] = useState(false);
  
  // Custom deploy form states
  const [helmCustomInstall, setHelmCustomInstall] = useState({
    releaseName: '',
    repo: '',
    chartName: '',
    version: '',
    namespace: 'default',
    valuesYaml: ''
  });
  
  // Helm inspector detail states (Values, Manifest, Notes)
  const [helmInspectTab, setHelmInspectTab] = useState<'values' | 'manifest' | 'notes'>('values');
  const [helmInspectData, setHelmInspectData] = useState<string>('');
  const [isFetchingHelmInspect, setIsFetchingHelmInspect] = useState(false);

  // Zarf expanded console states
  const [zarfViewMode, setZarfViewMode] = useState<'packages' | 'local' | 'tools' | 'edit'>('packages');
  const [zarfCreds, setZarfCreds] = useState<any[]>([]);
  const [isFetchingZarfCreds, setIsFetchingZarfCreds] = useState(false);
  const [isClearingZarfCache, setIsClearingZarfCache] = useState(false);
  const [zarfLocalPackages, setZarfLocalPackages] = useState<any[]>([]);
  
  // Zarf config mutator states
  const [selectedZarfPackagePath, setSelectedZarfPackagePath] = useState<string>('');
  const [zarfUnpackTempDir, setZarfUnpackTempDir] = useState<string>('');
  const [zarfConfigText, setZarfConfigText] = useState<string>('');
  const [isUnpackingZarf, setIsUnpackingZarf] = useState(false);
  const [isSavingZarfConfig, setIsSavingZarfConfig] = useState(false);

  // File upload state
  const [zarfUploadFile, setZarfUploadFile] = useState<File | null>(null);
  const [zarfUploadProgress, setZarfUploadProgress] = useState<number>(-1);

  // Real-time task logs state
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskLogs, setTaskLogs] = useState<string>('');
  const [taskStatus, setTaskStatus] = useState<string>('idle');
  const [isTaskLogsModalOpen, setIsTaskLogsModalOpen] = useState(false);

  // Zarf Registry states
  const [zarfRegistryRepos, setZarfRegistryRepos] = useState<string[]>([]);
  const [zarfSelectedRepo, setZarfSelectedRepo] = useState<string>('');
  const [zarfSelectedRepoTags, setZarfSelectedRepoTags] = useState<string[]>([]);
  const [isFetchingRegistry, setIsFetchingRegistry] = useState(false);
  const [isFetchingTags, setIsFetchingTags] = useState(false);

  // Pod File Explorer states
  const [podFiles, setPodFiles] = useState<any[]>([]);
  const [currentDirPath, setCurrentDirPath] = useState<string>('/');
  const [isListingFiles, setIsListingFiles] = useState(false);
  const [podFileUploadProgress, setPodFileUploadProgress] = useState<number>(-1);
  const [podFileUploadName, setPodFileUploadName] = useState<string>('');

  // Helm upgrade states
  const [helmUpgradeValues, setHelmUpgradeValues] = useState<string>('');
  const [helmUpgradeChartRef, setHelmUpgradeChartRef] = useState<string>('');
  const [isUpgradingHelm, setIsUpgradingHelm] = useState(false);

  // Zarf SBOM states
  const [sbomPackageName, setSbomPackageName] = useState<string>('');
  const [sbomExtractedFiles, setSbomExtractedFiles] = useState<Array<{ name: string, url: string }>>([]);
  const [sbomSelectedFileUrl, setSbomSelectedFileUrl] = useState<string>('');
  const [isExtractingSbom, setIsExtractingSbom] = useState(false);

  // Zarf Deployed Package Inspect & Cluster Auditor & Image List States
  const [selectedZarfPackageDetail, setSelectedZarfPackageDetail] = useState<any>(null);
  const [isPackageDetailModalOpen, setIsPackageDetailModalOpen] = useState(false);
  const [isFetchingPackageDetail, setIsFetchingPackageDetail] = useState(false);
  
  const [clusterAuditResult, setClusterAuditResult] = useState<any>(null);
  const [isAuditingCluster, setIsAuditingCluster] = useState(false);
  
  const [runningImages, setRunningImages] = useState<string[]>([]);
  
  // Standalone Image Scanner States
  const [runningImagesScanResults, setRunningImagesScanResults] = useState<Record<string, { sbom: any, vulnerabilities: any, status: 'pending' | 'scanning' | 'success' | 'failed', error?: string }>>({});
  const [isScanningAllRunningImages, setIsScanningAllRunningImages] = useState(false);
  const [selectedScanFilterImage, setSelectedScanFilterImage] = useState<string>('all');
  const [imageScannerActiveTab, setImageScannerActiveTab] = useState<'vulnerabilities' | 'packages' | 'images'>('vulnerabilities');
  const [imageScanSearchQuery, setImageScanSearchQuery] = useState<string>('');
  const [imageScanSeverityFilter, setImageScanSeverityFilter] = useState<string>('all');

  // Cluster Pulse States
  const [pulseAlerts, setPulseAlerts] = useState<any[]>([]);
  const [isAlertsDrawerOpen, setIsAlertsDrawerOpen] = useState(false);
  const [toasts, setToasts] = useState<any[]>([]);
  const [hasNewAlerts, setHasNewAlerts] = useState(false);

  // Smart Pod Doctor States
  const [podDiagnostics, setPodDiagnostics] = useState<any>(null);
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState(false);
  const [isFetchingDiagnostics, setIsFetchingDiagnostics] = useState(false);

  // Helm Revision Diff States
  const [selectedRevisionValues, setSelectedRevisionValues] = useState<any>(null);
  const [activeRevisionValues, setActiveRevisionValues] = useState<any>(null);
  const [isLoadingRevisionValues, setIsLoadingRevisionValues] = useState(false);

  // Pod Inline File Editor States
  const [editingFile, setEditingFile] = useState<{ path: string; content: string; isSaving: boolean } | null>(null);
  const [isEditingFileModalOpen, setIsEditingFileModalOpen] = useState(false);

  // Zarf Global State
  const [zarfState, setZarfState] = useState<any>(null);
  const [isFetchingZarfState, setIsFetchingZarfState] = useState(false);
  const [zarfDetailActiveTab, setZarfDetailActiveTab] = useState<'overview' | 'config' | 'variables'>('overview');

  const fetchHelmRepos = () => {
    fetch('/api/helm/repos')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setHelmRepos(data);
      })
      .catch(console.error);
  };

  const handleAddHelmRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHelmRepo.name || !newHelmRepo.url) return alert('Name and URL are required');
    setIsSubmittingHelmRepo(true);
    try {
      const res = await fetch('/api/helm/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newHelmRepo)
      });
      const data = await res.json();
      if (res.ok) {
        alert('Repository added successfully');
        setNewHelmRepo({ name: '', url: '' });
        fetchHelmRepos();
      } else {
        alert('Failed to add repo: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsSubmittingHelmRepo(false);
    }
  };

  const handleRemoveHelmRepo = async (name: string) => {
    if (!window.confirm(`Are you sure you want to remove repo "${name}"?`)) return;
    try {
      const res = await fetch(`/api/helm/repos/${name}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        alert('Repository removed successfully');
        fetchHelmRepos();
      } else {
        alert('Failed to remove: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleUpdateHelmRepos = async () => {
    setIsSubmittingHelmRepo(true);
    try {
      const res = await fetch('/api/helm/repos/update', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert('Repositories updated successfully');
        fetchHelmRepos();
      } else {
        alert('Failed to update: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsSubmittingHelmRepo(false);
    }
  };

  const handleSearchHelmRepo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!helmSearchQuery.trim()) return;
    setIsSearchingHelm(true);
    fetch(`/api/helm/search?q=${encodeURIComponent(helmSearchQuery)}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setHelmSearchResults(data);
        else setHelmSearchResults([]);
      })
      .catch(err => {
        console.error(err);
        setHelmSearchResults([]);
      })
      .finally(() => setIsSearchingHelm(false));
  };

  const handleCustomHelmInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    const { releaseName, repo, chartName, namespace } = helmCustomInstall;
    if (!releaseName || !repo || !chartName || !namespace) {
      return alert('Release Name, Repo, Chart Name, and Namespace are required');
    }
    setIsSubmittingHelmDeploy(true);
    try {
      const res = await fetch('/api/helm/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(helmCustomInstall)
      });
      const data = await res.json();
      if (res.ok) {
        alert('Chart installed successfully: ' + data.output);
        setActiveTab('helm');
        fetchResources();
      } else {
        alert('Deployment failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsSubmittingHelmDeploy(false);
    }
  };

  const fetchHelmInspect = (namespace: string, releaseName: string, tabType: 'values' | 'manifest' | 'notes') => {
    setIsFetchingHelmInspect(true);
    setHelmInspectData('');
    const endpoint = `/api/helm/${namespace}/${releaseName}/${tabType}`;
    fetch(endpoint)
      .then(res => res.json())
      .then(data => {
        if (tabType === 'values') {
          const valText = data.raw || (typeof data === 'string' ? data : JSON.stringify(data, null, 2));
          setHelmInspectData(valText);
          setHelmUpgradeValues(valText);
          
          const relRes = resources.find((r: any) => r && r.metadata && r.metadata.name === releaseName && r.metadata.namespace === namespace);
          if (relRes && relRes.chart) {
            const lastDashIndex = relRes.chart.lastIndexOf('-');
            const hasVersion = lastDashIndex > 0 && /^[0-9]/.test(relRes.chart.substring(lastDashIndex + 1));
            const baseChartName = hasVersion ? relRes.chart.substring(0, lastDashIndex) : relRes.chart;
            setHelmUpgradeChartRef(baseChartName);
          } else {
            setHelmUpgradeChartRef('');
          }
        } else if (tabType === 'manifest') {
          setHelmInspectData(data.manifest || '');
        } else {
          setHelmInspectData(data.notes || '');
        }
      })
      .catch(err => {
        console.error(err);
        setHelmInspectData('Error fetching data: ' + err.message);
      })
      .finally(() => setIsFetchingHelmInspect(false));
  };

  const fetchZarfCreds = () => {
    setIsFetchingZarfCreds(true);
    fetch('/api/zarf/creds')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setZarfCreds(data);
      })
      .catch(console.error)
      .finally(() => setIsFetchingZarfCreds(false));
  };

  const fetchZarfLocalPackages = () => {
    fetch('/api/zarf/local-packages')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setZarfLocalPackages(data);
      })
      .catch(console.error);
  };

  const handleClearZarfCache = async () => {
    if (!window.confirm('Are you sure you want to clear the Zarf image and git cache?')) return;
    setIsClearingZarfCache(true);
    try {
      const res = await fetch('/api/zarf/clear-cache', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert('Cache cleared successfully: ' + data.output);
      } else {
        alert('Failed to clear cache: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsClearingZarfCache(false);
    }
  };

  const handleUnpackZarfPackage = async (path: string) => {
    setIsUnpackingZarf(true);
    setSelectedZarfPackagePath(path);
    setZarfConfigText('');
    setZarfUnpackTempDir('');
    try {
      const res = await fetch('/api/zarf/unpack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packagePath: path })
      });
      const data = await res.json();
      if (res.ok) {
        setZarfUnpackTempDir(data.tempDir);
        setZarfConfigText(data.configText);
        setZarfViewMode('edit');
      } else {
        alert('Failed to unpack package: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsUnpackingZarf(false);
    }
  };

  const handleRebuildAndDeployZarf = async () => {
    if (!zarfUnpackTempDir || !zarfConfigText) return;
    setIsSavingZarfConfig(true);
    try {
      const res = await fetch('/api/zarf/rebuild-deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempDir: zarfUnpackTempDir, configText: zarfConfigText })
      });
      const data = await res.json();
      if (res.ok) {
        setZarfViewMode('local');
        setActiveTab('zarf-deploy');
        setZarfUnpackTempDir('');
        setZarfConfigText('');
        startTaskLogsStreaming(data.taskId);
      } else {
        alert('Failed to start rebuild & deploy: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsSavingZarfConfig(false);
    }
  };

  const handleHelmUpgrade = async (releaseName: string, namespace: string) => {
    if (!helmUpgradeChartRef.trim()) {
      alert('Chart Reference is required for upgrade');
      return;
    }
    setIsUpgradingHelm(true);
    try {
      const res = await fetch('/api/helm/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releaseName,
          namespace,
          chartName: helmUpgradeChartRef,
          valuesYaml: helmUpgradeValues
        })
      });
      const data = await res.json();
      if (res.ok) {
        alert('Helm release upgraded successfully!');
        fetchResources();
        fetchHelmInspect(namespace, releaseName, 'values');
      } else {
        alert('Upgrade failed: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error upgrading Helm release: ' + err.message);
    } finally {
      setIsUpgradingHelm(false);
    }
  };

  const handleDeleteWorkspaceItem = async (name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/zarf/local-packages?name=${encodeURIComponent(name)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok) {
        alert('Workspace item deleted successfully');
        fetchZarfLocalPackages();
      } else {
        alert('Failed to delete item: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleCompressFolder = async (folderName: string) => {
    const dest = window.prompt(
      `Enter destination filename ending in .tar.zst:`, 
      `${folderName}.tar.zst`
    );
    if (!dest) return;
    if (!dest.endsWith('.tar.zst')) {
      alert('Destination filename must end in .tar.zst');
      return;
    }
    try {
      const res = await fetch('/api/zarf/archiver/compress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: folderName, dest })
      });
      const data = await res.json();
      if (res.ok && data.taskId) {
        setActiveTaskId(data.taskId);
        setIsTaskLogsModalOpen(true);
      } else {
        alert('Failed to start compression: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleDecompressPackage = async (packageName: string) => {
    const defaultFolder = packageName.replace(/\.tar\.zst$/, '').replace(/\.zst$/, '');
    const dest = window.prompt(
      `Enter destination folder name:`, 
      defaultFolder
    );
    if (!dest) return;
    try {
      const res = await fetch('/api/zarf/archiver/decompress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: packageName, dest })
      });
      const data = await res.json();
      if (res.ok && data.taskId) {
        setActiveTaskId(data.taskId);
        setIsTaskLogsModalOpen(true);
      } else {
        alert('Failed to start decompression: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleExtractSbom = async () => {
    if (!sbomPackageName) return alert('Please select a local package archive first.');
    setIsExtractingSbom(true);
    setSbomExtractedFiles([]);
    setSbomSelectedFileUrl('');
    try {
      const res = await fetch('/api/zarf/sbom/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageName: sbomPackageName })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSbomExtractedFiles(data.files || []);
        if (data.files && data.files.length > 0) {
          setSbomSelectedFileUrl(data.files[0].url);
        }
      } else {
        alert('Failed to extract SBOM: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error extracting SBOM: ' + err.message);
    } finally {
      setIsExtractingSbom(false);
    }
  };

  const getFilteredVulnerabilities = () => {
    const list: any[] = [];
    Object.keys(runningImagesScanResults).forEach(imgRef => {
      if (selectedScanFilterImage !== 'all' && selectedScanFilterImage !== imgRef) return;
      const res = runningImagesScanResults[imgRef];
      if (res && res.status === 'success' && res.vulnerabilities && res.vulnerabilities.matches) {
        res.vulnerabilities.matches.forEach((m: any) => {
          list.push({ ...m, imageRef: imgRef });
        });
      }
    });

    return list.filter((m: any) => {
      const vuln = m.vulnerability || {};
      const art = m.artifact || {};
      const severity = vuln.severity || 'Unknown';
      const imageRef = m.imageRef || '';

      if (imageScanSeverityFilter !== 'all' && severity.toLowerCase() !== imageScanSeverityFilter.toLowerCase()) {
        return false;
      }

      if (imageScanSearchQuery.trim()) {
        const q = imageScanSearchQuery.toLowerCase();
        return (
          (vuln.id || '').toLowerCase().includes(q) ||
          (severity || '').toLowerCase().includes(q) ||
          (art.name || '').toLowerCase().includes(q) ||
          (imageRef || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  };

  const getFilteredPackages = () => {
    const list: any[] = [];
    Object.keys(runningImagesScanResults).forEach(imgRef => {
      if (selectedScanFilterImage !== 'all' && selectedScanFilterImage !== imgRef) return;
      const res = runningImagesScanResults[imgRef];
      if (res && res.status === 'success' && res.sbom && res.sbom.artifacts) {
        res.sbom.artifacts.forEach((art: any) => {
          list.push({ ...art, imageRef: imgRef });
        });
      }
    });

    return list.filter((art: any) => {
      if (imageScanSearchQuery.trim()) {
        const q = imageScanSearchQuery.toLowerCase();
        const name = (art.name || '').toLowerCase();
        const ver = (art.version || '').toLowerCase();
        const type = (art.type || '').toLowerCase();
        const imageRef = (art.imageRef || '').toLowerCase();
        const licenses = Array.isArray(art.licenses)
          ? art.licenses.map((l: any) => typeof l === 'string' ? l : (l.value || '')).join(' ').toLowerCase()
          : '';
        return name.includes(q) || ver.includes(q) || type.includes(q) || licenses.includes(q) || imageRef.includes(q);
      }
      return true;
    });
  };

  const exportImageScannerVulnerabilitiesJson = () => {
    const data = getFilteredVulnerabilities();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `security-vulnerabilities-report-${selectedScanFilterImage.replace(/[:/]/g, '-')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const exportImageScannerVulnerabilitiesCsv = () => {
    const data = getFilteredVulnerabilities();
    const headers = ['Image', 'Vulnerability ID', 'Severity', 'Package', 'Installed Version', 'Fixed In'];
    const rows = data.map((m: any) => {
      const vuln = m.vulnerability || {};
      const art = m.artifact || {};
      const fixedIn = vuln.fix?.versions?.join(', ') || 'Not Fixed';
      return [
        `"${m.imageRef}"`,
        `"${vuln.id}"`,
        `"${vuln.severity}"`,
        `"${art.name}"`,
        `"${art.version}"`,
        `"${fixedIn}"`
      ];
    });
    const csvContent = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `security-vulnerabilities-report-${selectedScanFilterImage.replace(/[:/]/g, '-')}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const exportImageScannerPackagesJson = () => {
    const data = getFilteredPackages();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `security-packages-report-${selectedScanFilterImage.replace(/[:/]/g, '-')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const exportImageScannerPackagesCsv = () => {
    const data = getFilteredPackages();
    const headers = ['Image', 'Package Name', 'Version', 'Type', 'Licenses', 'Language'];
    const rows = data.map((art: any) => {
      const licenseStrs = Array.isArray(art.licenses)
        ? art.licenses.map((l: any) => typeof l === 'string' ? l : (l.value || ''))
        : [];
      return [
        `"${art.imageRef}"`,
        `"${art.name}"`,
        `"${art.version}"`,
        `"${art.type}"`,
        `"${licenseStrs.join(', ')}"`,
        `"${art.language || 'N/A'}"`
      ];
    });
    const csvContent = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `security-packages-report-${selectedScanFilterImage.replace(/[:/]/g, '-')}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const exportAuditJson = () => {
    if (!clusterAuditResult) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(clusterAuditResult, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `cluster-audit-report.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const exportAuditMarkdown = () => {
    if (!clusterAuditResult) return;
    const issues = clusterAuditResult.issues || [];
    const criticals = issues.filter((i: any) => i.severity === 'Critical');
    const errors = issues.filter((i: any) => i.severity === 'Error');
    const warnings = issues.filter((i: any) => i.severity === 'Warning');
    const infos = issues.filter((i: any) => i.severity === 'Info');

    let md = `# Periscope Cluster Configuration & Security Audit Report\n\n`;
    md += `Generated on: ${new Date().toLocaleString()}\n`;
    md += `Kubernetes Version: ${clusterAuditResult.clusterVersion || 'N/A'}\n`;
    md += `Overall Grade: **${clusterAuditResult.grade}** (Score: **${clusterAuditResult.score}**/100)\n\n`;
    md += `## Metrics Summary\n\n`;
    md += `- **Critical Violations**: ${criticals.length}\n`;
    md += `- **Configuration Errors**: ${errors.length}\n`;
    md += `- **Configuration Warnings**: ${warnings.length}\n`;
    md += `- **Optimizations**: ${infos.length}\n\n`;
    
    md += `## Detailed Findings\n\n`;
    
    if (issues.length === 0) {
      md += `*No issues found! Your cluster conforms to all rules.*\n`;
    } else {
      md += `| Severity | Category | Rule | Resource | Namespace | Message |\n`;
      md += `| --- | --- | --- | --- | --- | --- |\n`;
      issues.forEach((issue: any) => {
        md += `| ${issue.severity} | ${issue.category} | ${issue.rule} | \`${issue.resource}\` | \`${issue.namespace}\` | ${issue.message.replace(/\|/g, '\\|')} |\n`;
      });
    }
    
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `cluster-audit-report.md`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleZarfUpload = async () => {
    if (!zarfUploadFile) return alert('Please select a file to upload first.');
    setZarfUploadProgress(0);
    
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/zarf/upload', true);
      xhr.setRequestHeader('x-file-name', zarfUploadFile.name);
      
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setZarfUploadProgress(pct);
        }
      };
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          alert(`File uploaded successfully to: ${data.filepath}`);
          setZarfUploadFile(null);
          setZarfUploadProgress(-1);
          fetchZarfLocalPackages();
        } else {
          alert('Upload failed: ' + xhr.statusText);
          setZarfUploadProgress(-1);
        }
      };
      
      xhr.onerror = () => {
        alert('Upload failed due to connection error.');
        setZarfUploadProgress(-1);
      };
      
      xhr.send(zarfUploadFile);
    } catch (err: any) {
      alert('Error: ' + err.message);
      setZarfUploadProgress(-1);
    }
  };

  const handleDeployLocalPackage = async (path: string) => {
    if (!window.confirm(`Are you sure you want to deploy local package "${path.split(/[\\/]/).pop()}"?`)) return;
    try {
      const res = await fetch('/api/zarf/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packagePath: path })
      });
      const data = await res.json();
      if (res.ok) {
        startTaskLogsStreaming(data.taskId);
      } else {
        alert('Failed to deploy package: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleInspectDeployedZarfPackage = async (packageName: string) => {
    setIsFetchingPackageDetail(true);
    try {
      const res = await fetch(`/api/zarf/packages/${packageName}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedZarfPackageDetail(data);
        setIsPackageDetailModalOpen(true);
      } else {
        alert('Failed to inspect package: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error fetching package details: ' + err.message);
    } finally {
      setIsFetchingPackageDetail(false);
    }
  };

  const runClusterAudit = async () => {
    setIsAuditingCluster(true);
    try {
      const res = await fetch('/api/cluster/audit');
      const data = await res.json();
      if (res.ok) {
        setClusterAuditResult(data);
      } else {
        alert('Failed to audit cluster: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error auditing cluster: ' + err.message);
    } finally {
      setIsAuditingCluster(false);
    }
  };

  const fetchRunningImages = () => {
    fetch('/api/zarf/running-images')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setRunningImages(data);
      })
      .catch(console.error);
  };

  const fetchRunningImagesAndScan = async () => {
    setIsScanningAllRunningImages(true);
    try {
      const res = await fetch('/api/zarf/running-images');
      const data = await res.json();
      if (Array.isArray(data)) {
        setRunningImages(data);
        await startScanAllImages(data);
      }
    } catch (err) {
      console.error('Failed to fetch running images for scanner:', err);
    } finally {
      setIsScanningAllRunningImages(false);
    }
  };

  const startScanAllImages = async (imagesList: string[]) => {
    const initial: Record<string, any> = {};
    imagesList.forEach(img => {
      if (runningImagesScanResults[img]?.status === 'success') {
        initial[img] = runningImagesScanResults[img];
      } else {
        initial[img] = { sbom: null, vulnerabilities: null, status: 'scanning' };
      }
    });
    setRunningImagesScanResults(prev => ({ ...prev, ...initial }));

    imagesList.forEach(async (img) => {
      if (runningImagesScanResults[img]?.status === 'success') {
        return; // skip already scanned
      }
      try {
        const [sbomRes, vulnRes] = await Promise.all([
          fetch('/api/zarf/sbom/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageRef: img })
          }),
          fetch('/api/zarf/sbom/vulnerabilities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageRef: img })
          })
        ]);

        const sbomData = await sbomRes.json();
        const vulnData = await vulnRes.json();

        setRunningImagesScanResults(prev => ({
          ...prev,
          [img]: {
            sbom: sbomRes.ok ? sbomData : null,
            vulnerabilities: vulnRes.ok ? vulnData : null,
            status: (sbomRes.ok && vulnRes.ok) ? 'success' : 'failed',
            error: (!sbomRes.ok ? sbomData.error : '') || (!vulnRes.ok ? vulnData.error : '')
          }
        }));
      } catch (err: any) {
        setRunningImagesScanResults(prev => ({
          ...prev,
          [img]: {
            sbom: null,
            vulnerabilities: null,
            status: 'failed',
            error: err.message
          }
        }));
      }
    });
  };

  const scanSingleImage = async (img: string) => {
    setRunningImagesScanResults(prev => ({
      ...prev,
      [img]: { sbom: null, vulnerabilities: null, status: 'scanning' }
    }));
    try {
      const [sbomRes, vulnRes] = await Promise.all([
        fetch('/api/zarf/sbom/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageRef: img })
        }),
        fetch('/api/zarf/sbom/vulnerabilities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageRef: img })
        })
      ]);

      const sbomData = await sbomRes.json();
      const vulnData = await vulnRes.json();

      setRunningImagesScanResults(prev => ({
        ...prev,
        [img]: {
          sbom: sbomRes.ok ? sbomData : null,
          vulnerabilities: vulnRes.ok ? vulnData : null,
          status: (sbomRes.ok && vulnRes.ok) ? 'success' : 'failed',
          error: (!sbomRes.ok ? sbomData.error : '') || (!vulnRes.ok ? vulnData.error : '')
        }
      }));
    } catch (err: any) {
      setRunningImagesScanResults(prev => ({
        ...prev,
        [img]: {
          sbom: null,
          vulnerabilities: null,
          status: 'failed',
          error: err.message
        }
      }));
    }
  };

  const fetchZarfRegistryCatalog = () => {
    setIsFetchingRegistry(true);
    setZarfRegistryRepos([]);
    setZarfSelectedRepo('');
    setZarfSelectedRepoTags([]);
    fetch('/api/zarf/registry/catalog')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setZarfRegistryRepos(data);
      })
      .catch(console.error)
      .finally(() => setIsFetchingRegistry(false));
  };

  const fetchZarfRegistryTags = (repoName: string) => {
    setIsFetchingTags(true);
    setZarfSelectedRepo(repoName);
    setZarfSelectedRepoTags([]);
    fetch(`/api/zarf/registry/repository/${repoName}/tags`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setZarfSelectedRepoTags(data);
      })
      .catch(console.error)
      .finally(() => setIsFetchingTags(false));
  };

  const handleDeleteRegistryImage = async (repoName: string, tag: string) => {
    const imageRef = `${repoName}:${tag}`;
    if (!window.confirm(`Are you sure you want to delete image reference "${imageRef}"?`)) return;
    try {
      const res = await fetch(`/api/zarf/registry/image?imageRef=${encodeURIComponent(imageRef)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok) {
        alert('Image reference deleted successfully');
        fetchZarfRegistryTags(repoName);
      } else {
        alert('Failed to delete image: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handlePruneRegistry = async () => {
    if (!window.confirm('Are you sure you want to prune all unused images from the Zarf registry?')) return;
    try {
      const res = await fetch('/api/zarf/registry/prune', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        startTaskLogsStreaming(data.taskId);
      } else {
        alert('Failed to start registry prune: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handlePullRegistryImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registryPullSource.trim() || !registryPullTarget.trim()) {
      alert('Source and target image references are required.');
      return;
    }
    
    setIsPullingRegistry(true);
    try {
      const res = await fetch('/api/zarf/registry/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: registryPullSource, target: registryPullTarget })
      });
      const data = await res.json();
      if (res.ok && data.taskId) {
        startTaskLogsStreaming(data.taskId);
        setRegistryPullSource('');
        setRegistryPullTarget('');
      } else {
        alert('Failed to start registry pull: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsPullingRegistry(false);
    }
  };

  const handlePushRegistryImage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!registryPushTarget.trim()) {
      alert('Target image reference is required (e.g. library/nginx:alpine)');
      return;
    }
    const fileInput = document.getElementById('registry-image-file-input') as HTMLInputElement;
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      alert('Please select a Docker image tarball file to push.');
      return;
    }
    const file = fileInput.files[0];
    
    setIsPushingRegistry(true);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/zarf/registry/push', true);
    xhr.setRequestHeader('x-target-ref', registryPushTarget);
    
    xhr.onload = () => {
      setIsPushingRegistry(false);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status === 200 && data.taskId) {
          startTaskLogsStreaming(data.taskId);
          setRegistryPushTarget('');
          fileInput.value = '';
        } else {
          alert('Failed to start registry push: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Failed to parse push response');
      }
    };
    
    xhr.onerror = () => {
      setIsPushingRegistry(false);
      alert('Network error during push upload.');
    };
    
    xhr.send(file);
  };

  const fetchPodFilesList = (path: string) => {
    if (!modal) return;
    setIsListingFiles(true);
    const cleanPath = path.endsWith('/') ? path : path + '/';
    
    fetch(`/api/resource/pods/${modal.namespace}/${modal.name}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: `ls -la "${cleanPath}"`,
        container: selectedContainer
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          alert('Error listing files: ' + data.error);
          return;
        }
        
        const lines = (data.stdout || '').split('\n');
        const filesList: any[] = [];
        
        lines.forEach((line: string) => {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 9) return;
          const permissions = parts[0];
          const isDir = permissions.startsWith('d');
          const isLink = permissions.startsWith('l');
          const size = parseInt(parts[4], 10);
          const date = `${parts[5]} ${parts[6]} ${parts[7]}`;
          const name = parts.slice(8).join(' ');
          
          if (name === '.' || name === '..') return;
          
          filesList.push({
            name,
            isDir,
            isLink,
            size,
            date,
            permissions
          });
        });
        
        filesList.sort((a, b) => {
          if (a.isDir && !b.isDir) return -1;
          if (!a.isDir && b.isDir) return 1;
          return a.name.localeCompare(b.name);
        });
        
        setPodFiles(filesList);
        setCurrentDirPath(cleanPath);
      })
      .catch(err => {
        console.error(err);
        alert('Failed to query files list: ' + err.message);
      })
      .finally(() => setIsListingFiles(false));
  };

  const handleCreatePodFolder = () => {
    if (!modal) return;
    const folderName = window.prompt('Enter folder name:');
    if (!folderName || !folderName.trim()) return;
    
    setIsListingFiles(true);
    const folderPath = currentDirPath + folderName.trim();
    
    fetch(`/api/resource/pods/${modal.namespace}/${modal.name}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: `mkdir -p "${folderPath}"`,
        container: selectedContainer
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          alert('Failed to create folder: ' + data.error);
        } else {
          fetchPodFilesList(currentDirPath);
        }
      })
      .catch(err => {
        alert('Error: ' + err.message);
      })
      .finally(() => setIsListingFiles(false));
  };

  const handleDownloadPodFile = (fileName: string, isDir = false) => {
    if (!modal) return;
    const filePath = currentDirPath + fileName;
    const url = `/api/resource/pods/${modal.namespace}/${modal.name}/files/download?path=${encodeURIComponent(filePath)}&container=${selectedContainer}&isDir=${isDir}`;
    window.open(url, '_blank');
  };

  const handleDeletePodFile = async (fileName: string, isDir: boolean) => {
    if (!modal) return;
    const filePath = currentDirPath + fileName;
    if (!window.confirm(`Are you sure you want to delete ${isDir ? 'folder' : 'file'} "${fileName}"?`)) return;
    
    setIsListingFiles(true);
    try {
      const res = await fetch(`/api/resource/pods/${modal.namespace}/${modal.name}/files?path=${encodeURIComponent(filePath)}&container=${selectedContainer}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok) {
        fetchPodFilesList(currentDirPath);
      } else {
        alert('Failed to delete: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsListingFiles(false);
    }
  };

  const handleUploadPodFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!modal || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setPodFileUploadName(file.name);
    setPodFileUploadProgress(0);
    
    const xhr = new XMLHttpRequest();
    const url = `/api/resource/pods/${modal.namespace}/${modal.name}/files/upload?destDir=${encodeURIComponent(currentDirPath)}&container=${selectedContainer}`;
    
    xhr.open('POST', url, true);
    xhr.setRequestHeader('x-file-name', file.name);
    
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const pct = Math.round((event.loaded / event.total) * 100);
        setPodFileUploadProgress(pct);
      }
    };
    
    xhr.onload = () => {
      setPodFileUploadProgress(-1);
      setPodFileUploadName('');
      if (xhr.status >= 200 && xhr.status < 300) {
        fetchPodFilesList(currentDirPath);
      } else {
        alert('Upload failed: ' + xhr.statusText);
      }
    };
    
    xhr.onerror = () => {
      setPodFileUploadProgress(-1);
      setPodFileUploadName('');
      alert('Upload failed due to network error.');
    };
    
    xhr.send(file);
  };

  const startTaskLogsStreaming = (taskId: string) => {
    setActiveTaskId(taskId);
    setTaskLogs('');
    setTaskStatus('running');
    setIsTaskLogsModalOpen(true);
  };

  useEffect(() => {
    if (!activeTaskId) return;
    const interval = setInterval(() => {
      fetch(`/api/tasks/${activeTaskId}/logs`)
        .then(res => res.json())
        .then(data => {
          setTaskLogs(data.logs || '');
          setTaskStatus(data.status);
          if (data.status !== 'running') {
            clearInterval(interval);
            if (data.status === 'success') {
              fetchResources();
              if (activeTab === 'zarf-registry') {
                fetchZarfRegistryCatalog();
              }
            }
          }
        })
        .catch(console.error);
    }, 1500);
    
    return () => clearInterval(interval);
  }, [activeTaskId, activeTab]);

  useEffect(() => {
    if (modal?.type === 'terminal' && !cmdLoading) {
      const timer = setTimeout(() => {
        cmdInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [cmdLoading, modal?.type]);

  useEffect(() => {
    if (activeTab === 'helm-repos' || activeTab === 'helm-install') {
      fetchHelmRepos();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'zarf-deploy') {
      fetchZarfLocalPackages();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'zarf-registry') {
      fetchZarfRegistryCatalog();
    } else if (activeTab === 'zarf-creds') {
      fetchZarfCreds();
    } else if (activeTab === 'zarf-state') {
      fetchZarfState();
    } else if (activeTab === 'zarf-sbom') {
      fetchZarfRegistryCatalog();
      fetchZarfLocalPackages();
      fetchRunningImages();
    } else if (activeTab === 'cluster-auditor') {
      runClusterAudit();
    } else if (activeTab === 'topology') {
      if (!clusterAuditResult) {
        runClusterAudit();
      }
    } else if (activeTab === 'image-scanner') {
      fetchRunningImages();
    }
  }, [activeTab]);

  useEffect(() => {
    if (modal && modal.type === 'files') {
      fetchPodFilesList(currentDirPath || '/');
    }
  }, [modal?.type, modal?.name, modal?.namespace, selectedContainer]);

  const fetchContexts = () => {
    fetch('/api/kube/contexts')
      .then(res => res.json())
      .then(data => {
        if (data.contexts) {
          setContexts(data.contexts);
          setCurrentContext(data.currentContext);
        }
      })
      .catch(console.error);
  };

  const handleContextChange = (contextName: string) => {
    setLoading(true);
    fetch('/api/kube/contexts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: contextName })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setCurrentContext(data.currentContext);
          fetchNamespaces();
          fetchResources();
        } else {
          alert('Failed to switch context: ' + (data.error || 'Unknown error'));
          setLoading(false);
        }
      })
      .catch(err => {
        console.error(err);
        alert('Failed to switch context due to network error.');
        setLoading(false);
      });
  };

  const handleOpenServiceWebsite = (service: any) => {
    const ports = service.spec?.ports || [];
    if (ports.length === 0) {
      alert('Service has no configured ports.');
      return;
    }

    const httpPort = ports.find((p: any) => {
      const name = (p.name || '').toLowerCase();
      const portVal = p.port;
      return name.includes('http') || name.includes('web') || name.includes('html') || portVal === 80 || portVal === 8080 || portVal === 3000 || portVal === 5000 || portVal === 8000;
    }) || ports[0];

    const isHttps = httpPort.port === 443 || (httpPort.name || '').toLowerCase().includes('https');
    const protocol = isHttps ? 'https' : 'http';

    // Scenario A: NodePort Service (Local cluster scenario)
    if (service.spec?.type === 'NodePort' && httpPort.nodePort) {
      const host = window.location.hostname;
      const url = `${protocol}://${host}:${httpPort.nodePort}`;
      window.open(url, '_blank');
      return;
    }

    // Scenario B: LoadBalancer Service with External IP
    const ingresses = service.status?.loadBalancer?.ingress || [];
    if (service.spec?.type === 'LoadBalancer' && ingresses.length > 0) {
      const host = ingresses[0].ip || ingresses[0].hostname;
      if (host) {
        const url = `${protocol}://${host}:${httpPort.port}`;
        window.open(url, '_blank');
        return;
      }
    }

    // Scenario C: ClusterIP (Private) Service - fallback to Port-Forwarding
    const matchingPods = associatedPods.filter(p => matchesSelector(p.metadata?.labels, service.spec?.selector));
    const runningPod = matchingPods.find(p => p.status?.phase?.toLowerCase() === 'running');
    
    if (!runningPod) {
      alert('No running pods found matching the service selector for port-forwarding.');
      return;
    }

    let targetPort = httpPort.targetPort || httpPort.port;
    if (typeof targetPort === 'string' && isNaN(Number(targetPort))) {
      let resolved = false;
      for (const container of runningPod.spec?.containers || []) {
        for (const cp of container.ports || []) {
          if (cp.name === targetPort) {
            targetPort = cp.containerPort;
            resolved = true;
            break;
          }
        }
        if (resolved) break;
      }
      if (!resolved) {
        targetPort = httpPort.port;
      }
    }

    const portNum = Number(targetPort);
    const svcName = service.metadata.name;
    setEstablishingPortForward(svcName);
    
    fetch('/api/portforward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        namespace: service.metadata.namespace,
        podName: runningPod.metadata.name,
        remotePort: portNum
      })
    })
      .then(res => res.json())
      .then(data => {
        setEstablishingPortForward(null);
        if (data.success && data.localPort) {
          const url = `${window.location.protocol}//${window.location.host}/api/portforward/proxy/${data.localPort}/`;
          window.open(url, '_blank');
        } else {
          alert('Failed to establish port-forward: ' + (data.error || 'Unknown error'));
        }
      })
      .catch(err => {
        console.error(err);
        setEstablishingPortForward(null);
        alert('Failed to establish port-forward due to network error.');
      });
  };

  const fetchZarfStatus = () => {
    fetch('/api/zarf/status')
      .then(res => res.json())
      .then(data => {
        setZarfStatus(data);
      })
      .catch(console.error);
  };

  // Heuristic-based JSON to YAML converter
  const jsonToYaml = (val: any, depth = 0): string => {
    const indent = '  '.repeat(depth);
    if (val === null) return 'null';
    if (typeof val !== 'object') {
      if (typeof val === 'string') {
        if (val.includes('\n') || val.length > 60) {
          return `|\n${val.split('\n').map(line => indent + '  ' + line).join('\n')}`;
        }
        if (/[#:*?[\]{}|&%@`]/.test(val) || val === 'true' || val === 'false') {
          return `"${val.replace(/"/g, '\\"')}"`;
        }
        return val;
      }
      return String(val);
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return '[]';
      return val.map((item: any) => {
        const itemStr = jsonToYaml(item, depth + 1).trimStart();
        return `${indent}- ${itemStr}`;
      }).join('\n');
    }
    const keys = Object.keys(val);
    if (keys.length === 0) return '{}';
    return keys.map((key: string) => {
      const v = val[key];
      if (v === undefined) return '';
      const vStr = jsonToYaml(v, depth + 1);
      if (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length > 0) {
        return `${indent}${key}:\n${vStr}`;
      }
      if (Array.isArray(v) && v.length > 0) {
        return `${indent}${key}:\n${vStr}`;
      }
      return `${indent}${key}: ${vStr.trimStart()}`;
    }).filter(Boolean).join('\n');
  };

  const handleOpenDiagnostics = async (podName: string, namespace: string) => {
    setIsFetchingDiagnostics(true);
    setPodDiagnostics(null);
    setIsDiagnosticsModalOpen(true);
    try {
      const res = await fetch(`/api/diagnose/${namespace}/${podName}`);
      const data = await res.json();
      if (res.ok) {
        setPodDiagnostics({
          name: podName,
          namespace: namespace,
          ...data
        });
      } else {
        alert('Diagnostics failed: ' + (data.error || 'Unknown error'));
        setIsDiagnosticsModalOpen(false);
      }
    } catch (err: any) {
      alert('Error fetching diagnostics: ' + err.message);
      setIsDiagnosticsModalOpen(false);
    } finally {
      setIsFetchingDiagnostics(false);
    }
  };

  const handleInspectRevisionValues = async (namespace: string, name: string, revision: number) => {
    setIsLoadingRevisionValues(true);
    setSelectedRevisionValues(null);
    try {
      const resSelected = await fetch(`/api/helm/${namespace}/${name}/values/revision/${revision}`);
      const dataSelected = await resSelected.json();
      
      const resActive = await fetch(`/api/helm/${namespace}/${name}/values`);
      const dataActive = await resActive.json();

      setSelectedRevisionValues({
        revision,
        values: dataSelected.raw || JSON.stringify(dataSelected, null, 2)
      });
      setActiveRevisionValues(dataActive.raw || JSON.stringify(dataActive, null, 2));
    } catch (err: any) {
      alert('Error fetching revision values: ' + err.message);
    } finally {
      setIsLoadingRevisionValues(false);
    }
  };

  const handleEditPodFile = async (fileName: string) => {
    if (!modal) return;
    const fullPath = currentDirPath + fileName;
    
    setEditingFile({
      path: fullPath,
      content: '',
      isSaving: false
    });
    setIsEditingFileModalOpen(true);
    
    try {
      const containerParam = selectedContainer ? `&container=${selectedContainer}` : '';
      const res = await fetch(`/api/resource/pods/${modal.namespace}/${modal.name}/files/view?path=${encodeURIComponent(fullPath)}${containerParam}`);
      const data = await res.json();
      if (res.ok) {
        setEditingFile({
          path: fullPath,
          content: data.content || '',
          isSaving: false
        });
      } else {
        alert('Failed to read file: ' + (data.error || 'Unknown error'));
        setIsEditingFileModalOpen(false);
        setEditingFile(null);
      }
    } catch (err: any) {
      alert('Error fetching file content: ' + err.message);
      setIsEditingFileModalOpen(false);
      setEditingFile(null);
    }
  };

  const handleSavePodFile = async () => {
    if (!modal || !editingFile) return;
    
    setEditingFile(prev => prev ? { ...prev, isSaving: true } : null);
    
    try {
      const bodyPayload = {
        path: editingFile.path,
        content: editingFile.content,
        container: selectedContainer || undefined
      };
      
      const res = await fetch(`/api/resource/pods/${modal.namespace}/${modal.name}/files/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      
      const data = await res.json();
      if (res.ok) {
        alert('File saved successfully.');
        setIsEditingFileModalOpen(false);
        setEditingFile(null);
        fetchPodFilesList(currentDirPath);
      } else {
        alert('Failed to save file: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error saving file: ' + err.message);
    } finally {
      setEditingFile(prev => prev ? { ...prev, isSaving: false } : null);
    }
  };

  const fetchZarfState = () => {
    setIsFetchingZarfState(true);
    setZarfState(null);
    fetch('/api/zarf/state')
      .then(res => res.json())
      .then(data => {
        setZarfState(data);
        setIsFetchingZarfState(false);
      })
      .catch(err => {
        console.error(err);
        setIsFetchingZarfState(false);
      });
  };

  const renderZarfStateView = () => {
    if (isFetchingZarfState) {
      return <div className="loader-container"><div className="loader"></div></div>;
    }
    if (!zarfState) {
      return (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-color)', borderRadius: 8 }}>
          Zarf state is not initialized or the cluster has not been initialized with Zarf.
        </div>
      );
    }
    return (
      <div className="zarf-state-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: 16, color: 'var(--accent-cyan)' }}>Zarf Cluster Initialization State</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, fontSize: '0.9rem' }}>
            <div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 0', color: 'var(--text-muted)' }}>Kubernetes Distribution:</td>
                    <td style={{ padding: '10px 0', fontWeight: 600 }}>{zarfState.distro || 'N/A'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 0', color: 'var(--text-muted)' }}>Storage Class:</td>
                    <td style={{ padding: '10px 0', fontWeight: 600 }}>{zarfState.storageClass || 'N/A'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 0', color: 'var(--text-muted)' }}>IP Family:</td>
                    <td style={{ padding: '10px 0', fontWeight: 600 }}>{zarfState.ipFamily || 'N/A'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 0', color: 'var(--text-muted)' }}>Zarf Appliance Mode:</td>
                    <td style={{ padding: '10px 0', fontWeight: 600 }}>{zarfState.zarfAppliance ? 'Yes' : 'No'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 0', color: 'var(--text-muted)' }}>Internal Registry:</td>
                    <td style={{ padding: '10px 0', fontWeight: 600 }}>{zarfState.registryInfo?.address || 'N/A'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 0', color: 'var(--text-muted)' }}>Registry Mode:</td>
                    <td style={{ padding: '10px 0', fontWeight: 600 }}>{zarfState.registryInfo?.registryMode || 'N/A'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 0', color: 'var(--text-muted)' }}>Registry NodePort:</td>
                    <td style={{ padding: '10px 0', fontWeight: 600 }}>{zarfState.registryInfo?.nodePort || 'N/A'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '10px 0', color: 'var(--text-muted)' }}>TLS Strategy:</td>
                    <td style={{ padding: '10px 0', fontWeight: 600 }}>{zarfState.registryInfo?.mtlsStrategy || 'N/A'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        {zarfState.agentTLS && (
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: 16, color: 'var(--accent-purple)' }}>Agent TLS Configuration</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
              <div>
                <strong style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>CA Certificate (PEM):</strong>
                <textarea 
                  readOnly 
                  style={{ width: '100%', height: '80px', background: '#000', border: '1px solid var(--border-color)', borderRadius: 4, padding: 8, color: '#a5d6ff', fontSize: '0.75rem', outline: 'none' }}
                  value={zarfState.agentTLS.ca}
                />
              </div>
              <div>
                <strong style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Server Certificate (PEM):</strong>
                <textarea 
                  readOnly 
                  style={{ width: '100%', height: '80px', background: '#000', border: '1px solid var(--border-color)', borderRadius: 4, padding: 8, color: '#a5d6ff', fontSize: '0.75rem', outline: 'none' }}
                  value={zarfState.agentTLS.cert}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDiffView = () => {
    if (!selectedRevisionValues || !activeRevisionValues) return null;

    const activeLines = activeRevisionValues.split('\n');
    const selectedLines = selectedRevisionValues.values.split('\n');

    const diffs: Array<{ type: 'added' | 'removed' | 'unchanged', text: string }> = [];
    
    let i = 0, j = 0;
    while (i < activeLines.length || j < selectedLines.length) {
      const activeLine = activeLines[i];
      const selectedLine = selectedLines[j];

      if (i < activeLines.length && j < selectedLines.length) {
        if (activeLine === selectedLine) {
          diffs.push({ type: 'unchanged', text: activeLine });
          i++;
          j++;
        } else {
          const nextMatchIdx = selectedLines.slice(j).indexOf(activeLine);
          if (nextMatchIdx !== -1 && nextMatchIdx < 5) {
            for (let k = 0; k < nextMatchIdx; k++) {
              diffs.push({ type: 'added', text: selectedLines[j + k] });
            }
            j += nextMatchIdx;
          } else {
            diffs.push({ type: 'removed', text: activeLine });
            diffs.push({ type: 'added', text: selectedLine });
            i++;
            j++;
          }
        }
      } else if (i < activeLines.length) {
        diffs.push({ type: 'removed', text: activeLine });
        i++;
      } else if (j < selectedLines.length) {
        diffs.push({ type: 'added', text: selectedLine });
        j++;
      }
    }

    return (
      <div className="diff-container">
        {diffs.map((d, idx) => (
          <div 
            key={idx} 
            className={`diff-line ${d.type === 'added' ? 'diff-line-added' : d.type === 'removed' ? 'diff-line-removed' : 'diff-line-unchanged'}`}
          >
            <span style={{ width: 20, display: 'inline-block', userSelect: 'none', opacity: 0.5 }}>
              {d.type === 'added' ? '+' : d.type === 'removed' ? '-' : ' '}
            </span>
            <span>{d.text}</span>
          </div>
        ))}
      </div>
    );
  };

  const fetchNamespaces = () => {
    fetch('/api/namespaces').then(res => res.json()).then(data => {
      if (Array.isArray(data)) setNamespaces(['all', ...data]);
    }).catch(console.error);
  };

  const fetchResources = () => {
    if (
      activeTab === 'zarf-registry' || 
      activeTab === 'zarf-creds' || 
      activeTab === 'helm-install' || 
      activeTab === 'helm-repos' || 
      activeTab === 'zarf-deploy' || 
      activeTab === 'zarf-sbom'
    ) {
      setLoading(false);
      return;
    }
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
      ? (() => { fetchZarfState(); return '/api/zarf/packages'; })()
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
      if (Array.isArray(p)) setAssociatedPods(p);
      if (Array.isArray(d)) setAssociatedDeployments(d);
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
      if (Array.isArray(data)) {
        setPodMetrics(data);
        setPodMetricsHistory(prev => {
          const updated = { ...prev };
          data.forEach((pm: any) => {
            const key = `${pm.metadata.namespace}/${pm.metadata.name}`;
            let cpuUsage = 0;
            let memUsage = 0;
            pm.containers?.forEach((c: any) => {
              cpuUsage += parseCpu(c.usage?.cpu || '0');
              memUsage += parseMem(c.usage?.memory || '0');
            });
            const existing = updated[key] || { cpu: [], mem: [] };
            updated[key] = {
              cpu: [...existing.cpu.slice(-14), cpuUsage],
              mem: [...existing.mem.slice(-14), memUsage]
            };
          });
          return updated;
        });
      }
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
    const pod = resources.find(r => r && r.metadata && r.metadata.name === modal.name && r.metadata.namespace === modal.namespace) 
      || topologyData.pods.find(p => p && p.metadata && p.metadata.name === modal.name && p.metadata.namespace === modal.namespace);
    return pod?.spec?.containers?.map((c: any) => c.name as string) || [];
  };

  useEffect(() => {
    fetchNamespaces();
    fetchZarfStatus();
    fetchContexts();
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

        const lacksNetPol = clusterAuditResult?.issues?.some(
          (i: any) => i.rule === 'Pod Missing NetworkPolicy' && 
                      i.namespace === p.metadata.namespace && 
                      i.resource === `Pod/${p.metadata.name}`
        );

        let borderCol = color;
        let borderDashes = false;
        let nodeLabel = p.metadata.name.length > 20 ? p.metadata.name.substring(0, 17) + '...' : p.metadata.name;
        let nodeTitle = `Pod: ${p.metadata.name}\nStatus: ${p.status?.phase}\nNode: ${p.spec?.nodeName}`;

        if (lacksNetPol) {
          borderCol = '#f59e0b'; // orange warning border
          borderDashes = true;
          nodeLabel = `⚠️ ${nodeLabel}`;
          nodeTitle += `\n⚠️ WARNING: Lacks NetworkPolicy Isolation`;
        }

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
  }, [activeTab, topologyMode, topologyData, clusterAuditResult]);

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
      } else if (type === 'values') {
        const res = await fetch(`/api/helm/${modal.namespace}/${modal.name}/values`);
        const data = await res.json();
        const valStr = data.raw || JSON.stringify(data, null, 2);
        setModalData(valStr);
        setHelmValuesEdit(valStr);
      } else if (type === 'files') {
        setModalData('files-ready');
        setCurrentDirPath('/');
        fetchPodFilesList('/');
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

  const handleDrillDownToPods = (resource: any) => {
    const matchLabels = resource.spec?.selector?.matchLabels || {};
    const firstKey = Object.keys(matchLabels)[0];
    if (firstKey) {
      setSearch(`label:${firstKey}=${matchLabels[firstKey]}`);
    } else {
      setSearch(resource.metadata.name);
    }
    setSelectedNs(resource.metadata.namespace || 'all');
    setActiveTab('pods');
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
    const node = resources.find(r => r && r.metadata && r.metadata.name === nodeName) || topologyData.nodes.find(r => r && r.metadata && r.metadata.name === nodeName);
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

  const renderSmallSparkline = (points: number[], color: string) => {
    if (!points || points.length < 2) return null;
    const max = Math.max(...points, 0.0001);
    const min = Math.min(...points, 0);
    const range = max - min;
    
    const width = 60;
    const height = 15;
    const padding = 1;
    
    const coords = points.map((p, idx) => {
      const x = padding + (idx / (points.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((p - min) / range) * (height - 2 * padding);
      return `${x},${y}`;
    });
    
    return (
      <svg width={width} height={height} style={{ overflow: 'visible', verticalAlign: 'middle', marginLeft: 6 }}>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          points={coords.join(' ')}
        />
      </svg>
    );
  };

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
              Interactive control plane for Kubernetes clusters and Zarf package deployments. 
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
          
          <div style={{ width: '220px', height: '125px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', position: 'relative', zIndex: 1, flexShrink: 0, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
            <img 
              src="/periscope_hero.png" 
              alt="Periscope Cluster View" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
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

  // We need this state as well
  const [selectedHelmRelease, setSelectedHelmRelease] = useState<{name: string, namespace: string} | null>(null);

  const renderHelmReleasesView = () => {
    return (
      <div className="helm-releases-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Active Releases ({filteredResources.length})</h3>
        {filteredResources.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', padding: '20px 0', border: '1px dashed var(--border-color)', borderRadius: 8, textAlign: 'center' }}>
            No Helm releases found in this namespace/cluster.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredResources.filter((res: any) => res && res.metadata && res.metadata.uid?.startsWith('helm-')).map((res: any) => {
              const name = res.metadata.name;
              const ns = res.metadata.namespace;
              const status = res.status?.phase || 'unknown';
              const isSelected = selectedHelmRelease?.name === name && selectedHelmRelease?.namespace === ns;
              
              return (
                <div 
                  key={res.metadata.uid}
                  className={`resource-row ${isSelected ? 'active' : ''}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    padding: '16px 20px',
                    background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isSelected ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                    borderRadius: 8,
                    alignItems: 'stretch'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-main)' }}>{name}</span>
                        <span className={`badge ${status.toLowerCase() === 'deployed' ? 'ready' : 'error'}`}>{status}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Chart: <span style={{ color: 'var(--text-main)', marginRight: 12 }}>{res.chart}</span>
                        Rev: <span style={{ color: 'var(--text-main)', marginRight: 12 }}>{res.revision}</span>
                        App Version: <span style={{ color: 'var(--text-main)', marginRight: 12 }}>{res.appVersion || 'N/A'}</span>
                        NS: <span style={{ color: 'var(--text-main)' }}>{ns}</span>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button 
                        className="btn"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedHelmRelease(null);
                          } else {
                            setSelectedHelmRelease({ name, namespace: ns });
                            fetchHelmInspect(ns, name, helmInspectTab);
                          }
                        }}
                      >
                        <Search size={14} /> {isSelected ? 'Close Details' : 'Inspect'}
                      </button>
                      <button 
                        className="btn"
                        onClick={() => setModal({ type: 'history', name, namespace: ns, kind: 'helm', uid: res.metadata.uid })}
                      >
                        <RefreshCw size={14} /> History
                      </button>
                      <button 
                        className="btn btn-danger"
                        onClick={() => handleDelete(res)}
                      >
                        <Trash2 size={14} /> Uninstall
                      </button>
                    </div>
                  </div>

                  {/* Release Inspect Panel */}
                  {isSelected && (
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 16, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* Inspect tabs */}
                      <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                        {(['values', 'manifest', 'notes'] as const).map((t) => (
                          <button 
                            key={t}
                            className={`btn ${helmInspectTab === t ? 'btn-primary' : ''}`}
                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                            onClick={() => {
                              setHelmInspectTab(t);
                              fetchHelmInspect(ns, name, t);
                            }}
                          >
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </button>
                        ))}
                      </div>

                      {/* Inspector output */}
                      {isFetchingHelmInspect ? (
                        <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Fetching release details...</div>
                      ) : helmInspectTab === 'values' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Upgrade Chart Reference (e.g. bitnami/nginx or chart name)</label>
                              <input
                                type="text"
                                className="exec-input"
                                style={{ padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, fontSize: '0.85rem' }}
                                value={helmUpgradeChartRef}
                                onChange={e => setHelmUpgradeChartRef(e.target.value)}
                                placeholder="e.g. bitnami/nginx"
                              />
                            </div>
                            <button
                              className="btn btn-primary"
                              onClick={() => handleHelmUpgrade(name, ns)}
                              disabled={isUpgradingHelm}
                              style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                            >
                              {isUpgradingHelm ? 'Upgrading...' : 'Upgrade Release'}
                            </button>
                          </div>
                          <textarea
                            style={{
                              padding: '12px 16px',
                              background: 'var(--bg-main)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 6,
                              height: 250,
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.85rem',
                              color: 'var(--text-main)',
                              resize: 'vertical'
                            }}
                            value={helmUpgradeValues}
                            onChange={e => setHelmUpgradeValues(e.target.value)}
                            placeholder="# Enter values overrides here"
                          />
                        </div>
                      ) : (
                        <pre 
                          className="code-block"
                          style={{
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 6,
                            padding: '12px 16px',
                            fontSize: '0.85rem',
                            maxHeight: 300,
                            overflowY: 'auto',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-main)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all'
                          }}
                        >
                          {helmInspectData || 'No data returned.'}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderHelmInstallView = () => {
    return (
      <div className="helm-install-view animate-fade-in" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: 16 }}>Deploy Repository Chart</h3>
        <form onSubmit={handleCustomHelmInstall} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Release Name</label>
              <input 
                type="text"
                className="exec-input"
                style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4 }}
                value={helmCustomInstall.releaseName}
                onChange={e => setHelmCustomInstall(prev => ({ ...prev, releaseName: e.target.value }))}
                placeholder="e.g. my-nginx"
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Namespace</label>
              <input 
                type="text"
                className="exec-input"
                style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4 }}
                value={helmCustomInstall.namespace}
                onChange={e => setHelmCustomInstall(prev => ({ ...prev, namespace: e.target.value }))}
                placeholder="e.g. default"
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Chart Repository</label>
              <input 
                type="text"
                className="exec-input"
                style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4 }}
                value={helmCustomInstall.repo}
                onChange={e => setHelmCustomInstall(prev => ({ ...prev, repo: e.target.value }))}
                placeholder="e.g. bitnami"
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Chart Name</label>
              <input 
                type="text"
                className="exec-input"
                style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4 }}
                value={helmCustomInstall.chartName}
                onChange={e => setHelmCustomInstall(prev => ({ ...prev, chartName: e.target.value }))}
                placeholder="e.g. nginx"
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Version (Optional)</label>
              <input 
                type="text"
                className="exec-input"
                style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4 }}
                value={helmCustomInstall.version}
                onChange={e => setHelmCustomInstall(prev => ({ ...prev, version: e.target.value }))}
                placeholder="e.g. 15.2.3"
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Custom values.yaml (Optional)</label>
            <textarea 
              style={{ 
                padding: '12px 16px', 
                background: 'var(--bg-main)', 
                border: '1px solid var(--border-color)', 
                borderRadius: 4, 
                height: 150, 
                fontFamily: 'var(--font-mono)', 
                fontSize: '0.85rem',
                color: 'var(--text-main)',
                resize: 'vertical'
              }}
              value={helmCustomInstall.valuesYaml}
              onChange={e => setHelmCustomInstall(prev => ({ ...prev, valuesYaml: e.target.value }))}
              placeholder="# Enter values.yaml overrides here"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
            <button type="button" className="btn" onClick={() => setActiveTab('helm')} disabled={isSubmittingHelmDeploy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmittingHelmDeploy}>
              {isSubmittingHelmDeploy ? 'Deploying...' : 'Deploy'}
            </button>
          </div>
        </form>
      </div>
    );
  };

  const renderHelmReposView = () => {
    return (
      <div className="helm-repos-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Configured Repositories</h3>
            <button className="btn" onClick={handleUpdateHelmRepos} disabled={isSubmittingHelmRepo}>
              <RefreshCw size={14} /> Update Repos
            </button>
          </div>

          {helmRepos.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '16px 0' }}>No chart repositories configured.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {helmRepos.map((r: any) => (
                <div 
                  key={r.name} 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '10px 14px', 
                    background: 'rgba(255,255,255,0.02)', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: 6 
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{r.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.url}</div>
                  </div>
                  <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => handleRemoveHelmRepo(r.name)}>
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddHelmRepo} style={{ display: 'flex', gap: 12, marginTop: 16, borderTop: '1px solid var(--border-color)', paddingTop: 16 }}>
            <input 
              type="text" 
              placeholder="Repo Name (e.g. bitnami)" 
              className="exec-input" 
              style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4 }}
              value={newHelmRepo.name}
              onChange={e => setNewHelmRepo(prev => ({ ...prev, name: e.target.value }))}
              disabled={isSubmittingHelmRepo}
            />
            <input 
              type="text" 
              placeholder="URL (e.g. https://charts.bitnami.com/bitnami)" 
              className="exec-input" 
              style={{ flex: 2, padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4 }}
              value={newHelmRepo.url}
              onChange={e => setNewHelmRepo(prev => ({ ...prev, url: e.target.value }))}
              disabled={isSubmittingHelmRepo}
            />
            <button type="submit" className="btn btn-primary" disabled={isSubmittingHelmRepo}>
              Add Repo
            </button>
          </form>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: 16 }}>Search Repository Charts</h3>
          <form onSubmit={handleSearchHelmRepo} style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <input 
              type="text" 
              placeholder="Search query (e.g. nginx, redis...)" 
              className="exec-input" 
              style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4 }}
              value={helmSearchQuery}
              onChange={e => setHelmSearchQuery(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={isSearchingHelm}>
              {isSearchingHelm ? 'Searching...' : 'Search'}
            </button>
          </form>

          {helmSearchResults.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>Enter a query above to search chart repositories.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
              {helmSearchResults.map((c: any) => {
                const parts = c.name.split('/');
                const repoName = parts[0];
                const chartName = parts[1] || parts[0];
                
                return (
                  <div 
                    key={c.name}
                    style={{ 
                      padding: '12px 16px', 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ flex: 1, paddingRight: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{c.name}</span>
                        <span className="badge badge-running" style={{ fontSize: '0.7rem', padding: '1px 5px', textTransform: 'none' }}>v{c.version}</span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{c.description}</div>
                    </div>
                    <button 
                      className="btn btn-primary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      onClick={() => {
                        setHelmCustomInstall({
                          releaseName: chartName,
                          repo: repoName,
                          chartName: chartName,
                          version: c.version,
                          namespace: 'default',
                          valuesYaml: '# Custom values here\n'
                        });
                        setActiveTab('helm-install');
                      }}
                    >
                      Configure & Deploy
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

  const renderZarfPackagesView = () => {
    return (
      <div className="zarf-packages-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
            <button className="btn btn-primary" onClick={() => setActiveTab('zarf-deploy')}>
              <Package size={14} /> Deploy Package
            </button>
          )}
        </div>

        <div>
          <h3 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Deployed Packages ({filteredResources.length})</h3>
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
                    
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button 
                        className="btn"
                        onClick={() => handleInspectDeployedZarfPackage(name)}
                        disabled={isFetchingPackageDetail}
                      >
                        <Search size={14} /> Inspect
                      </button>
                      <button 
                        className="btn btn-danger"
                        onClick={() => handleRemoveZarfPackage(name)}
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderZarfDeployView = () => {
    if (zarfViewMode === 'edit') {
      return (
        <div className="zarf-edit-view animate-fade-in" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Modify Zarf Config</h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Editing `zarf.yaml` config extracted from package.
              </div>
            </div>
            <button 
              className="btn btn-danger" 
              onClick={() => {
                setZarfViewMode('local');
                setZarfUnpackTempDir('');
                setZarfConfigText('');
              }}
            >
              Discard changes
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <textarea 
              style={{ 
                padding: '12px 16px', 
                background: 'var(--bg-main)', 
                border: '1px solid var(--border-color)', 
                borderRadius: 4, 
                height: 350, 
                fontFamily: 'var(--font-mono)', 
                fontSize: '0.85rem',
                color: 'var(--text-main)',
                resize: 'vertical'
              }}
              value={zarfConfigText}
              onChange={e => setZarfConfigText(e.target.value)}
              placeholder="# Enter zarf.yaml content here"
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button 
                className="btn" 
                onClick={() => {
                  setZarfViewMode('local');
                  setZarfUnpackTempDir('');
                  setZarfConfigText('');
                }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleRebuildAndDeployZarf}
                disabled={isSavingZarfConfig}
              >
                {isSavingZarfConfig ? 'Rebuilding & Deploying...' : 'Rebuild & Deploy'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="zarf-deploy-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Upload Zarf Package</h3>
          <div 
            style={{ 
              border: '2px dashed var(--border-color)', 
              borderRadius: 6, 
              padding: '30px 20px', 
              textAlign: 'center', 
              background: 'rgba(0,0,0,0.1)', 
              cursor: 'pointer',
              marginBottom: 16
            }}
            onClick={() => document.getElementById('zarf-file-input')?.click()}
          >
            <input 
              type="file" 
              id="zarf-file-input" 
              style={{ display: 'none' }} 
              accept=".zst"
              onChange={e => {
                const files = e.target.files;
                if (files && files.length > 0) {
                  setZarfUploadFile(files[0]);
                }
              }}
            />
            <Package size={36} style={{ color: 'var(--text-muted)', marginBottom: 10 }} />
            {zarfUploadFile ? (
              <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                Selected: {zarfUploadFile.name} ({(zarfUploadFile.size / (1024 * 1024)).toFixed(1)} MB)
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>
                Drag and drop your Zarf package tarball here, or click to browse
              </div>
            )}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Supports Zarf package files (ending in .tar.zst)
            </div>
          </div>

          {zarfUploadFile && (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button 
                className="btn" 
                onClick={() => setZarfUploadFile(null)}
                disabled={zarfUploadProgress >= 0}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleZarfUpload}
                disabled={zarfUploadProgress >= 0}
              >
                Upload Package
              </button>
            </div>
          )}

          {zarfUploadProgress >= 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                <span>Uploading {zarfUploadFile?.name}...</span>
                <span>{zarfUploadProgress}%</span>
              </div>
              <div className="metric-bar-wrapper" style={{ margin: 0 }}>
                <div className="metric-bar-fill normal" style={{ width: `${zarfUploadProgress}%` }}></div>
              </div>
            </div>
          )}
        </div>

        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Workspace Directory Contents</h3>
            <button className="btn btn-icon" onClick={fetchZarfLocalPackages}>
              <RefreshCw size={14} />
            </button>
          </div>

          {zarfLocalPackages.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>
              No workspace files or folders found.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {zarfLocalPackages.map((pkg: any) => {
                const isPackage = pkg.name.endsWith('.tar.zst') || pkg.name.endsWith('.zst');
                return (
                  <div 
                    key={pkg.name} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '12px 16px', 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: 6 
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-main)' }}>{pkg.name}</span>
                        {pkg.isDir && <span className="badge badge-running" style={{ textTransform: 'none', background: 'rgba(0, 122, 255, 0.1)', color: '#007aff', borderColor: '#007aff' }}>Folder</span>}
                        {isPackage && <span className="badge badge-running" style={{ textTransform: 'none', background: 'rgba(57, 255, 20, 0.1)', color: '#39ff14', borderColor: '#39ff14' }}>Package</span>}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Size: <span style={{ color: 'var(--text-main)', marginRight: 12 }}>{pkg.isDir ? 'N/A' : `${(pkg.size / (1024 * 1024)).toFixed(1)} MB`}</span>
                        Modified: <span style={{ color: 'var(--text-main)' }}>{new Date(pkg.mtime).toLocaleString()}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {pkg.isDir && (
                        <button 
                          className="btn" 
                          onClick={() => handleCompressFolder(pkg.name)}
                        >
                          Compress
                        </button>
                      )}
                      {isPackage && (
                        <>
                          <button 
                            className="btn" 
                            onClick={() => handleDecompressPackage(pkg.name)}
                          >
                            Decompress
                          </button>
                          <button 
                            className="btn" 
                            onClick={() => handleUnpackZarfPackage(pkg.path)}
                            disabled={isUnpackingZarf}
                          >
                            {isUnpackingZarf && selectedZarfPackagePath === pkg.path ? 'Unpacking...' : 'Inspect & Edit'}
                          </button>
                          <button 
                            className="btn btn-primary" 
                            onClick={() => handleDeployLocalPackage(pkg.path)}
                          >
                            Deploy
                          </button>
                        </>
                      )}
                      <button 
                        className="btn btn-danger btn-icon" 
                        onClick={() => handleDeleteWorkspaceItem(pkg.name)}
                        style={{ padding: '6px' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderZarfSbomView = () => {
    const packagesOnly = zarfLocalPackages.filter((pkg: any) => pkg.name.endsWith('.tar.zst') || pkg.name.endsWith('.zst'));

    return (
      <div className="zarf-sbom-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Extract CycloneDX Package Reports</h3>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <select 
                className="exec-input"
                style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)' }}
                value={sbomPackageName}
                onChange={e => setSbomPackageName(e.target.value)}
              >
                <option value="">-- Select a local Zarf package --</option>
                {packagesOnly.map((pkg: any) => (
                  <option key={pkg.name} value={pkg.name}>{pkg.name}</option>
                ))}
              </select>
              <button 
                className="btn btn-primary"
                onClick={handleExtractSbom}
                disabled={isExtractingSbom || !sbomPackageName}
              >
                {isExtractingSbom ? 'Extracting...' : 'Extract SBOM'}
              </button>
            </div>
          </div>

          {sbomExtractedFiles.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 20 }}>
              <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16, maxHeight: '600px', overflowY: 'auto' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: 10, color: 'var(--text-muted)' }}>Component Reports</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {sbomExtractedFiles.map(file => {
                    const cleanName = file.name.replace(/^sbom-viewer-/, '').replace(/\.html$/, '');
                    const isActive = sbomSelectedFileUrl === file.url;
                    return (
                      <button
                        key={file.name}
                        className={`btn ${isActive ? 'btn-primary' : ''}`}
                        style={{ 
                          justifyContent: 'flex-start', 
                          textAlign: 'left', 
                          fontSize: '0.8rem', 
                          padding: '8px 12px', 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap',
                          background: isActive ? 'var(--accent-blue)' : 'rgba(255,255,255,0.02)'
                        }}
                        onClick={() => setSbomSelectedFileUrl(file.url)}
                        title={cleanName}
                      >
                        {cleanName}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', height: '600px' }}>
                {sbomSelectedFileUrl ? (
                  <iframe 
                    src={sbomSelectedFileUrl}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title="CycloneDX SBOM Report"
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#333' }}>
                    Select a component report to view.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderImageScannerView = () => {
    const totalCount = runningImages.length;
    const scannedCount = Object.values(runningImagesScanResults).filter((r: any) => r.status === 'success').length;
    const scanningCount = Object.values(runningImagesScanResults).filter((r: any) => r.status === 'scanning').length;
    const failedCount = Object.values(runningImagesScanResults).filter((r: any) => r.status === 'failed').length;

    const filteredVulns = getFilteredVulnerabilities();
    const filteredPkgs = getFilteredPackages();

    const criticalCount = filteredVulns.filter((m: any) => (m.vulnerability?.severity || '').toLowerCase() === 'critical').length;
    const highCount = filteredVulns.filter((m: any) => (m.vulnerability?.severity || '').toLowerCase() === 'high').length;
    const mediumCount = filteredVulns.filter((m: any) => (m.vulnerability?.severity || '').toLowerCase() === 'medium').length;
    const lowCount = filteredVulns.filter((m: any) => (m.vulnerability?.severity || '').toLowerCase() === 'low').length;
    const negligibleCount = filteredVulns.filter((m: any) => (m.vulnerability?.severity || '').toLowerCase() === 'negligible').length;

    const renderTablePlaceholder = (tab: 'vulnerabilities' | 'packages') => {
      if (selectedScanFilterImage === 'all') {
        if (scannedCount === 0) {
          return (
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: 16 }}>No container images have been scanned yet.</div>
              <button 
                className="btn btn-primary"
                onClick={fetchRunningImagesAndScan}
                disabled={isScanningAllRunningImages}
                style={{ margin: '0 auto' }}
              >
                <RefreshCw size={14} className={isScanningAllRunningImages ? 'spin' : ''} style={{ marginRight: 6 }} />
                {isScanningAllRunningImages ? 'Scanning All...' : 'Scan All Running Images'}
              </button>
            </div>
          );
        }
        return (
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            No {tab} found matching current filters.
          </div>
        );
      }

      const scan = runningImagesScanResults[selectedScanFilterImage];
      const cleanedImg = selectedScanFilterImage.replace(/^zarf-docker-registry\.zarf\.svc\.cluster\.local:5000\//, '').replace(/^127\.0\.0\.1:31999\//, '');

      if (!scan) {
        return (
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center' }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
              Image <strong>{cleanedImg}</strong> has not been scanned yet.
            </div>
            <button 
              className="btn btn-primary"
              onClick={() => scanSingleImage(selectedScanFilterImage)}
              style={{ margin: '0 auto' }}
            >
              Scan Image
            </button>
          </div>
        );
      }

      if (scan.status === 'scanning') {
        return (
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="loader" style={{ margin: '0 auto 12px auto' }}></div>
            Scanning image <strong>{cleanedImg}</strong>...
          </div>
        );
      }

      if (scan.status === 'failed') {
        return (
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center' }}>
            <div style={{ color: '#ef4444', marginBottom: 8, fontWeight: 600 }}>Scan Failed</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16, maxWidth: '500px', margin: '0 auto 16px auto' }}>
              {scan.error || 'Unknown error occurred during scan.'}
            </div>
            <button 
              className="btn"
              onClick={() => scanSingleImage(selectedScanFilterImage)}
              style={{ margin: '0 auto', background: 'rgba(255,255,255,0.02)' }}
            >
              Retry Scan
            </button>
          </div>
        );
      }

      return (
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          No {tab} found for this container image.
        </div>
      );
    };

    return (
      <div className="image-scanner-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Top Control Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '16px 20px', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Shield size={18} style={{ color: 'var(--accent-blue)' }} /> Real-time Container Vulnerabilities
            </h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Images Scanned: <strong style={{ color: 'var(--text-main)' }}>{scannedCount}</strong> / {totalCount}
              {scanningCount > 0 && <span style={{ marginLeft: 10, color: 'var(--accent-cyan)' }}>({scanningCount} scanning...)</span>}
              {failedCount > 0 && <span style={{ marginLeft: 10, color: '#ef4444' }}>({failedCount} failed)</span>}
            </div>
          </div>
          <button 
            className="btn btn-primary"
            onClick={fetchRunningImagesAndScan}
            disabled={isScanningAllRunningImages}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <RefreshCw size={16} className={isScanningAllRunningImages ? 'spin' : ''} />
            {isScanningAllRunningImages ? 'Scanning Cluster...' : 'Scan All Running Images'}
          </button>
        </div>

        {/* Severity Metrics Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          <div style={{ background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 8, padding: '14px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444', lineHeight: 1.2 }}>{criticalCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>Critical</div>
          </div>
          <div style={{ background: 'rgba(245, 158, 11, 0.03)', border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: 8, padding: '14px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b', lineHeight: 1.2 }}>{highCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>High</div>
          </div>
          <div style={{ background: 'rgba(252, 211, 77, 0.03)', border: '1px solid rgba(252, 211, 77, 0.15)', borderRadius: 8, padding: '14px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fbbf24', lineHeight: 1.2 }}>{mediumCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>Medium</div>
          </div>
          <div style={{ background: 'rgba(96, 165, 250, 0.03)', border: '1px solid rgba(96, 165, 250, 0.15)', borderRadius: 8, padding: '14px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#60a5fa', lineHeight: 1.2 }}>{lowCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>Low</div>
          </div>
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 8, padding: '14px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.2 }}>{negligibleCount}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>Negligible</div>
          </div>
        </div>

        {/* Tab Selection */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: 16 }}>
          <button 
            className={`tab-btn ${imageScannerActiveTab === 'vulnerabilities' ? 'active' : ''}`}
            onClick={() => setImageScannerActiveTab('vulnerabilities')}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: imageScannerActiveTab === 'vulnerabilities' ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: imageScannerActiveTab === 'vulnerabilities' ? 'var(--text-main)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem'
            }}
          >
            🛡️ Vulnerabilities ({filteredVulns.length})
          </button>
          <button 
            className={`tab-btn ${imageScannerActiveTab === 'packages' ? 'active' : ''}`}
            onClick={() => setImageScannerActiveTab('packages')}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: imageScannerActiveTab === 'packages' ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: imageScannerActiveTab === 'packages' ? 'var(--text-main)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem'
            }}
          >
            📦 Packages ({filteredPkgs.length})
          </button>
          <button 
            className={`tab-btn ${imageScannerActiveTab === 'images' ? 'active' : ''}`}
            onClick={() => setImageScannerActiveTab('images')}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: imageScannerActiveTab === 'images' ? '2px solid var(--accent-blue)' : '2px solid transparent',
              color: imageScannerActiveTab === 'images' ? 'var(--text-main)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem'
            }}
          >
            📷 Scanned Images ({totalCount})
          </button>
        </div>

        {/* Filter and Control Actions Bar (for data tabs) */}
        {imageScannerActiveTab !== 'images' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.1)', borderRadius: 6, padding: 12, flexWrap: 'wrap', gap: 10 }}>
            {/* Left filters */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="search-box" style={{ width: 220 }}>
                <Search size={14} />
                <input 
                  type="text" 
                  placeholder={imageScannerActiveTab === 'vulnerabilities' ? "Search CVEs/packages..." : "Search packages..."}
                  value={imageScanSearchQuery}
                  onChange={e => setImageScanSearchQuery(e.target.value)}
                  style={{ padding: '6px 10px 6px 30px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4 }}
                />
              </div>

              {/* Image Filter */}
              <select
                value={selectedScanFilterImage}
                onChange={e => setSelectedScanFilterImage(e.target.value)}
                style={{ padding: '6px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)', fontSize: '0.85rem' }}
              >
                <option value="all">All Images ({totalCount})</option>
                {runningImages.map(img => {
                  const cleaned = img.replace(/^zarf-docker-registry\.zarf\.svc\.cluster\.local:5000\//, '').replace(/^127\.0\.0\.1:31999\//, '');
                  return <option key={img} value={img}>{cleaned}</option>;
                })}
              </select>

              {/* Severity Filter (only for vulnerabilities tab) */}
              {imageScannerActiveTab === 'vulnerabilities' && (
                <select
                  value={imageScanSeverityFilter}
                  onChange={e => setImageScanSeverityFilter(e.target.value)}
                  style={{ padding: '6px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)', fontSize: '0.85rem' }}
                >
                  <option value="all">All Severities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                  <option value="Negligible">Negligible</option>
                </select>
              )}
            </div>

            {/* Right exports */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                className="btn btn-primary" 
                onClick={imageScannerActiveTab === 'vulnerabilities' ? exportImageScannerVulnerabilitiesCsv : exportImageScannerPackagesCsv}
                style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Download size={14} /> Export CSV
              </button>
              <button 
                className="btn" 
                onClick={imageScannerActiveTab === 'vulnerabilities' ? exportImageScannerVulnerabilitiesJson : exportImageScannerPackagesJson}
                style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Download size={14} /> Export JSON
              </button>
            </div>
          </div>
        )}

        {/* Tab Contents Rendering */}
        {imageScannerActiveTab === 'vulnerabilities' && (
          filteredVulns.length === 0 ? (
            renderTablePlaceholder('vulnerabilities')
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 14px' }}>Source Image</th>
                    <th style={{ padding: '10px 14px' }}>Vulnerability</th>
                    <th style={{ padding: '10px 14px' }}>Severity</th>
                    <th style={{ padding: '10px 14px' }}>Package</th>
                    <th style={{ padding: '10px 14px' }}>Installed Version</th>
                    <th style={{ padding: '10px 14px' }}>Fixed In</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVulns.map((m: any, idx: number) => {
                    const vuln = m.vulnerability || {};
                    const art = m.artifact || {};
                    const severity = vuln.severity || 'Unknown';
                    const badgeColor = 
                      severity === 'Critical' ? '#ef4444' :
                      severity === 'High' ? '#f59e0b' :
                      severity === 'Medium' ? '#fbbf24' :
                      severity === 'Low' ? '#60a5fa' : 'var(--text-muted)';
                    
                    const badgeBg = 
                      severity === 'Critical' ? 'rgba(239, 68, 68, 0.08)' :
                      severity === 'High' ? 'rgba(245, 158, 11, 0.08)' :
                      severity === 'Medium' ? 'rgba(251, 191, 36, 0.08)' :
                      severity === 'Low' ? 'rgba(96, 165, 250, 0.08)' : 'rgba(255, 255, 255, 0.03)';
                    
                    const fixedIn = vuln.fix?.versions?.join(', ') || 'Not Fixed';
                    const cleanedImg = m.imageRef.replace(/^zarf-docker-registry\.zarf\.svc\.cluster\.local:5000\//, '').replace(/^127\.0\.0\.1:31999\//, '');

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.imageRef}>
                          {cleanedImg}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <a 
                            href={`https://nvd.nist.gov/vuln/detail/${vuln.id}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}
                          >
                            {vuln.id}
                          </a>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ 
                            fontSize: '0.7rem', 
                            fontWeight: 700, 
                            color: badgeColor, 
                            background: badgeBg, 
                            border: `1px solid ${badgeColor}22`,
                            borderRadius: 4,
                            padding: '2px 8px'
                          }}>
                            {severity}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{art.name}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)' }}>{art.version}</td>
                        <td style={{ padding: '10px 14px', color: fixedIn === 'Not Fixed' ? 'var(--text-muted)' : '#10b981' }}>{fixedIn}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {imageScannerActiveTab === 'packages' && (
          filteredPkgs.length === 0 ? (
            renderTablePlaceholder('packages')
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px 14px' }}>Source Image</th>
                    <th style={{ padding: '10px 14px' }}>Package Name</th>
                    <th style={{ padding: '10px 14px' }}>Version</th>
                    <th style={{ padding: '10px 14px' }}>Type</th>
                    <th style={{ padding: '10px 14px' }}>Licenses</th>
                    <th style={{ padding: '10px 14px' }}>Language</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPkgs.map((art: any, idx: number) => {
                    const licenseStrs = Array.isArray(art.licenses)
                      ? art.licenses.map((l: any) => typeof l === 'string' ? l : (l.value || ''))
                      : [];
                    const cleanedImg = art.imageRef.replace(/^zarf-docker-registry\.zarf\.svc\.cluster\.local:5000\//, '').replace(/^127\.0\.0\.1:31999\//, '');

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={art.imageRef}>
                          {cleanedImg}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-main)' }}>{art.name}</td>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)' }}>{art.version}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span className="badge badge-running" style={{ textTransform: 'none', padding: '2px 6px', background: 'rgba(255,255,255,0.03)' }}>
                            {art.type}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#ffd700' }}>
                          {licenseStrs.length > 0 ? licenseStrs.join(', ') : <span style={{ color: 'var(--text-muted)' }}>None</span>}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{art.language || 'N/A'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {imageScannerActiveTab === 'images' && (
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '12px 16px' }}>Container Image Reference</th>
                  <th style={{ padding: '12px 16px' }}>Scan Status</th>
                  <th style={{ padding: '12px 16px' }}>Vulnerability Counts (C/H/M/L)</th>
                  <th style={{ padding: '12px 16px' }}>Packages</th>
                  <th style={{ padding: '12px 16px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {runningImages.map((img: string, idx: number) => {
                  const scan = runningImagesScanResults[img];
                  const cleanedName = img.replace(/^zarf-docker-registry\.zarf\.svc\.cluster\.local:5000\//, '').replace(/^127\.0\.0\.1:31999\//, '');
                  
                  let cCount = 0, hCount = 0, mCount = 0, lCount = 0;
                  if (scan && scan.status === 'success' && scan.vulnerabilities && scan.vulnerabilities.matches) {
                    scan.vulnerabilities.matches.forEach((m: any) => {
                      const sev = (m.vulnerability?.severity || '').toLowerCase();
                      if (sev === 'critical') cCount++;
                      else if (sev === 'high') hCount++;
                      else if (sev === 'medium') mCount++;
                      else if (sev === 'low') lCount++;
                    });
                  }

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 600 }} title={img}>
                        {cleanedName}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {!scan ? (
                          <span style={{ color: 'var(--text-muted)' }}>Not Scanned</span>
                        ) : scan.status === 'scanning' ? (
                          <span style={{ color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <RefreshCw size={12} className="spin" /> Scanning...
                          </span>
                        ) : scan.status === 'success' ? (
                          <span style={{ color: '#10b981' }}>✓ Success</span>
                        ) : (
                          <span style={{ color: '#ef4444' }} title={scan.error || 'Unknown error'}>✗ Failed</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {scan && scan.status === 'success' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <span style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{cCount}</span>
                            <span style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{hCount}</span>
                            <span style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{mCount}</span>
                            <span style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{lCount}</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {scan && scan.status === 'success' ? (
                          <span>{scan.sbom?.artifacts?.length || 0} packages</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <button
                          className="btn"
                          style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.02)' }}
                          onClick={() => scanSingleImage(img)}
                          disabled={scan?.status === 'scanning'}
                        >
                          {scan?.status === 'scanning' ? 'Scanning...' : scan ? 'Rescan' : 'Scan'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const renderZarfRegistryView = () => {
    return (
      <div className="zarf-registry-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Pull and Push Forms Panel */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Pull / Upstream Copy Form */}
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Download size={18} style={{ color: 'var(--accent-blue)' }} /> Pull / Copy Upstream Image
            </h3>
            <form onSubmit={handlePullRegistryImage} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Source Image (e.g. Docker Hub or Public Registry)</label>
                <input 
                  type="text"
                  className="exec-input"
                  style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4 }}
                  placeholder="e.g. nginx:alpine"
                  value={registryPullSource}
                  onChange={e => setRegistryPullSource(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target Local Tag (stored in registry)</label>
                <input 
                  type="text"
                  className="exec-input"
                  style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4 }}
                  placeholder="e.g. library/nginx:alpine"
                  value={registryPullTarget}
                  onChange={e => setRegistryPullTarget(e.target.value)}
                  required
                />
              </div>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ alignSelf: 'flex-start', marginTop: 8 }}
                disabled={isPullingRegistry}
              >
                {isPullingRegistry ? 'Pulling...' : 'Copy Image to Registry'}
              </button>
            </form>
          </div>

          {/* Push Tarball Form */}
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Upload size={18} style={{ color: 'var(--accent-blue)' }} /> Push Image Tarball
            </h3>
            <form onSubmit={handlePushRegistryImage} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Select Docker Image Tarball (.tar)</label>
                <input 
                  type="file"
                  id="registry-image-file-input"
                  accept=".tar"
                  className="exec-input"
                  style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4 }}
                  required
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target Local Tag (e.g. repo:tag)</label>
                <input 
                  type="text"
                  className="exec-input"
                  style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4 }}
                  placeholder="e.g. library/my-app:1.0.0"
                  value={registryPushTarget}
                  onChange={e => setRegistryPushTarget(e.target.value)}
                  required
                />
              </div>
              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ alignSelf: 'flex-start', marginTop: 8 }}
                disabled={isPushingRegistry}
              >
                {isPushingRegistry ? 'Pushing...' : 'Push Tarball to Registry'}
              </button>
            </form>
          </div>
        </div>

        {/* Repositories & Tags Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Repositories catalog list */}
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Repositories Catalog</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={handlePruneRegistry}>
                  Prune Unused
                </button>
                <button className="btn btn-icon" onClick={fetchZarfRegistryCatalog} disabled={isFetchingRegistry}>
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {isFetchingRegistry ? (
              <div style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
                Querying repositories catalog...
              </div>
            ) : zarfRegistryRepos.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>
                No repositories found in local registry.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {zarfRegistryRepos.map(repo => {
                  const isSelected = zarfSelectedRepo === repo;
                  return (
                    <div 
                      key={repo}
                      className={`resource-row ${isSelected ? 'active' : ''}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isSelected ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                        borderRadius: 6,
                        cursor: 'pointer'
                      }}
                      onClick={() => fetchZarfRegistryTags(repo)}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{repo}</div>
                      <Search size={14} style={{ color: 'var(--text-muted)' }} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Repository Tags */}
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: 16 }}>
              {zarfSelectedRepo ? `Tags for ${zarfSelectedRepo}` : 'Select a Repository'}
            </h3>

            {!zarfSelectedRepo ? (
              <div style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
                Select a repository from the left panel to list its tags.
              </div>
            ) : isFetchingTags ? (
              <div style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
                Fetching tags...
              </div>
            ) : zarfSelectedRepoTags.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>
                No tags found for this repository.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {zarfSelectedRepoTags.map(tag => (
                  <div 
                    key={tag}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 6
                    }}
                  >
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{zarfSelectedRepo}:</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{tag}</span>
                    </div>
                    <button 
                      className="btn btn-danger" 
                      style={{ padding: '4px 8px' }} 
                      onClick={() => handleDeleteRegistryImage(zarfSelectedRepo, tag)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderClusterAuditorView = () => {
    const criticals = (clusterAuditResult?.issues || []).filter((i: any) => i.severity === 'Critical');
    const errors = (clusterAuditResult?.issues || []).filter((i: any) => i.severity === 'Error');
    const warnings = (clusterAuditResult?.issues || []).filter((i: any) => i.severity === 'Warning');
    const infos = (clusterAuditResult?.issues || []).filter((i: any) => i.severity === 'Info');

    const gradeColor = 
      clusterAuditResult?.grade?.startsWith('A') ? '#10b981' :
      clusterAuditResult?.grade?.startsWith('B') || clusterAuditResult?.grade?.startsWith('C') ? '#f59e0b' : '#ef4444';

    return (
      <div className="cluster-auditor-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Summary Card */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: '1fr 3fr', 
          gap: 20, 
          background: 'rgba(255,255,255,0.01)', 
          border: '1px solid var(--border-color)', 
          borderRadius: 8, 
          padding: 24 
        }}>
          {/* Grade Display */}
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            borderRight: '1px solid var(--border-color)',
            paddingRight: 20
          }}>
            <div style={{ 
              width: 100, 
              height: 100, 
              borderRadius: '50%', 
              border: `4px solid ${gradeColor}`, 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center', 
              justifyContent: 'center',
              boxShadow: `0 0 15px ${gradeColor}22`,
              background: `radial-gradient(circle, ${gradeColor}11 0%, transparent 70%)`
            }}>
              <span style={{ fontSize: '2.2rem', fontWeight: 800, color: gradeColor }}>
                {clusterAuditResult ? clusterAuditResult.grade : '-'}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: -2 }}>
                Score: {clusterAuditResult ? clusterAuditResult.score : 'N/A'}/100
              </span>
            </div>
            <button 
              className="btn btn-primary" 
              style={{ marginTop: 16, width: '100%' }}
              onClick={runClusterAudit}
              disabled={isAuditingCluster}
            >
              {isAuditingCluster ? 'Running Audit...' : 'Re-scan Cluster'}
            </button>
          </div>

          {/* Finding Metrics */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', margin: '0 0 4px 0' }}>Kubernetes Configuration & Security Audit</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Programmatic scans of pods, deployments, services, and nodes checking for misconfigurations, security vulnerabilities, and reliability concerns.
              </p>
            </div>
            
            {clusterAuditResult ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 6, padding: 12 }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444' }}>{criticals.length}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Critical Violations</div>
                </div>
                <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: 6, padding: 12 }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>{errors.length}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Config Errors</div>
                </div>
                <div style={{ background: 'rgba(252, 211, 77, 0.05)', border: '1px solid rgba(252, 211, 77, 0.15)', borderRadius: 6, padding: 12 }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fbbf24' }}>{warnings.length}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Config Warnings</div>
                </div>
                <div style={{ background: 'rgba(96, 165, 250, 0.05)', border: '1px solid rgba(96, 165, 250, 0.15)', borderRadius: 6, padding: 12 }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#60a5fa' }}>{infos.length}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Optimizations</div>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No audit report generated. Click "Re-scan Cluster" to run diagnostics.</div>
            )}
          </div>
        </div>

        {/* Detailed Findings */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Detailed Auditor Findings ({clusterAuditResult?.issues?.length || 0})</h3>
            {clusterAuditResult && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={exportAuditMarkdown} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                  Export Report (Markdown)
                </button>
                <button className="btn" onClick={exportAuditJson} style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                  Export Report (JSON)
                </button>
              </div>
            )}
          </div>
          
          {isAuditingCluster ? (
            <div style={{ color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center', border: '1px dashed var(--border-color)', borderRadius: 8 }}>
              <div className="loader" style={{ margin: '0 auto 10px auto' }}></div>
              Evaluating Kubernetes audit rules against cluster resources...
            </div>
          ) : !clusterAuditResult || clusterAuditResult.issues.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-color)', borderRadius: 8 }}>
              No audit findings reported. Your cluster conforms to all audited rules!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {clusterAuditResult.issues.map((issue: any, index: number) => {
                const badgeColor = 
                  issue.severity === 'Critical' ? '#ef4444' :
                  issue.severity === 'Error' ? '#dc2626' :
                  issue.severity === 'Warning' ? '#fbbf24' : '#60a5fa';

                const badgeBg = 
                  issue.severity === 'Critical' ? 'rgba(239, 68, 68, 0.05)' :
                  issue.severity === 'Error' ? 'rgba(220, 38, 38, 0.05)' :
                  issue.severity === 'Warning' ? 'rgba(251, 191, 36, 0.05)' : 'rgba(96, 165, 250, 0.05)';

                return (
                  <div 
                    key={index} 
                    style={{ 
                      background: 'rgba(255,255,255,0.02)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: 6, 
                      padding: 14,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ 
                          fontSize: '0.7rem', 
                          fontWeight: 700, 
                          color: badgeColor, 
                          background: badgeBg, 
                          border: `1px solid ${badgeColor}22`,
                          borderRadius: 4,
                          padding: '2px 6px'
                        }}>
                          {issue.severity}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          [{issue.category}]
                        </span>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                          {issue.rule}
                        </span>
                      </div>
                      
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        NS: <span style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>{issue.namespace}</span>
                      </div>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {issue.message}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.02)', paddingTop: 6 }}>
                      <div>
                        Resource: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{issue.resource}</span>
                      </div>
                      
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', maxWidth: '60%', textAlign: 'right' }}>
                        💡 <strong>Recommendation:</strong> {
                          issue.rule === 'No CPU/Memory Limit' ? 'Add resources.limits to the container spec' :
                          issue.rule === 'No CPU/Memory Request' ? 'Add resources.requests to the container spec' :
                          issue.rule === 'Privileged Container' ? 'Set securityContext.privileged to false' :
                          issue.rule === 'Privilege Escalation Allowed' ? 'Set securityContext.allowPrivilegeEscalation to false' :
                          issue.rule === 'Running as Root' ? 'Configure runAsNonRoot: true in securityContext' :
                          issue.rule === 'Plaintext Secret in Env' ? 'Store secret values in Kubernetes Secrets and reference using valueFrom.secretKeyRef' :
                          issue.rule === 'Host Network Shared' ? 'Remove hostNetwork: true from pod spec' :
                          issue.rule === 'Host PID Shared' ? 'Remove hostPID: true from pod spec' :
                          issue.rule === 'Host IPC Shared' ? 'Remove hostIPC: true from pod spec' :
                          issue.rule === 'HostPath Volume Mounted' ? 'Use persistent volume claims (PVC) or local volumes instead of hostPath' :
                          issue.rule === 'Single Replica Deployment' ? 'Set replicas to 2 or more' :
                          issue.rule === 'Missing Probes' ? 'Add livenessProbe and readinessProbe to verify container health' :
                          issue.rule === 'Service Lacks Matching Pods' ? 'Correct selector labels to match running pod labels' :
                          issue.rule === 'Pod Missing NetworkPolicy' ? 'Create a NetworkPolicy targeting this pod to restrict ingress/egress traffic' :
                          issue.rule === 'Overprivileged ServiceAccount' ? 'Follow principle of least privilege: restrict verbs and resources in bound Role/ClusterRole' :
                          issue.rule === 'Namespace Missing ResourceQuota' ? 'Create a ResourceQuota in the namespace to prevent resource starvation' :
                          issue.rule === 'Namespace Missing LimitRange' ? 'Create a LimitRange in the namespace to define default container requests/limits' :
                          issue.rule === 'Deprecated API Version' ? 'Upgrade the apiVersion in resource manifest to the recommended alternative' : 'Verify spec settings'
                        }
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderZarfCredsView = () => {
    return (
      <div className="zarf-creds-view animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
        {/* Credentials Card */}
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Registry & Cluster Credentials</h3>
            <button className="btn btn-icon" onClick={fetchZarfCreds} disabled={isFetchingZarfCreds}>
              <RefreshCw size={14} />
            </button>
          </div>

          {isFetchingZarfCreds ? (
            <div style={{ color: 'var(--text-muted)', padding: '20px 0', textAlign: 'center' }}>
              Querying Zarf credentials...
            </div>
          ) : zarfCreds.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>
              No credentials found. Ensure Zarf is initialized in this cluster.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="crd-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Application</th>
                    <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Username</th>
                    <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Password</th>
                    <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {zarfCreds.map((c: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, fontSize: '0.85rem' }}>{c.application}</td>
                      <td style={{ padding: '8px 12px', fontSize: '0.85rem' }}>{c.username}</td>
                      <td style={{ padding: '8px 12px', fontSize: '0.85rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>••••••••</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <button 
                          className="btn" 
                          style={{ padding: '2px 8px', fontSize: '0.75rem' }} 
                          onClick={() => {
                            navigator.clipboard.writeText(c.password);
                            alert(`Copied password for ${c.application} to clipboard!`);
                          }}
                        >
                          <Copy size={12} /> Password
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Maintenance card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Zarf Maintenance</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4', marginBottom: 16 }}>
              Clear the cache directory of Zarf tools. This removes downloaded repository caches, compressed package images, and incomplete tars to free up host disk space.
            </p>
            <button 
              className="btn btn-danger" 
              style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}
              onClick={handleClearZarfCache}
              disabled={isClearingZarfCache}
            >
              <Trash2 size={14} /> 
              {isClearingZarfCache ? 'Clearing Cache...' : 'Clear Zarf Local Cache'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPodFilesTab = () => {
    if (!modal) return null;
    
    const handleNavigateUp = () => {
      if (currentDirPath === '/') return;
      const parts = currentDirPath.split('/').filter(Boolean);
      parts.pop();
      const parentPath = '/' + parts.join('/') + (parts.length > 0 ? '/' : '');
      fetchPodFilesList(parentPath);
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Path:</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-main)', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '4px 8px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentDirPath}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input 
              type="file" 
              id="pod-file-upload-input" 
              style={{ display: 'none' }} 
              onChange={handleUploadPodFile} 
            />
            <button className="btn" onClick={() => document.getElementById('pod-file-upload-input')?.click()} disabled={podFileUploadProgress >= 0}>
              Upload File
            </button>
            <button className="btn" onClick={handleCreatePodFolder}>
              New Folder
            </button>
            <button className="btn btn-icon" onClick={() => fetchPodFilesList(currentDirPath)} disabled={isListingFiles}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {podFileUploadProgress >= 0 && (
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>Uploading: {podFileUploadName}</span>
              <span>{podFileUploadProgress}%</span>
            </div>
            <div className="metric-bar-wrapper" style={{ margin: 0 }}>
              <div className="metric-bar-fill normal" style={{ width: `${podFileUploadProgress}%` }}></div>
            </div>
          </div>
        )}

        <div className="terminal-container" style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
          {isListingFiles ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div className="loader" style={{ margin: '0 auto 10px auto', width: 24, height: 24 }}></div>
              Reading directory contents...
            </div>
          ) : (
            <table className="crd-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.1)' }}>
                  <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Name</th>
                  <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.75rem', width: 80 }}>Type</th>
                  <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.75rem', width: 100, textAlign: 'right' }}>Size</th>
                  <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.75rem', width: 140 }}>Modified</th>
                  <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.75rem', width: 100, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentDirPath !== '/' && (
                  <tr 
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', cursor: 'pointer' }}
                    onClick={handleNavigateUp}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '6px 12px', fontWeight: 600, color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>📁 ..</span>
                    </td>
                    <td style={{ padding: '6px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Parent Dir</td>
                    <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.8rem' }}>--</td>
                    <td style={{ padding: '6px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>--</td>
                    <td style={{ padding: '6px 12px', textAlign: 'right' }}></td>
                  </tr>
                )}

                {podFiles.length === 0 && currentDirPath === '/' ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No files found.
                    </td>
                  </tr>
                ) : (
                  podFiles.map(file => (
                    <tr 
                      key={file.name} 
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td 
                        style={{ padding: '8px 12px', fontWeight: 500, cursor: file.isDir ? 'pointer' : 'default', color: file.isDir ? 'var(--accent-green)' : 'var(--text-main)' }}
                        onClick={() => {
                          if (file.isDir) {
                            fetchPodFilesList(currentDirPath + file.name + '/');
                          }
                        }}
                      >
                        {file.isDir ? `📁 ${file.name}` : `📄 ${file.name}`}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {file.isDir ? 'Folder' : file.isLink ? 'Symlink' : 'File'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '0.8rem' }}>
                        {file.isDir ? '--' : `${(file.size / 1024).toFixed(1)} KB`}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {file.date}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          {!file.isDir && (
                            <button 
                              className="btn" 
                              style={{ padding: '2px 6px', fontSize: '0.7rem', color: 'var(--accent-cyan)' }} 
                              onClick={() => handleEditPodFile(file.name)}
                            >
                              Edit
                            </button>
                          )}
                          <button 
                            className="btn" 
                            style={{ padding: '2px 6px', fontSize: '0.7rem' }} 
                            onClick={() => handleDownloadPodFile(file.name, file.isDir)}
                          >
                            Download
                          </button>
                          <button 
                            className="btn btn-danger" 
                            style={{ padding: '2px 6px', fontSize: '0.7rem' }} 
                            onClick={() => handleDeletePodFile(file.name, file.isDir)}
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
          <div 
            className="nav-section-title" 
            onClick={() => toggleSection('cluster')}
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
          >
            <span>Cluster</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['cluster'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
          </div>
          {!collapsedSections['cluster'] && (
            <nav className="nav-menu">
              <a className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveTab('dashboard'); setSearch(''); }}><SlidersHorizontal size={16} /> Dashboard</a>
              <a className={`nav-item ${activeTab === 'topology' ? 'active' : ''}`} onClick={() => { setActiveTab('topology'); setSearch(''); }}><Activity size={16} /> Topology</a>
              <a className={`nav-item ${activeTab === 'nodes' ? 'active' : ''}`} onClick={() => { setActiveTab('nodes'); setSearch(''); }}><Server size={16} /> Nodes</a>
              <a className={`nav-item ${activeTab === 'events' ? 'active' : ''}`} onClick={() => { setActiveTab('events'); setSearch(''); }}><List size={16} /> Events</a>
            </nav>
          )}
        </div>

        <div className="nav-section">
          <div 
            className="nav-section-title" 
            onClick={() => toggleSection('security')}
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
          >
            <span>Security</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['security'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
          </div>
          {!collapsedSections['security'] && (
            <nav className="nav-menu">
              <a className={`nav-item ${activeTab === 'cluster-auditor' ? 'active' : ''}`} onClick={() => { setActiveTab('cluster-auditor'); setSearch(''); }}><Shield size={16} /> Cluster Auditor</a>
              <a className={`nav-item ${activeTab === 'image-scanner' ? 'active' : ''}`} onClick={() => { setActiveTab('image-scanner'); setSearch(''); }}><Shield size={16} style={{ color: '#60a5fa' }} /> Image Scanner</a>
            </nav>
          )}
        </div>

        <div className="nav-section">
          <div 
            className="nav-section-title" 
            onClick={() => toggleSection('workloads')}
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
          >
            <span>Workloads</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['workloads'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
          </div>
          {!collapsedSections['workloads'] && (
            <nav className="nav-menu">
              <a className={`nav-item ${activeTab === 'pods' ? 'active' : ''}`} onClick={() => { setActiveTab('pods'); setSearch(''); }}><Box size={16} /> Pods</a>
              <a className={`nav-item ${activeTab === 'deployments' ? 'active' : ''}`} onClick={() => { setActiveTab('deployments'); setSearch(''); }}><Layers size={16} /> Deployments</a>
              <a className={`nav-item ${activeTab === 'jobs' ? 'active' : ''}`} onClick={() => { setActiveTab('jobs'); setSearch(''); }}><Activity size={16} /> Jobs</a>
              <a className={`nav-item ${activeTab === 'cronjobs' ? 'active' : ''}`} onClick={() => { setActiveTab('cronjobs'); setSearch(''); }}><RefreshCw size={16} /> CronJobs</a>
            </nav>
          )}
        </div>

        <div className="nav-section">
          <div 
            className="nav-section-title" 
            onClick={() => toggleSection('network')}
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
          >
            <span>Network</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['network'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
          </div>
          {!collapsedSections['network'] && (
            <nav className="nav-menu">
              <a className={`nav-item ${activeTab === 'services' ? 'active' : ''}`} onClick={() => { setActiveTab('services'); setSearch(''); }}><GitCommit size={16} /> Services</a>
              <a className={`nav-item ${activeTab === 'ingresses' ? 'active' : ''}`} onClick={() => { setActiveTab('ingresses'); setSearch(''); }}><Shield size={16} /> Ingresses</a>
            </nav>
          )}
        </div>

        <div className="nav-section">
          <div 
            className="nav-section-title" 
            onClick={() => toggleSection('config')}
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
          >
            <span>Config</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['config'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
          </div>
          {!collapsedSections['config'] && (
            <nav className="nav-menu">
              <a className={`nav-item ${activeTab === 'configmaps' ? 'active' : ''}`} onClick={() => { setActiveTab('configmaps'); setSearch(''); }}><FileText size={16} /> ConfigMaps</a>
              <a className={`nav-item ${activeTab === 'secrets' ? 'active' : ''}`} onClick={() => { setActiveTab('secrets'); setSearch(''); }}><Key size={16} /> Secrets</a>
            </nav>
          )}
        </div>

        <div className="nav-section">
          <div 
            className="nav-section-title" 
            onClick={() => toggleSection('storage')}
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
          >
            <span>Storage</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['storage'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
          </div>
          {!collapsedSections['storage'] && (
            <nav className="nav-menu">
              <a className={`nav-item ${activeTab === 'persistentvolumes' ? 'active' : ''}`} onClick={() => { setActiveTab('persistentvolumes'); setSearch(''); }}><Database size={16} /> PVs</a>
              <a className={`nav-item ${activeTab === 'persistentvolumeclaims' ? 'active' : ''}`} onClick={() => { setActiveTab('persistentvolumeclaims'); setSearch(''); }}><Database size={16} /> PVCs</a>
            </nav>
          )}
        </div>

        <div className="nav-section">
          <div 
            className="nav-section-title" 
            onClick={() => toggleSection('helm')}
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
          >
            <span>Helm</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['helm'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
          </div>
          {!collapsedSections['helm'] && (
            <nav className="nav-menu">
              <a className={`nav-item ${activeTab === 'helm' ? 'active' : ''}`} onClick={() => { setActiveTab('helm'); setSearch(''); }}><Package size={16} /> Helm Releases</a>
              <a className={`nav-item ${activeTab === 'helm-install' ? 'active' : ''}`} onClick={() => { setActiveTab('helm-install'); setSearch(''); }}><ArrowDown size={16} /> Install Chart</a>
              <a className={`nav-item ${activeTab === 'helm-repos' ? 'active' : ''}`} onClick={() => { setActiveTab('helm-repos'); setSearch(''); }}><Database size={16} /> Repo Manager</a>
            </nav>
          )}
        </div>

        <div className="nav-section">
          <div 
            className="nav-section-title" 
            onClick={() => toggleSection('zarf')}
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
          >
            <span>Zarf</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['zarf'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
          </div>
          {!collapsedSections['zarf'] && (
            <nav className="nav-menu">
              <a className={`nav-item ${activeTab === 'zarf' ? 'active' : ''}`} onClick={() => { setZarfViewMode('packages'); setActiveTab('zarf'); setSearch(''); }}><Package size={16} /> Deployed Packages</a>
              <a className={`nav-item ${activeTab === 'zarf-deploy' ? 'active' : ''}`} onClick={() => { setZarfViewMode('local'); setActiveTab('zarf-deploy'); setSearch(''); }}><Save size={16} /> Deploy Zarf Package</a>
              <a className={`nav-item ${activeTab === 'zarf-registry' ? 'active' : ''}`} onClick={() => { setActiveTab('zarf-registry'); setSearch(''); }}><Database size={16} /> Zarf Registry</a>
              <a className={`nav-item ${activeTab === 'zarf-creds' ? 'active' : ''}`} onClick={() => { setActiveTab('zarf-creds'); setSearch(''); }}><Key size={16} /> Zarf Credentials</a>
              <a className={`nav-item ${activeTab === 'zarf-sbom' ? 'active' : ''}`} onClick={() => { setActiveTab('zarf-sbom'); setSearch(''); }}><Shield size={16} /> Zarf SBOMs</a>
              <a className={`nav-item ${activeTab === 'zarf-state' ? 'active' : ''}`} onClick={() => { setActiveTab('zarf-state'); setSearch(''); }}><Settings size={16} /> Zarf State & Config</a>
            </nav>
          )}
        </div>

        <div className="nav-section">
          <div 
            className="nav-section-title" 
            onClick={() => toggleSection('custom')}
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
          >
            <span>Custom Resources</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['custom'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
          </div>
          {!collapsedSections['custom'] && (
            <nav className="nav-menu">
              <a className={`nav-item ${activeTab === 'crds' ? 'active' : ''}`} onClick={() => { setActiveTab('crds'); setSearch(''); }}><Code size={16} /> CRD Explorer</a>
              <a className={`nav-item ${activeTab === 'custom' && customCrd?.name === 'helmcharts.helm.cattle.io' ? 'active' : ''}`} onClick={() => { setCustomCrd({ group: 'helm.cattle.io', version: 'v1', plural: 'helmcharts', name: 'helmcharts.helm.cattle.io' }); setActiveTab('custom'); setSearch(''); }}><Code size={16} /> K3s HelmCharts</a>
              <a className={`nav-item ${activeTab === 'custom' && customCrd?.name === 'helmchartconfigs.helm.cattle.io' ? 'active' : ''}`} onClick={() => { setCustomCrd({ group: 'helm.cattle.io', version: 'v1', plural: 'helmchartconfigs', name: 'helmchartconfigs.helm.cattle.io' }); setActiveTab('custom'); setSearch(''); }}><Code size={16} /> K3s ChartConfigs</a>
            </nav>
          )}
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
            {contexts.length > 0 && (
              <select 
                className="select-ns" 
                style={{ 
                  marginRight: 4, 
                  background: 'rgba(96, 165, 250, 0.08)', 
                  color: '#60a5fa', 
                  borderColor: 'rgba(96, 165, 250, 0.25)',
                  fontWeight: 500
                }}
                value={currentContext} 
                onChange={e => handleContextChange(e.target.value)}
                title="Kubernetes Context"
              >
                {contexts.map(c => <option key={c.name} value={c.name} style={{ background: '#0a0a0a', color: '#fff' }}>{c.name}</option>)}
              </select>
            )}
            {activeTab !== 'nodes' && activeTab !== 'persistentvolumes' && (
              <select className="select-ns" value={selectedNs} onChange={e => setSelectedNs(e.target.value)}>
                {namespaces.map(ns => <option key={ns} value={ns}>{ns === 'all' ? 'All Namespaces' : ns}</option>)}
              </select>
            )}
            <button 
              className={`btn btn-icon ${hasNewAlerts ? 'pulse-error' : ''}`}
              style={{ position: 'relative' }}
              onClick={() => {
                setIsAlertsDrawerOpen(true);
                setHasNewAlerts(false);
              }}
              title="Cluster Pulse Alerts"
            >
              <Bell size={16} />
              {pulseAlerts.filter(a => a.type === 'Warning').length > 0 && (
                <span 
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    background: 'var(--accent-red)',
                    color: 'white',
                    borderRadius: '50%',
                    width: 14,
                    height: 14,
                    fontSize: '0.65rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold'
                  }}
                >
                  {pulseAlerts.filter(a => a.type === 'Warning').length}
                </span>
              )}
            </button>
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
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('nodes')} title="View Nodes">
              <div className="stat-icon"><Server size={24}/></div>
              <div className="stat-info">
                <span className="stat-value">{stats.nodes}</span>
                <span className="stat-label">Total Nodes</span>
              </div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('pods')} title="View Pods">
              <div className="stat-icon"><Box size={24}/></div>
              <div className="stat-info">
                <span className="stat-value">{stats.pods}</span>
                <span className="stat-label">Active Pods</span>
              </div>
            </div>
            <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('deployments')} title="View Deployments">
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
                  : activeTab === 'helm-install'
                  ? 'Install Chart'
                  : activeTab === 'helm-repos'
                  ? 'Repo Manager'
                  : activeTab === 'zarf' 
                  ? 'Deployed Packages'
                  : activeTab === 'zarf-state'
                  ? 'Zarf State & Config'
                  : activeTab === 'zarf-deploy'
                  ? 'Deploy Zarf Package'
                  : activeTab === 'zarf-registry'
                  ? 'Zarf Registry'
                  : activeTab === 'zarf-creds'
                  ? 'Zarf Credentials'
                  : activeTab === 'zarf-sbom'
                  ? 'Zarf SBOMs'
                  : activeTab === 'image-scanner'
                  ? 'Security Image Scanner'
                  : activeTab === 'cluster-auditor'
                  ? 'Cluster Auditor'
                  : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </h1>
              <div className="subtitle">
                {activeTab === 'topology' 
                  ? `Visualizing cluster relationships in ${selectedNs}` 
                  : activeTab === 'zarf'
                  ? 'Manage in-cluster deployed Zarf packages'
                  : activeTab === 'zarf-state'
                  ? 'Inspect initialized Zarf cluster settings and configurations'
                  : activeTab === 'zarf-deploy'
                  ? 'Upload, compress/decompress, and deploy local package archives'
                  : activeTab === 'zarf-registry'
                  ? 'Manage containers and tag images inside the in-cluster registry'
                  : activeTab === 'zarf-creds'
                  ? 'Inspect and connect to Zarf cluster services'
                  : activeTab === 'zarf-sbom'
                  ? 'Extract CycloneDX package reports from local Zarf packages'
                  : activeTab === 'image-scanner'
                  ? 'Real-time cluster container vulnerability & package registry scanning'
                  : activeTab === 'cluster-auditor'
                  ? 'Scan cluster resources for security vulnerabilities, configuration errors, and best practices'
                  : activeTab === 'helm-install'
                  ? 'Install Helm charts from configured repositories'
                  : activeTab === 'helm-repos'
                  ? 'Configure and manage Helm chart repositories'
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
              <button className="btn btn-primary" onClick={() => setActiveTab('helm-install')}>
                <Package size={16} /> Install Chart
              </button>
            )}
            {activeTab === 'zarf' && zarfStatus.installed && (
              <button className="btn btn-primary" onClick={() => setActiveTab('zarf-deploy')}>
                <Package size={16} /> Deploy Zarf Package
              </button>
            )}
          </div>

          {loading ? (
            <div className="loader-container"><div className="loader"></div></div>
          ) : activeTab === 'topology' ? (
            renderTopologyView()
          ) : activeTab === 'zarf' ? (
            renderZarfPackagesView()
          ) : activeTab === 'zarf-state' ? (
            renderZarfStateView()
          ) : activeTab === 'zarf-deploy' ? (
            renderZarfDeployView()
          ) : activeTab === 'zarf-registry' ? (
            renderZarfRegistryView()
          ) : activeTab === 'zarf-creds' ? (
            renderZarfCredsView()
          ) : activeTab === 'zarf-sbom' ? (
            renderZarfSbomView()
          ) : activeTab === 'image-scanner' ? (
            renderImageScannerView()
          ) : activeTab === 'cluster-auditor' ? (
            renderClusterAuditorView()
          ) : activeTab === 'helm' ? (
            renderHelmReleasesView()
          ) : activeTab === 'helm-install' ? (
            renderHelmInstallView()
          ) : activeTab === 'helm-repos' ? (
            renderHelmReposView()
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
                                title="Click to filter by this label"
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
                                  title="View logs"
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
                                  title="Open Console"
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
                          const metric = podMetrics.find(pm => pm.metadata.name === res.metadata.name && pm.metadata.namespace === res.metadata.namespace);
                          if (!metric) return null;
                          let cpuUsage = 0;
                          let memUsage = 0;
                          metric.containers?.forEach((c: any) => {
                            cpuUsage += parseCpu(c.usage?.cpu || '0');
                            memUsage += parseMem(c.usage?.memory || '0');
                          });
                          const key = `${res.metadata.namespace}/${res.metadata.name}`;
                          const history = podMetricsHistory[key];
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
                          disabled={
                            establishingPortForward === res.metadata.name ||
                            (res.spec?.type !== 'NodePort' && 
                             !(res.spec?.type === 'LoadBalancer' && res.status?.loadBalancer?.ingress?.length > 0) &&
                             !associatedPods.some(p => p.status?.phase?.toLowerCase() === 'running' && matchesSelector(p.metadata?.labels, res.spec?.selector)))
                          }
                          title="Port-forward and open in browser"
                        >
                          <Globe size={12} /> {establishingPortForward === res.metadata.name ? 'Connecting...' : 'Website'} <ExternalLink size={10} style={{ marginLeft: 4 }} />
                        </button>
                      )}

                      {activeTab === 'pods' && (
                        <>
                          <button 
                            className="btn btn-sm"
                            style={{ 
                              background: 'rgba(96, 165, 250, 0.08)',
                              color: 'var(--accent-cyan)',
                              borderColor: 'rgba(96, 165, 250, 0.25)' 
                            }}
                            onClick={(e) => { 
                              e.stopPropagation();
                              handleOpenDiagnostics(res.metadata.name, res.metadata.namespace);
                            }}
                          >
                            🩺 Diagnose
                          </button>
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
                            setCurrentDirPath('/');
                            setModal({ type: 'files', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid });
                          }}>
                            <FileText size={12} /> Files
                          </button>
                          <button className="btn btn-sm" onClick={(e) => { 
                            e.stopPropagation();
                            setModal({ type: 'portforward', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid });
                          }}>
                            <Radio size={12} /> Port Fwd
                          </button>
                          <button className="btn btn-sm" onClick={(e) => { 
                            e.stopPropagation();
                            setSelectedContainer(res.spec?.containers?.[0]?.name || '');
                            setModal({ type: 'logs', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid });
                          }}>
                            <FileText size={12} /> Logs
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
                          <Search size={12} /> View Instances
                        </button>
                      )}

                      {activeTab === 'events' && res.involvedObject && (
                        <button 
                          className="btn btn-sm" 
                          onClick={(e) => {
                            e.stopPropagation();
                            setModal({ 
                              type: 'yaml', 
                              name: res.involvedObject.name, 
                              namespace: res.involvedObject.namespace || 'default', 
                              kind: pluralizeKind(res.involvedObject.kind), 
                              uid: res.involvedObject.uid 
                            });
                          }}
                        >
                          <Search size={12} /> View Resource
                        </button>
                      )}

                      {activeTab !== 'nodes' && activeTab !== 'crds' && activeTab !== 'events' && (
                        <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setModal({ type: 'events', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid }); }}>
                          <Info size={12} /> Describe
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
                ))
              )}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      {/* Cluster Pulse Alerts Drawer */}
      {isAlertsDrawerOpen && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: '400px',
            height: '100%',
            background: 'var(--bg-panel)',
            borderLeft: '1px solid var(--border-color)',
            boxShadow: '-4px 0 20px rgba(0,0,0,0.5)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideInRight 0.3s ease-out'
          }}
        >
          <div 
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(255,255,255,0.01)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Activity size={18} style={{ color: 'var(--accent-cyan)' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Cluster Pulse</h3>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                className="btn btn-sm"
                onClick={() => setPulseAlerts([])}
                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
              >
                Clear All
              </button>
              <button 
                className="btn btn-icon btn-sm" 
                onClick={() => setIsAlertsDrawerOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          
          <div style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Real-time Kubernetes Event Stream
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pulseAlerts.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0', fontSize: '0.9rem' }}>
                No events received yet. Listening for cluster activity...
              </div>
            ) : (
              pulseAlerts.map(alert => (
                <div 
                  key={alert.id}
                  style={{
                    background: 'rgba(255,255,255,0.01)',
                    border: `1px solid ${alert.type === 'Warning' ? 'rgba(239, 68, 68, 0.2)' : 'var(--border-color)'}`,
                    borderRadius: 6,
                    padding: 10,
                    fontSize: '0.8rem',
                    transition: 'background 0.2s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span 
                      style={{ 
                        fontWeight: 600, 
                        color: alert.type === 'Warning' ? 'var(--accent-red)' : 'var(--accent-success)' 
                      }}
                    >
                      {alert.reason}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{alert.timestamp}</span>
                  </div>
                  <div style={{ color: 'var(--text-main)', marginBottom: 6, lineHeight: 1.3 }}>{alert.message}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <span>ns: {alert.namespace} | {alert.resourceKind}/{alert.resourceName}</span>
                    {alert.resourceKind === 'Pod' && (
                      <button 
                        className="btn btn-sm"
                        style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(255,255,255,0.05)' }}
                        onClick={() => {
                          setIsAlertsDrawerOpen(false);
                          handleOpenDiagnostics(alert.resourceName, alert.namespace);
                        }}
                      >
                        🩺 Diagnose
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div 
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 1100,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          pointerEvents: 'none'
        }}
      >
        {toasts.map(toast => (
          <div 
            key={toast.toastId}
            style={{
              pointerEvents: 'auto',
              background: '#180f10',
              borderLeft: '4px solid var(--accent-error)',
              borderTop: '1px solid rgba(239, 68, 68, 0.2)',
              borderRight: '1px solid rgba(239, 68, 68, 0.2)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '0 6px 6px 0',
              padding: '12px 16px',
              width: '320px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              animation: 'slideInRight 0.2s ease-out'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: 'var(--accent-error)', fontSize: '0.85rem' }}>
                ⚠️ Warning Event
              </span>
              <button 
                className="btn btn-icon btn-sm" 
                style={{ minHeight: 'auto', padding: 0, height: 16, width: 16 }}
                onClick={() => setToasts(prev => prev.filter(t => t.toastId !== toast.toastId))}
              >
                <X size={12} />
              </button>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 500, marginBottom: 2 }}>
              {toast.reason}: {toast.resourceKind}/{toast.resourceName}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineBreak: 'anywhere' }}>
              {toast.message.length > 100 ? toast.message.substring(0, 100) + '...' : toast.message}
            </div>
            {toast.resourceKind === 'Pod' && (
              <button 
                className="btn btn-sm btn-primary"
                style={{ fontSize: '0.7rem', padding: '2px 6px', marginTop: 8, width: '100%', display: 'block', textAlign: 'center' }}
                onClick={() => {
                  setToasts(prev => prev.filter(t => t.toastId !== toast.toastId));
                  handleOpenDiagnostics(toast.resourceName, toast.namespace);
                }}
              >
                🩺 Run Pod Diagnostics
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Smart Diagnostics Doctor Modal */}
      {isDiagnosticsModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1200 }} onClick={() => setIsDiagnosticsModalOpen(false)}>
          <div className="modal-content animate-fade-in" style={{ width: '85%', maxWidth: '850px', maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🩺 Smart Diagnostics Doctor</span>
                {podDiagnostics && (
                  <span className={`badge ${podDiagnostics.status === 'Healthy' ? 'ready' : podDiagnostics.status === 'Warning' ? 'pending' : 'failed'}`}>
                    {podDiagnostics.status}
                  </span>
                )}
              </div>
              <button className="btn btn-icon" onClick={() => setIsDiagnosticsModalOpen(false)}><X size={16}/></button>
            </div>
            
            <div className="modal-body" style={{ padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {isFetchingDiagnostics ? (
                <div className="loader-container" style={{ minHeight: '300px', flexDirection: 'column', gap: 12 }}>
                  <div className="loader"></div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Analyzing pod metrics, events, states, and logs...</div>
                </div>
              ) : !podDiagnostics ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No diagnostics data found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  
                  {/* Summary Card */}
                  <div 
                    style={{ 
                      padding: 16, 
                      borderRadius: 8, 
                      background: podDiagnostics.status === 'Healthy' ? 'rgba(16, 185, 129, 0.05)' : podDiagnostics.status === 'Warning' ? 'rgba(245, 166, 35, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                      border: `1px solid ${podDiagnostics.status === 'Healthy' ? 'rgba(16, 185, 129, 0.2)' : podDiagnostics.status === 'Warning' ? 'rgba(245, 166, 35, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                    }}
                  >
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: '#fff' }}>Diagnostics Summary</h4>
                    <p style={{ fontSize: '0.9rem', lineHeight: 1.4, color: 'var(--text-main)' }}>{podDiagnostics.summary}</p>
                  </div>

                  {/* Details / Action Items */}
                  {podDiagnostics.details && podDiagnostics.details.length > 0 && (
                    <div>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#fff' }}>Heuristic Findings & Root Cause Analysis</h4>
                      <ul style={{ paddingLeft: 20, margin: 0, fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: 6, lineHeight: 1.4 }}>
                        {podDiagnostics.details.map((detail: string, idx: number) => (
                          <li key={idx} style={{ color: 'var(--text-main)' }}>{detail}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Recent Pod Events */}
                  <div>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#fff' }}>Related Kubernetes Events</h4>
                    {podDiagnostics.events && podDiagnostics.events.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {podDiagnostics.events.map((e: any, idx: number) => (
                          <div 
                            key={idx} 
                            style={{ 
                              background: 'rgba(255,255,255,0.01)', 
                              border: '1px solid var(--border-color)', 
                              borderRadius: 4, 
                              padding: '8px 12px', 
                              fontSize: '0.75rem', 
                              display: 'flex', 
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: 600, color: e.type === 'Warning' ? 'var(--accent-error)' : 'var(--accent-success)', marginRight: 8 }}>{e.reason}</span>
                              <span style={{ color: 'var(--text-main)' }}>{e.message}</span>
                            </div>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>x{e.count}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No relevant events found in the namespace for this pod.</div>
                    )}
                  </div>

                  {/* Diagnostic Logs Tail */}
                  {podDiagnostics.logTail && (
                    <div>
                      <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#fff' }}>Failing Container Logs (Tail)</h4>
                      <div className="diagnostics-log-tail">
                        {podDiagnostics.logTail}
                      </div>
                    </div>
                  )}
                  
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setIsDiagnosticsModalOpen(false)}>
                Close Diagnostics
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-Container File Editor Modal */}
      {isEditingFileModalOpen && editingFile && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-content animate-fade-in" style={{ width: '80%', maxWidth: '850px', height: '80vh' }}>
            <div className="modal-header">
              <div className="modal-title">
                Edit File: {editingFile.path}
              </div>
              <button className="btn btn-icon" onClick={() => { setIsEditingFileModalOpen(false); setEditingFile(null); }}><X size={16}/></button>
            </div>
            <div className="modal-body" style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <textarea
                style={{
                  width: '100%',
                  height: '100%',
                  flex: 1,
                  background: '#050505',
                  color: '#e6edf3',
                  border: '1px solid var(--border-color)',
                  borderRadius: 6,
                  padding: 12,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                  lineHeight: '1.4',
                  outline: 'none',
                  resize: 'none'
                }}
                value={editingFile.content}
                onChange={e => setEditingFile({ ...editingFile, content: e.target.value })}
                disabled={editingFile.isSaving}
              />
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => { setIsEditingFileModalOpen(false); setEditingFile(null); }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSavePodFile} disabled={editingFile.isSaving}>
                {editingFile.isSaving ? 'Saving...' : <><Save size={14}/> Save Changes</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {isPackageDetailModalOpen && selectedZarfPackageDetail && (
        <div className="modal-overlay" onClick={() => setIsPackageDetailModalOpen(false)}>
          <div className="modal-content animate-fade-in" style={{ width: '80%', maxWidth: '900px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                Inspect Deployed Package: {selectedZarfPackageDetail.name}
              </div>
              <button className="btn btn-icon" onClick={() => setIsPackageDetailModalOpen(false)}><X size={16}/></button>
            </div>
            <div className="modal-tabs">
              <div 
                className={`modal-tab ${zarfDetailActiveTab === 'overview' ? 'active' : ''}`}
                onClick={() => setZarfDetailActiveTab('overview')}
              >
                <Package size={14}/> Overview
              </div>
              <div 
                className={`modal-tab ${zarfDetailActiveTab === 'config' ? 'active' : ''}`}
                onClick={() => setZarfDetailActiveTab('config')}
              >
                <Code size={14}/> Config YAML
              </div>
              {selectedZarfPackageDetail.data?.variables && selectedZarfPackageDetail.data.variables.length > 0 && (
                <div 
                  className={`modal-tab ${zarfDetailActiveTab === 'variables' ? 'active' : ''}`}
                  onClick={() => setZarfDetailActiveTab('variables')}
                >
                  <SlidersHorizontal size={14}/> Variables
                </div>
              )}
            </div>
            <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto', padding: 20 }}>
              {zarfDetailActiveTab === 'overview' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Meta Details */}
                  <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 16 }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: 'var(--text-main)' }}>Package Information</h4>
                    <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      <strong>Description:</strong> {selectedZarfPackageDetail.data?.metadata?.description || 'No description provided.'}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: '0.85rem' }}>
                      <div><strong>Version:</strong> <span style={{ color: 'var(--text-main)' }}>{selectedZarfPackageDetail.data?.metadata?.version || 'N/A'}</span></div>
                      <div><strong>Architecture:</strong> <span style={{ color: 'var(--text-main)' }}>{selectedZarfPackageDetail.data?.metadata?.architecture || 'N/A'}</span></div>
                      <div><strong>Zarf Version:</strong> <span style={{ color: 'var(--text-main)' }}>{selectedZarfPackageDetail.cliVersion || 'N/A'}</span></div>
                    </div>
                  </div>

                  {/* Components */}
                  <div>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem' }}>Components & Charts</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {(selectedZarfPackageDetail.data?.components || []).map((comp: any) => {
                        const deployedStatus = (selectedZarfPackageDetail.deployedComponents || []).find((c: any) => c.name === comp.name);
                        return (
                          <div 
                            key={comp.name} 
                            style={{ 
                              background: 'rgba(255,255,255,0.02)', 
                              border: '1px solid var(--border-color)', 
                              borderRadius: 6, 
                              padding: 12 
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                                {comp.name} {comp.required && <span style={{ color: 'var(--accent-red)', fontSize: '0.75rem', fontWeight: 'normal' }}>(Required)</span>}
                              </div>
                              <span 
                                className={`badge ${deployedStatus?.status?.toLowerCase() === 'succeeded' ? 'ready' : 'warning'}`}
                                style={{ fontSize: '0.75rem', textTransform: 'none' }}
                              >
                                {deployedStatus?.status || 'Unknown'}
                              </span>
                            </div>
                            {comp.description && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                                {comp.description}
                              </div>
                            )}
                            
                            {/* Charts */}
                            {comp.charts && comp.charts.length > 0 && (
                              <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: '2px solid var(--accent-blue)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Helm Charts:</div>
                                {comp.charts.map((chart: any) => (
                                  <div key={chart.name} style={{ fontSize: '0.8rem', display: 'flex', gap: 8 }}>
                                    <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>{chart.name}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>({chart.version})</span>
                                    <span style={{ color: 'var(--text-muted)' }}>in namespace {chart.namespace}</span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Images */}
                            {comp.images && comp.images.length > 0 && (
                              <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: '2px solid var(--accent-cyan)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Container Images:</div>
                                {comp.images.map((img: string) => (
                                  <div key={img} style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-main)', wordBreak: 'break-all' }}>
                                    {img}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : zarfDetailActiveTab === 'config' ? (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                    Raw Deployed zarf.yaml Package Configuration
                  </div>
                  <textarea 
                    readOnly 
                    style={{ width: '100%', height: '350px', background: '#050505', border: '1px solid var(--border-color)', borderRadius: 6, padding: 12, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--accent-cyan)', outline: 'none' }}
                    value={jsonToYaml(selectedZarfPackageDetail.data)}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>Deployed Variables</h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Name</th>
                        <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Description</th>
                        <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Default</th>
                        <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Prompt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedZarfPackageDetail.data?.variables || []).map((v: any) => (
                        <tr key={v.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{v.name}</td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{v.description || 'N/A'}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)' }}>{String(v.default ?? 'N/A')}</td>
                          <td style={{ padding: '8px 12px' }}>{v.prompt ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
              {((modal.kind === 'helm' ? ['yaml', 'events', 'history', 'values'] : ['yaml', 'events']) as ModalType[])
                .concat(modal.kind === 'pods' ? ['logs', 'terminal', 'portforward', 'files'] : [])
                .map(t => (
                  <div 
                    key={t}
                    className={`modal-tab ${modal.type === t ? 'active' : ''}`}
                    onClick={() => {
                      if (t === 'files') {
                        setCurrentDirPath('/');
                      }
                      setModal({ ...modal, type: t });
                    }}
                  >
                    {t === 'yaml' && <Settings size={14}/>}
                    {t === 'events' && <Info size={14}/>}
                    {t === 'logs' && <FileText size={14}/>}
                    {t === 'terminal' && <Terminal size={14}/>}
                    {t === 'portforward' && <Radio size={14}/>}
                    {t === 'history' && <Activity size={14}/>}
                    {t === 'files' && <FileText size={14}/>}
                    {t === 'values' && <SlidersHorizontal size={14}/>}
                    {t === 'terminal' ? 'Console' : t === 'portforward' ? 'Port Forward' : t === 'events' && modal.kind === 'helm' ? 'Status' : t === 'values' ? 'Values' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </div>
                ))}
            </div>
 
            <div className="modal-body">
              {modal.type === 'files' ? (
                renderPodFilesTab()
              ) : modalData === null ? (
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
                      ref={cmdInputRef}
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
                ) : selectedRevisionValues ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, overflow: 'hidden', height: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <button className="btn btn-sm" onClick={() => setSelectedRevisionValues(null)}>
                        ← Back to History
                      </button>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        Comparing Revision #{selectedRevisionValues.revision} with Deployed Values
                      </span>
                    </div>
                    {renderDiffView()}
                  </div>
                ) : (
                  <div className="history-container" style={{ overflowY: 'auto', maxHeight: '400px', padding: 16 }}>
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
                                <div style={{ display: 'inline-flex', gap: 6, float: 'right' }}>
                                  <button 
                                    className="btn btn-sm" 
                                    style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                                    onClick={() => handleInspectRevisionValues(modal.namespace, modal.name, rev.revision)}
                                    disabled={isLoadingRevisionValues}
                                  >
                                    Compare
                                  </button>
                                  <button 
                                    className="btn btn-primary btn-sm" 
                                    style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                                    onClick={() => handleRollback(modal.namespace, modal.name, rev.revision)}
                                  >
                                    Rollback
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
              ) : modal.type === 'values' ? (
                modalData === null ? (
                  <div className="loader-container"><div className="loader"></div></div>
                ) : (
                  <div className="editor-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 16 }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                      Deployed User-Defined Values Configuration (Editable - click Save & Upgrade below)
                    </div>
                    <textarea 
                      className="editor-textarea" 
                      value={helmValuesEdit}
                      onChange={(e) => setHelmValuesEdit(e.target.value)}
                      style={{ height: '350px', width: '100%', border: '1px solid var(--border-color)', borderRadius: 6, background: '#050505', color: '#60a5fa', padding: 16, fontFamily: 'var(--font-mono)', outline: 'none' }}
                    />
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
            
            {modal.type === 'values' && (
              <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button 
                  className="btn btn-primary" 
                  onClick={async () => {
                    setIsSavingHelmValues(true);
                    try {
                      const res = await fetch(`/api/helm/${modal.namespace}/${modal.name}/upgrade`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ valuesYaml: helmValuesEdit })
                      });
                      const data = await res.json();
                      if (res.ok) {
                        alert('Helm release upgraded successfully!');
                        fetchModalData('values');
                      } else {
                        alert('Upgrade failed: ' + (data.error || 'Unknown error'));
                      }
                    } catch (err: any) {
                      alert('Error upgrading Helm release: ' + err.message);
                    } finally {
                      setIsSavingHelmValues(false);
                    }
                  }} 
                  disabled={isSavingHelmValues}
                >
                  <Save size={16}/> {isSavingHelmValues ? 'Upgrading...' : 'Save & Upgrade'}
                </button>
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

                // Contexts
                ...contexts.map(c => ({
                  name: `Switch Context: ${c.name}`,
                  category: 'Contexts',
                  action: () => { handleContextChange(c.name); setIsCmdPaletteOpen(false); }
                })),

                // Security & Scans
                { name: 'Open Cluster Auditor', category: 'Security & Scans', action: () => { setActiveTab('cluster-auditor'); setIsCmdPaletteOpen(false); } },
                { name: 'Open Image Scanner', category: 'Security & Scans', action: () => { setActiveTab('image-scanner'); setIsCmdPaletteOpen(false); } },
                { name: 'Scan All Running Images', category: 'Security & Scans', action: () => { fetchRunningImagesAndScan(); setIsCmdPaletteOpen(false); } },

                // Actions
                { name: 'Refresh Active Tab View', category: 'Commands', action: () => { fetchResources(); setIsCmdPaletteOpen(false); } },
                { name: 'Clear Active Search Filter', category: 'Commands', action: () => { setSearch(''); setIsCmdPaletteOpen(false); } }
              ];

              const filtered = items.filter(item => 
                item.name.toLowerCase().includes(cmdPaletteSearch.toLowerCase()) ||
                item.category.toLowerCase().includes(cmdPaletteSearch.toLowerCase())
              );

              // Group by category
              const groups: { [key: string]: typeof items } = {};
              filtered.forEach(item => {
                if (!groups[item.category]) groups[item.category] = [];
                groups[item.category].push(item);
              });

              return (
                <>
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
                      onChange={e => { setCmdPaletteSearch(e.target.value); setActivePaletteIndex(0); }}
                      onKeyDown={e => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setActivePaletteIndex(prev => Math.min(prev + 1, filtered.length - 1));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setActivePaletteIndex(prev => Math.max(prev - 1, 0));
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          if (filtered[activePaletteIndex]) {
                            filtered[activePaletteIndex].action();
                          }
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setIsCmdPaletteOpen(false);
                        }
                      }}
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
                    {filtered.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>No matches found.</div>
                    ) : (
                      Object.entries(groups).map(([cat, catItems]) => (
                        <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--accent-green)', fontWeight: 600, letterSpacing: '0.5px' }}>{cat}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {catItems.map((item, idx) => {
                              const isSelected = filtered[activePaletteIndex] && item.name === filtered[activePaletteIndex].name && item.category === filtered[activePaletteIndex].category;
                              return (
                                <div
                                  key={idx}
                                  onClick={item.action}
                                  style={{
                                    padding: '8px 12px',
                                    background: isSelected ? 'rgba(57, 255, 20, 0.08)' : 'rgba(255,255,255,0.02)',
                                    border: '1px solid',
                                    borderColor: isSelected ? 'rgba(57, 255, 20, 0.3)' : 'rgba(255,255,255,0.04)',
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
                                    if (!isSelected) {
                                      e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
                                    }
                                  }}
                                >
                                  <span>{item.name}</span>
                                  <span style={{ fontSize: '0.7rem', color: isSelected ? 'var(--accent-green)' : 'var(--text-muted)', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4 }}>
                                    {isSelected ? 'Enter' : 'Select'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              );
            })()}
          </div>
          
          <div 
            style={{
              borderTop: '1px solid rgba(255,255,255,0.08)',
              padding: '10px 16px',
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              display: 'flex',
              justifyContent: 'space-between',
              background: 'rgba(10, 10, 10, 0.95)',
              borderBottomLeftRadius: 6,
              borderBottomRightRadius: 6,
              zIndex: 10
            }}
          >
            <span>Use ↑↓ arrows to navigate, Enter to select</span>
            <span>ESC to close</span>
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
                    setIsDeployZarfModalOpen(false);
                    setZarfDeployForm({ packagePath: '' });
                    startTaskLogsStreaming(data.taskId);
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

      {isTaskLogsModalOpen && (
        <div className="modal-overlay" onClick={() => { if (taskStatus !== 'running') setIsTaskLogsModalOpen(false); }}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 800, height: 500, display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Terminal size={18} />
                <span>Background Deployment Console</span>
                <span className={`badge ${taskStatus === 'running' ? 'badge-running' : taskStatus === 'success' ? 'badge-running' : 'badge-failed'}`} style={{ marginLeft: 8, textTransform: 'uppercase' }}>
                  {taskStatus}
                </span>
              </div>
              <button className="btn btn-icon" onClick={() => setIsTaskLogsModalOpen(false)} disabled={taskStatus === 'running'}>
                <X size={16}/>
              </button>
            </div>
            <div className="modal-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0a0a0a', padding: 16, overflow: 'hidden' }}>
              <div 
                style={{ 
                  flex: 1, 
                  overflowY: 'auto', 
                  fontFamily: 'var(--font-mono)', 
                  fontSize: '0.85rem', 
                  color: '#ededed', 
                  whiteSpace: 'pre-wrap', 
                  wordBreak: 'break-all', 
                  padding: 8 
                }}
                ref={(el) => {
                  if (el) {
                    el.scrollTop = el.scrollHeight;
                  }
                }}
              >
                {taskLogs || 'Initializing task...'}
              </div>
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button 
                className="btn" 
                onClick={() => {
                  if (activeTaskId) {
                    fetch(`/api/tasks/${activeTaskId}`, { method: 'DELETE' }).catch(console.error);
                  }
                  setIsTaskLogsModalOpen(false);
                  setActiveTaskId(null);
                }} 
                disabled={taskStatus === 'running'}
              >
                Close Console
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
