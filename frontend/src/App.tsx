import { useState, useEffect, useRef } from 'react';
import { 
  Box, Layers, Server, Activity, Trash2, Terminal,
  FileText, Shield, Key, GitCommit, RefreshCw, X, Save, Search, Settings, Info, Power, SlidersHorizontal,
  ArrowDown, Copy, Database, Package, Radio, Command, Code, List, Globe, ExternalLink,
  Bell
} from 'lucide-react';
import './index.css';

// Import modular components
import { DashboardView } from './components/DashboardView';
import { TopologyView } from './components/TopologyView';
import { ImageScannerView } from './components/ImageScannerView';
import { KubescapeView } from './components/KubescapeView';
import { HelmManagerView } from './components/HelmManagerView';
import { ZarfManagerView } from './components/ZarfManagerView';
import { PodFilesExplorer } from './components/PodFilesExplorer';
import { LogsView } from './components/LogsView';
import { InteractiveTerminal } from './components/InteractiveTerminal';
import { SecretDecoderPanel } from './components/SecretDecoderPanel';
import { ClusterTerminalView } from './components/ClusterTerminalView';
import { TrafficInspectorView } from './components/TrafficInspectorView';

// Import helpers
import { parseCpu, parseMem, highlightYaml, colorizeLogs, pluralizeKind, matchesSelector } from './utils/helpers';

type ResourceKind = 'pods' | 'deployments' | 'daemonsets' | 'statefulsets' | 'services' | 'configmaps' | 'secrets' | 'ingresses' | 'jobs' | 'cronjobs' | 'nodes' | 'topology' | 'persistentvolumes' | 'persistentvolumeclaims' | 'helm' | 'helm-install' | 'helm-repos' | 'crds' | 'custom' | 'events' | 'zarf' | 'zarf-deploy' | 'zarf-registry' | 'zarf-creds' | 'zarf-sbom' | 'cluster-auditor' | 'dashboard' | 'image-scanner' | 'zarf-state' | 'kubescape' | 'gitea' | 'logs' | 'traffic' | 'cluster-terminal' | 'namespaces';
type ModalType = 'yaml' | 'logs' | 'events' | 'terminal' | 'portforward' | 'history' | 'files' | 'values' | 'decoded';


function App() {
  const [activeTab, setActiveTab] = useState<ResourceKind>(() => {
    const saved = localStorage.getItem('activeTab');
    return (saved as ResourceKind) || 'dashboard';
  });

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

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

  // Zarf Registry States
  const cmdPaletteInputRef = useRef<HTMLInputElement>(null);
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
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isDeployZarfModalOpen, setIsDeployZarfModalOpen] = useState(false);
  const [helmDeployForm, setHelmDeployForm] = useState({ releaseName: '', namespace: 'default', chartName: '', valuesYaml: '' });
  const [zarfDeployForm, setZarfDeployForm] = useState({ packagePath: '' });
  const [isSubmittingHelmDeploy, setIsSubmittingHelmDeploy] = useState(false);
  const [isSubmittingZarfDeploy, setIsSubmittingZarfDeploy] = useState(false);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sidebar_collapsed');
      const defaults = {
        cluster: false,
        security: false,
        workloads: true,
        network: true,
        config: true,
        helm: true
      };
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch (e) {
      return { cluster: false, security: false, workloads: true, network: true, config: true, helm: true };
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
  const [isClearingZarfCache, setIsClearingZarfCache] = useState(false);
  const [zarfLocalPackages, setZarfLocalPackages] = useState<any[]>([]);
  
  // Zarf config mutator states
  const [selectedZarfPackagePath, setSelectedZarfPackagePath] = useState<string>('');
  const [selectedZarfConfigPath, setSelectedZarfConfigPath] = useState<string>('');
  const [zarfUnpackTempDir, setZarfUnpackTempDir] = useState<string>('');
  const [zarfConfigText, setZarfConfigText] = useState<string>('');
  const [isUnpackingZarf, setIsUnpackingZarf] = useState(false);
  const [isSavingZarfConfig, setIsSavingZarfConfig] = useState(false);

  // File upload state
  const [zarfUploadFile, setZarfUploadFile] = useState<File | null>(null);
  const [zarfConfigFile, setZarfConfigFile] = useState<File | null>(null);
  const [zarfUploadProgress, setZarfUploadProgress] = useState(-1);
  const [isZarfUploadModalOpen, setIsZarfUploadModalOpen] = useState(false);

  // Real-time task logs state
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskLogs, setTaskLogs] = useState<string>('');
  const [taskStatus, setTaskStatus] = useState<string>('idle');
  const [isTaskLogsModalOpen, setIsTaskLogsModalOpen] = useState(false);

  // Zarf Registry states
  const [zarfRegistryImages, setZarfRegistryImages] = useState<any[]>([]);
  const [isFetchingRegistry, setIsFetchingRegistry] = useState(false);

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
  
  const [runningImages, setRunningImages] = useState<string[]>([]);
  
  // Standalone Image Scanner States
  const [runningImagesScanResults, setRunningImagesScanResults] = useState<Record<string, { sbom: any, vulnerabilities: any, status: 'pending' | 'scanning' | 'success' | 'failed', error?: string }>>({});
  const [enableAutoScan, setEnableAutoScan] = useState(false);
  const [isScanningAllRunningImages, setIsScanningAllRunningImages] = useState(false);

  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);

  // Kubescape compliance scanner states
  const [kubescapeReport, setKubescapeReport] = useState<any>(null);
  const [isScanningKubescape, setIsScanningKubescape] = useState(false);
  const [kubescapeSearchQuery, setKubescapeSearchQuery] = useState('');
  const [kubescapeSeverityFilter, setKubescapeSeverityFilter] = useState('all');
  const [expandedControlId, setExpandedControlId] = useState<string | null>(null);

  // Zarf graph state
  const [selectedZarfGraphPkg, setSelectedZarfGraphPkg] = useState<string | null>(null);

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
        setIsInstallModalOpen(false);
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

  const fetchZarfLocalPackages = () => {
    fetch('/api/zarf/local-packages')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setZarfLocalPackages(data);
          const pkgs = data.filter((pkg: any) => pkg.name.endsWith('.tar.zst') || pkg.name.endsWith('.zst'));
          if (pkgs.length > 0 && !sbomPackageName) {
            setSbomPackageName(pkgs[0].name);
          }
        }
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
        setZarfViewMode('packages');
        setActiveTab('zarf');
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



  const handleZarfUpload = async () => {
    if (!zarfUploadFile) return alert('Please select a file to upload first.');
    setZarfUploadProgress(0);
    
    try {
      // 1. Upload config if selected
      let uploadedConfigPath = '';
      if (zarfConfigFile) {
        const configContent = await zarfConfigFile.text();
        const configRes = await fetch('/api/zarf/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: configContent, filename: zarfConfigFile.name })
        });
        const configData = await configRes.json();
        if (configRes.ok) {
          uploadedConfigPath = configData.filepath;
        }
      }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/zarf/upload', true);
      xhr.setRequestHeader('x-file-name', zarfUploadFile.name);
      
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setZarfUploadProgress(pct);
        }
      };
      
      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          setZarfUploadFile(null);
          setZarfConfigFile(null);
          setZarfUploadProgress(-1);
          fetchZarfLocalPackages();

          try {
            const res = await fetch('/api/zarf/deploy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                packagePath: data.filename,
                configPath: uploadedConfigPath || undefined
              })
            });
            const deployData = await res.json();
            if (res.ok) {
              startTaskLogsStreaming(deployData.taskId);
            } else {
              alert('Failed to deploy package: ' + (deployData.error || 'Unknown error'));
            }
          } catch (err: any) {
            alert('Error deploying package: ' + err.message);
          }
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
    const pkgName = path.split(/[\\/]/).pop();
    const configName = selectedZarfConfigPath ? selectedZarfConfigPath.split(/[\\/]/).pop() : 'none';
    
    if (!window.confirm(`Are you sure you want to deploy local package "${pkgName}"${selectedZarfConfigPath ? ` using config "${configName}"` : ''}?`)) {
      return;
    }

    try {
      const res = await fetch('/api/zarf/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          packagePath: path,
          configPath: selectedZarfConfigPath || undefined
        })
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

  const fetchRunningImages = () => {
    fetch('/api/zarf/running-images')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setRunningImages(data);
      })
      .catch(console.error);
  };

  const fetchCachedScans = () => {
    fetch('/api/zarf/sbom/scans')
      .then(res => res.json())
      .then(data => {
        setRunningImagesScanResults(prev => {
          const updated = { ...prev };
          Object.keys(data).forEach(img => {
            if (!updated[img] || updated[img].status !== 'scanning') {
              updated[img] = data[img];
            }
          });
          return updated;
        });
      })
      .catch(console.error);
  };

  const fetchKubescapeStatus = () => {
    fetch('/api/security/kubescape/status')
      .then(res => res.json())
      .then(data => {
        setKubescapeReport(data.report);
        setIsScanningKubescape(data.scanning);
      })
      .catch(console.error);
  };

  const triggerKubescapeScan = async () => {
    setIsScanningKubescape(true);
    try {
      const res = await fetch('/api/security/kubescape/scan', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert('Failed to trigger scan: ' + (data.error || 'Unknown error'));
        setIsScanningKubescape(false);
        return;
      }
      
      const pollInterval = setInterval(() => {
        fetch('/api/security/kubescape/status')
          .then(r => r.json())
          .then(statusData => {
            setKubescapeReport(statusData.report);
            setIsScanningKubescape(statusData.scanning);
            if (!statusData.scanning) {
              clearInterval(pollInterval);
            }
          })
          .catch(err => {
            console.error('Error polling Kubescape status:', err);
            clearInterval(pollInterval);
            setIsScanningKubescape(false);
          });
      }, 2000);
      
    } catch (err: any) {
      alert('Error triggering compliance scan: ' + err.message);
      setIsScanningKubescape(false);
    }
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

  const fetchZarfRegistryImages = () => {
    setIsFetchingRegistry(true);
    fetch('/api/zarf/registry/all-images')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setZarfRegistryImages(data);
      })
      .catch(console.error)
      .finally(() => setIsFetchingRegistry(false));
  };

  const handleDownloadRegistryImage = async (imageRef: string) => {
    try {
      const res = await fetch(`/api/zarf/registry/download?imageRef=${encodeURIComponent(imageRef)}`);
      const data = await res.json();
      if (res.ok) {
        setTaskStatus('running');
        setActiveTaskId(data.taskId);
        setTaskLogs('Initializing image download preparation...\n');
        setIsTaskLogsModalOpen(true);
        
        // Polling for download readiness
        const checkReady = setInterval(async () => {
          const readyRes = await fetch(`/api/tasks/${data.taskId}/logs`);
          const readyData = await readyRes.json();
          if (readyData.status === 'success') {
            clearInterval(checkReady);
            // Trigger actual browser download
            window.location.href = data.downloadPath;
          } else if (readyData.status === 'failed') {
            clearInterval(checkReady);
          }
        }, 2000);
      } else {
        alert('Failed to prepare download: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
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
        fetchZarfRegistryImages();
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
                fetchZarfRegistryImages();
              }
            }
          }
        })
        .catch(console.error);
    }, 1500);
    
    return () => clearInterval(interval);
  }, [activeTaskId, activeTab]);



  useEffect(() => {
    if (activeTab === 'helm-repos' || activeTab === 'helm-install') {
      fetchHelmRepos();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'zarf') {
      fetchZarfLocalPackages();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'zarf-registry') {
      fetchZarfRegistryImages();
    } else if (activeTab === 'zarf-sbom') {
      fetchZarfRegistryImages();
      fetchZarfLocalPackages();
      fetchRunningImages();
    } else if (activeTab === 'image-scanner') {
      fetchRunningImages();
      fetchCachedScans();
    } else if (activeTab === 'kubescape') {
      fetchKubescapeStatus();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'image-scanner' || activeTab === 'zarf-sbom') {
      fetchCachedScans();
      const interval = setInterval(() => {
        fetchCachedScans();
        fetchRunningImages();
      }, 5000);
      return () => clearInterval(interval);
    } else if (activeTab === 'kubescape') {
      fetchKubescapeStatus();
      const interval = setInterval(() => {
        fetchKubescapeStatus();
      }, 4000);
      return () => clearInterval(interval);
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
      activeTab === 'logs' ||
      activeTab === 'zarf-registry' || 
      activeTab === 'zarf-creds' || 
      activeTab === 'helm-install' || 
      activeTab === 'helm-repos' ||
      activeTab === 'cluster-terminal' ||
      activeTab === 'traffic'
    ) {
      setLoading(false);
      return;
    }
    const hasExistingData = activeTab === 'dashboard' ? (dashboardData !== null) : (resources.length > 0);
    if (!hasExistingData) {
      setLoading(true);
    }
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
      if (Array.isArray(p)) setAssociatedPods(p);
      if (Array.isArray(d)) setAssociatedDeployments(d);
    });
  };

  const fetchTopologyData = async () => {
    const hasExistingData = (topologyData.nodes?.length > 0) || (topologyData.services?.length > 0) || (topologyData.deployments?.length > 0) || (topologyData.pods?.length > 0);
    if (!hasExistingData) {
      setLoading(true);
    }
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
    fetchScannerConfig();
  }, []);



  useEffect(() => {
    fetchResources();
    fetchMetrics();
    fetchTopologyData();
    
    // Background fetch security data to hydrate dashboard
    fetchKubescapeStatus();
    fetchCachedScans();

    // Auto-refresh cluster data every 10s
    const resourceInterval = setInterval(fetchResources, 10000);
    const metricsInterval = setInterval(fetchMetrics, 5000);
    const securityInterval = setInterval(() => {
      fetchKubescapeStatus();
      fetchCachedScans();
    }, 30000);

    return () => {
      clearInterval(resourceInterval);
      clearInterval(metricsInterval);
      clearInterval(securityInterval);
    };
  }, [activeTab, selectedNs, customCrd]);

  useEffect(() => {
    if (filteredResources.length > 0) {
      setFocusedRowIndex(0);
    } else {
      setFocusedRowIndex(null);
    }
  }, [activeTab, filteredResources.length]);

  useEffect(() => {
    if (focusedRowIndex !== null) {
      const el = document.querySelector(`.resource-row[data-row-index="${focusedRowIndex}"]`);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [focusedRowIndex]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isInput = active && (
        active.tagName === 'INPUT' || 
        active.tagName === 'TEXTAREA' || 
        (active as HTMLElement).isContentEditable
      );

      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCmdPaletteOpen(prev => !prev);
        return;
      }

      if (isCmdPaletteOpen) {
        return;
      }

      if (e.key === ':' && !isInput) {
        e.preventDefault();
        setCmdPaletteSearch('');
        setIsCmdPaletteOpen(true);
        return;
      }

      if (modal) {
        return;
      }

      if (!isInput && focusedRowIndex !== null && filteredResources[focusedRowIndex]) {
        const res = filteredResources[focusedRowIndex];
        
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedRowIndex(prev => {
            if (prev === null) return 0;
            return Math.min(prev + 1, filteredResources.length - 1);
          });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedRowIndex(prev => {
            if (prev === null) return 0;
            return Math.max(prev - 1, 0);
          });
        } else if (e.key === 'd') {
          if (activeTab !== 'nodes' && activeTab !== 'crds' && activeTab !== 'events') {
            e.preventDefault();
            setModal({
              type: 'events',
              name: res.metadata.name,
              namespace: res.metadata.namespace,
              kind: activeTab,
              uid: res.metadata.uid
            });
          }
        } else if (e.key === 'l') {
          if (activeTab === 'pods') {
            e.preventDefault();
            setSelectedContainer(res.spec?.containers?.[0]?.name || '');
            setModal({
              type: 'logs',
              name: res.metadata.name,
              namespace: res.metadata.namespace,
              kind: activeTab,
              uid: res.metadata.uid
            });
          }
        } else if (e.key === 's') {
          if (activeTab === 'pods') {
            e.preventDefault();
            setSelectedContainer(res.spec?.containers?.[0]?.name || '');
            setModal({
              type: 'terminal',
              name: res.metadata.name,
              namespace: res.metadata.namespace,
              kind: activeTab,
              uid: res.metadata.uid
            });
          }
        } else if (e.key === 'e') {
          e.preventDefault();
          if (activeTab === 'pods') {
            setSelectedContainer(res.spec?.containers?.[0]?.name || '');
            setCurrentDirPath('/');
            setModal({
              type: 'files',
              name: res.metadata.name,
              namespace: res.metadata.namespace,
              kind: activeTab,
              uid: res.metadata.uid
            });
          } else if (activeTab !== 'nodes' && activeTab !== 'crds' && activeTab !== 'events') {
            setIsEditingYaml(true);
            setModal({
              type: 'yaml',
              name: res.metadata.name,
              namespace: res.metadata.namespace,
              kind: activeTab,
              uid: res.metadata.uid
            });
          }
        } else if (e.key === 'Delete') {
          if (activeTab !== 'nodes' && activeTab !== 'crds' && activeTab !== 'events') {
            e.preventDefault();
            handleDelete(res);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, filteredResources, focusedRowIndex, modal, isCmdPaletteOpen]);

  useEffect(() => {
    if (!isCmdPaletteOpen) {
      setCmdPaletteSearch('');
      setActivePaletteIndex(0);
    } else {
      const timer = setTimeout(() => {
        if (cmdPaletteInputRef.current) {
          cmdPaletteInputRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isCmdPaletteOpen]);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [selectedNs]);

  useEffect(() => {
    if (modal) {
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
      } else if (type === 'decoded') {
        const url = `/api/yaml/${modal.kind}/${modal.namespace}/${modal.name}`;
        const res = await fetch(url);
        const data = await res.json();
        setModalData(data);
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
    if (activeTab === 'daemonsets') {
      const ready = resource.status?.numberReady || 0;
      const desired = resource.status?.desiredNumberScheduled || 0;
      return <span className={`badge ${ready === desired ? 'ready' : 'pending'}`}>{ready}/{desired}</span>;
    }
    if (activeTab === 'statefulsets') {
      const ready = resource.status?.readyReplicas || 0;
      const replicas = resource.status?.replicas || 0;
      return <span className={`badge ${ready === replicas ? 'ready' : 'pending'}`}>{ready}/{replicas}</span>;
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
    if (activeTab === 'namespaces') {
      const status = resource.status?.phase?.toLowerCase() || 'unknown';
      return <span className={`badge ${status === 'active' ? 'ready' : 'error'}`}>{status}</span>;
    }
    return <span className="badge ready">Active</span>;
  };

  const getNodeCapacity = (nodeName: string, nodeMetric?: any) => {
    if (nodeMetric && nodeMetric.capacity) {
      const cpuCap = parseCpu(nodeMetric.capacity.cpu || '1');
      const memCap = parseMem(nodeMetric.capacity.memory || '1Ki');
      return { cpu: cpuCap, memory: memCap };
    }
    const node = resources.find(r => r && r.metadata && r.metadata.name === nodeName) || topologyData.nodes.find(r => r && r.metadata && r.metadata.name === nodeName);
    if (!node) return { cpu: 1, memory: 1 };
    const cpuCap = parseCpu(node.status?.capacity?.cpu || '1');
    const memCap = parseMem(node.status?.capacity?.memory || '1Ki');
    return { cpu: cpuCap, memory: memCap };
  };

  const getNodeUsagePercent = (nodeMetric: any) => {
    const { cpu, memory } = getNodeCapacity(nodeMetric.metadata.name, nodeMetric);
    const cpuUse = parseCpu(nodeMetric.usage?.cpu || '0');
    const memUse = parseMem(nodeMetric.usage?.memory || '0');
    return {
      cpuPercent: Math.min(100, Math.round((cpuUse / cpu) * 100)),
      memPercent: Math.min(100, Math.round((memUse / memory) * 100))
    };
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

  const fetchScannerConfig = () => {
    fetch('/api/security/scanner/config')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.enableAutoScan === 'boolean') {
          setEnableAutoScan(data.enableAutoScan);
        }
      })
      .catch(console.error);
  };

  const handleToggleAutoScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked;
    setEnableAutoScan(enabled);
    try {
      await fetch('/api/security/scanner/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enableAutoScan: enabled })
      });
    } catch (err) {
      console.error('Failed to update scanner config:', err);
    }
  };

  // We need this state as well
  const [selectedHelmRelease, setSelectedHelmRelease] = useState<{name: string, namespace: string} | null>(null);

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
        
        {/* Dashboard at root level */}
        <div style={{ padding: '0 12px', marginBottom: 20 }}>
          <a className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => { setActiveTab('dashboard'); setSearch(''); }}>
            <SlidersHorizontal size={16} /> Dashboard
          </a>
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
              <a className={`nav-item ${activeTab === 'topology' ? 'active' : ''}`} onClick={() => { setActiveTab('topology'); setSearch(''); }}><Activity size={16} /> Topology</a>
              <a className={`nav-item ${activeTab === 'nodes' ? 'active' : ''}`} onClick={() => { setActiveTab('nodes'); setSearch(''); }}><Server size={16} /> Nodes</a>
              <a className={`nav-item ${activeTab === 'events' ? 'active' : ''}`} onClick={() => { setActiveTab('events'); setSearch(''); }}><List size={16} /> Events</a>
              <a className={`nav-item ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => { setActiveTab('logs'); setSearch(''); }}><Terminal size={16} /> Logs</a>
              <a className={`nav-item ${activeTab === 'cluster-terminal' ? 'active' : ''}`} onClick={() => { setActiveTab('cluster-terminal'); setSearch(''); }}><Code size={16} style={{ color: 'var(--accent-cyan)' }} /> Cluster Terminal</a>
              <a className={`nav-item ${activeTab === 'crds' ? 'active' : ''}`} onClick={() => { setActiveTab('crds'); setSearch(''); }}><Code size={16} /> CRD Explorer</a>
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
              <a className={`nav-item ${activeTab === 'image-scanner' ? 'active' : ''}`} onClick={() => { setActiveTab('image-scanner'); setSearch(''); }}><Shield size={16} style={{ color: '#60a5fa' }} /> SBOM (Syft/Grype)</a>
              <a className={`nav-item ${activeTab === 'kubescape' ? 'active' : ''}`} onClick={() => { setActiveTab('kubescape'); setSearch(''); }}><Shield size={16} style={{ color: '#10b981' }} /> Compliance (Kubescape)</a>
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
              <a className={`nav-item ${activeTab === 'namespaces' ? 'active' : ''}`} onClick={() => { setActiveTab('namespaces'); setSearch(''); }}><Globe size={16} /> Namespaces</a>
              <a className={`nav-item ${activeTab === 'pods' ? 'active' : ''}`} onClick={() => { setActiveTab('pods'); setSearch(''); }}><Box size={16} /> Pods</a>
              <a className={`nav-item ${activeTab === 'deployments' ? 'active' : ''}`} onClick={() => { setActiveTab('deployments'); setSearch(''); }}><Layers size={16} /> Deployments</a>
              <a className={`nav-item ${activeTab === 'daemonsets' ? 'active' : ''}`} onClick={() => { setActiveTab('daemonsets'); setSearch(''); }}><Layers size={16} /> DaemonSets</a>
              <a className={`nav-item ${activeTab === 'statefulsets' ? 'active' : ''}`} onClick={() => { setActiveTab('statefulsets'); setSearch(''); }}><Layers size={16} /> StatefulSets</a>
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
              <a className={`nav-item ${activeTab === 'traffic' ? 'active' : ''}`} onClick={() => { setActiveTab('traffic'); setSearch(''); }}><Radio size={16} style={{ color: 'var(--accent-cyan)' }} /> Traffic Inspector</a>
            </nav>
          )}
        </div>

        <div className="nav-section">
          <div 
            className="nav-section-title" 
            onClick={() => toggleSection('config')}
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
          >
            <span>Config & Storage</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['config'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
          </div>
          {!collapsedSections['config'] && (
            <nav className="nav-menu">
              <a className={`nav-item ${activeTab === 'configmaps' ? 'active' : ''}`} onClick={() => { setActiveTab('configmaps'); setSearch(''); }}><FileText size={16} /> ConfigMaps</a>
              <a className={`nav-item ${activeTab === 'secrets' ? 'active' : ''}`} onClick={() => { setActiveTab('secrets'); setSearch(''); }}><Key size={16} /> Secrets</a>
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
            <span>Helm & Zarf</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: collapsedSections['helm'] ? 'rotate(-90deg)' : 'none' }}>▼</span>
          </div>
          {!collapsedSections['helm'] && (
            <nav className="nav-menu">
              <a className={`nav-item ${activeTab === 'helm' ? 'active' : ''}`} onClick={() => { setActiveTab('helm'); setSearch(''); }}><Package size={16} /> Helm Releases</a>
              <a className={`nav-item ${activeTab === 'helm-repos' ? 'active' : ''}`} onClick={() => { setActiveTab('helm-repos'); setSearch(''); }}><Database size={16} /> Repo Manager</a>
              <a className={`nav-item ${activeTab === 'zarf' ? 'active' : ''}`} onClick={() => { setZarfViewMode('packages'); setActiveTab('zarf'); setSearch(''); }}><Package size={16} /> Zarf Packages</a>
              <a className={`nav-item ${activeTab === 'zarf-registry' ? 'active' : ''}`} onClick={() => { setActiveTab('zarf-registry'); setSearch(''); }}><Database size={16} /> Zarf Registry</a>
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
                const { cpu, memory } = getNodeCapacity(nm.metadata.name, nm);
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
                  ? 'Packages'
                  : activeTab === 'zarf-registry'
                  ? 'Zarf Registry'
                  : activeTab === 'zarf-sbom'
                  ? 'Zarf SBOMs'
                  : activeTab === 'daemonsets'
                  ? 'DaemonSets'
                  : activeTab === 'statefulsets'
                  ? 'StatefulSets'
                  : activeTab === 'image-scanner'
                  ? 'SBOM (Syft/Grype)'
                  : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </h1>
              <div className="subtitle">
                {activeTab === 'topology' 
                  ? `Visualizing cluster relationships in ${selectedNs}` 
                  : activeTab === 'zarf'
                  ? 'Manage deployed packages and local workspace archives'
                  : activeTab === 'daemonsets'
                  ? 'Manage background node agent daemonsets'
                  : activeTab === 'statefulsets'
                  ? 'Manage stateful clustered application sets'
                  : activeTab === 'zarf-registry'
                  ? 'Manage containers and tag images inside the in-cluster registry'
                  : activeTab === 'zarf-sbom'
                  ? 'Extract CycloneDX package reports from local Zarf packages'
                  : activeTab === 'image-scanner'
                  ? 'Real-time cluster container vulnerability & package registry scanning'
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

            {activeTab === 'zarf' && zarfStatus.installed && (
              <button className="btn btn-primary" onClick={() => setIsZarfUploadModalOpen(true)}>
                <Package size={16} /> Deploy New Package
              </button>
            )}
          </div>

          {loading ? (
            <div className="loader-container"><div className="loader"></div></div>
          ) : activeTab === 'topology' ? (
            <TopologyView 
              topologyMode={topologyMode}
              topologyData={topologyData}
              selectedNs={selectedNs}
              hoveredTopologyItem={hoveredTopologyItem}
              setHoveredTopologyItem={setHoveredTopologyItem}
              selectedTopologyNode={selectedTopologyNode}
              setSelectedTopologyNode={setSelectedTopologyNode}
              resources={resources}
              podMetrics={podMetrics}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              setModal={setModal}
              setSelectedContainer={setSelectedContainer}
              handleRestart={handleRestart}
              handleScale={handleScale}
              handleDrillDownToPods={handleDrillDownToPods}
              handleOpenDiagnostics={handleOpenDiagnostics}
              handleOpenServiceWebsite={handleOpenServiceWebsite}
              nodeMetrics={nodeMetrics}
              getNodeUsagePercent={getNodeUsagePercent}
              getNodeCapacity={getNodeCapacity}
            />
          ) : activeTab === 'zarf' || activeTab === 'zarf-registry' ? (
            <ZarfManagerView
              resources={resources}
              search={search}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              zarfStatus={zarfStatus}
              zarfViewMode={zarfViewMode}
              setZarfViewMode={setZarfViewMode}
              isClearingZarfCache={isClearingZarfCache}
              handleClearZarfCache={handleClearZarfCache}
              zarfLocalPackages={zarfLocalPackages}
              fetchZarfLocalPackages={fetchZarfLocalPackages}
              handleDeleteWorkspaceItem={handleDeleteWorkspaceItem}
              handleCompressFolder={handleCompressFolder}
              handleDecompressPackage={handleDecompressPackage}
              handleUnpackZarfPackage={handleUnpackZarfPackage}
              isUnpackingZarf={isUnpackingZarf}
              selectedZarfPackagePath={selectedZarfPackagePath}
              zarfConfigText={zarfConfigText}
              setZarfConfigText={setZarfConfigText}
              isSavingZarfConfig={isSavingZarfConfig}
              handleRebuildAndDeployZarf={handleRebuildAndDeployZarf}
              setZarfUnpackTempDir={setZarfUnpackTempDir}
              
              // Lifted Upload Modal States
              isDeployModalOpen={isZarfUploadModalOpen}
              setIsDeployModalOpen={setIsZarfUploadModalOpen}

              zarfUploadFile={zarfUploadFile}
              setZarfUploadFile={setZarfUploadFile}
              zarfConfigFile={zarfConfigFile}
              setZarfConfigFile={setZarfConfigFile}
              zarfUploadProgress={zarfUploadProgress}
              setZarfUploadProgress={setZarfUploadProgress}
              handleUploadZarfPackage={handleZarfUpload}
              selectedZarfConfigPath={selectedZarfConfigPath}
              setSelectedZarfConfigPath={setSelectedZarfConfigPath}
              handleDeployLocalPackage={handleDeployLocalPackage}
              sbomPackageName={sbomPackageName}
              setSbomPackageName={setSbomPackageName}
              sbomExtractedFiles={sbomExtractedFiles}
              setSbomExtractedFiles={setSbomExtractedFiles}
              sbomSelectedFileUrl={sbomSelectedFileUrl}
              setSbomSelectedFileUrl={setSbomSelectedFileUrl}
              isExtractingSbom={isExtractingSbom}
              handleExtractSbom={handleExtractSbom}
              selectedZarfPackageDetail={selectedZarfPackageDetail}
              setSelectedZarfPackageDetail={setSelectedZarfPackageDetail}
              isPackageDetailModalOpen={isPackageDetailModalOpen}
              setIsPackageDetailModalOpen={setIsPackageDetailModalOpen}
              isFetchingPackageDetail={isFetchingPackageDetail}
              handleInspectDeployedZarfPackage={handleInspectDeployedZarfPackage}
              handleRemoveZarfPackage={handleRemoveZarfPackage}
              selectedZarfGraphPkg={selectedZarfGraphPkg}
              setSelectedZarfGraphPkg={setSelectedZarfGraphPkg}
              registryPullSource={registryPullSource}
              setRegistryPullSource={setRegistryPullSource}
              registryPullTarget={registryPullTarget}
              setRegistryPullTarget={setRegistryPullTarget}
              handlePullRegistryImage={handlePullRegistryImage}
              isPullingRegistry={isPullingRegistry}
              registryPushTarget={registryPushTarget}
              setRegistryPushTarget={setRegistryPushTarget}
              handlePushRegistryImage={handlePushRegistryImage}
              isPushingRegistry={isPushingRegistry}
              zarfRegistryImages={zarfRegistryImages}
              isFetchingRegistry={isFetchingRegistry}
              fetchZarfRegistryImages={fetchZarfRegistryImages}
              handleDownloadRegistryImage={handleDownloadRegistryImage}
              handleDeleteRegistryImage={handleDeleteRegistryImage}
              handlePruneRegistry={handlePruneRegistry}
            />
          ) : activeTab === 'logs' ? (
            <LogsView
              namespaces={namespaces}
              initialNamespace={selectedNs}
            />
          ) : activeTab === 'image-scanner' ? (
            <ImageScannerView
              runningImages={runningImages}
              runningImagesScanResults={runningImagesScanResults}
              isScanningAllRunningImages={isScanningAllRunningImages}

              scanSingleImage={scanSingleImage}
              fetchRunningImagesAndScan={fetchRunningImagesAndScan}
              enableAutoScan={enableAutoScan}
              handleToggleAutoScan={handleToggleAutoScan}
            />
          ) : activeTab === 'kubescape' ? (
            <KubescapeView
              kubescapeReport={kubescapeReport}
              isScanningKubescape={isScanningKubescape}
              triggerKubescapeScan={triggerKubescapeScan}
              kubescapeSearchQuery={kubescapeSearchQuery}
              setKubescapeSearchQuery={setKubescapeSearchQuery}
              kubescapeSeverityFilter={kubescapeSeverityFilter}
              setKubescapeSeverityFilter={setKubescapeSeverityFilter}
              expandedControlId={expandedControlId}
              setExpandedControlId={setExpandedControlId}
            />
          ) : activeTab === 'helm' || activeTab === 'helm-repos' ? (
            <HelmManagerView
              resources={resources}
              selectedNs={selectedNs}
              search={search}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              setModal={setModal}
              handleDelete={handleDelete}
              isInstallModalOpen={isInstallModalOpen}
              setIsInstallModalOpen={setIsInstallModalOpen}
              selectedHelmRelease={selectedHelmRelease}
              setSelectedHelmRelease={setSelectedHelmRelease}
              fetchHelmInspect={fetchHelmInspect}
              helmInspectTab={helmInspectTab}
              setHelmInspectTab={setHelmInspectTab}
              isFetchingHelmInspect={isFetchingHelmInspect}
              helmInspectData={helmInspectData}
              helmUpgradeChartRef={helmUpgradeChartRef}
              setHelmUpgradeChartRef={setHelmUpgradeChartRef}
              isUpgradingHelm={isUpgradingHelm}
              handleHelmUpgrade={handleHelmUpgrade}
              helmUpgradeValues={helmUpgradeValues}
              setHelmUpgradeValues={setHelmUpgradeValues}
              helmCustomInstall={helmCustomInstall}
              setHelmCustomInstall={setHelmCustomInstall}
              handleCustomHelmInstall={handleCustomHelmInstall}
              isSubmittingHelmDeploy={isSubmittingHelmDeploy}
              helmRepos={helmRepos}
              newHelmRepo={newHelmRepo}
              setNewHelmRepo={setNewHelmRepo}
              isSubmittingHelmRepo={isSubmittingHelmRepo}
              handleAddHelmRepo={handleAddHelmRepo}
              handleRemoveHelmRepo={handleRemoveHelmRepo}
              handleUpdateHelmRepos={handleUpdateHelmRepos}
              helmSearchQuery={helmSearchQuery}
              setHelmSearchQuery={setHelmSearchQuery}
              helmSearchResults={helmSearchResults}
              isSearchingHelm={isSearchingHelm}
              handleSearchHelmRepo={handleSearchHelmRepo}
            />
          ) : activeTab === 'cluster-terminal' ? (
            <ClusterTerminalView />
          ) : activeTab === 'traffic' ? (
            <TrafficInspectorView selectedNs={selectedNs} />
          ) : activeTab === 'dashboard' ? (
            <DashboardView
              dashboardData={dashboardData}
              cpuHistory={cpuHistory}
              memHistory={memHistory}
              setActiveTab={setActiveTab}
              setSearch={setSearch}
              setIsCmdPaletteOpen={setIsCmdPaletteOpen}
              zarfStatus={zarfStatus}
              runningImagesScanResults={runningImagesScanResults}
              kubescapeReport={kubescapeReport}
            />
          ) : (
            <div className="resource-list">
              {filteredResources.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>No resources found.</div>
              ) : (
                filteredResources.filter((res: any) => res && res.metadata).map((res: any, i) => (
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
                        <button className="btn btn-sm" title="View Events" onClick={(e) => { e.stopPropagation(); setModal({ type: 'events', name: res.metadata.name, namespace: res.metadata.namespace, kind: activeTab, uid: res.metadata.uid }); }}>
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
                .concat(modal.kind === 'secrets' ? ['decoded'] : [])
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
                    {t === 'decoded' && <Key size={14}/>}
                    {t === 'terminal' ? 'Console' : t === 'portforward' ? 'Port Forward' : t === 'events' && modal.kind === 'helm' ? 'Status' : t === 'values' ? 'Values' : t === 'decoded' ? 'Decoded Data' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </div>
                ))}
            </div>
 
            <div className="modal-body">
              {modal.type === 'decoded' ? (
                modalData === null ? (
                  <div className="loader-container"><div className="loader"></div></div>
                ) : (
                  <SecretDecoderPanel secretJson={modalData} />
                )
              ) : modal.type === 'files' ? (
                <PodFilesExplorer
                  modal={modal}
                  currentDirPath={currentDirPath}
                  setCurrentDirPath={setCurrentDirPath}
                  isListingFiles={isListingFiles}
                  podFiles={podFiles}
                  podFileUploadProgress={podFileUploadProgress}
                  podFileUploadName={podFileUploadName}
                  handleUploadPodFile={handleUploadPodFile}
                  handleCreatePodFolder={handleCreatePodFolder}
                  fetchPodFilesList={fetchPodFilesList}
                  handleEditPodFile={handleEditPodFile}
                  handleDownloadPodFile={handleDownloadPodFile}
                  handleDeletePodFile={handleDeletePodFile}
                />
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
                <div className="exec-terminal" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                  <div style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
                    <div>
                      # Live Interactive Shell inside container '{selectedContainer || getPodContainers()[0] || ''}'
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
                  <InteractiveTerminal 
                    key={`${modal.namespace}-${modal.name}-${selectedContainer || getPodContainers()[0] || ''}`}
                    namespace={modal.namespace}
                    podName={modal.name}
                    containerName={selectedContainer || getPodContainers()[0] || ''}
                  />
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
                { name: 'Cluster & Pod Logs Console', category: 'Views', action: () => { setActiveTab('logs'); setIsCmdPaletteOpen(false); } },
                { name: 'Pods List', category: 'Views', action: () => { setActiveTab('pods'); setIsCmdPaletteOpen(false); } },
                { name: 'Deployments Scale & Restart', category: 'Views', action: () => { setActiveTab('deployments'); setIsCmdPaletteOpen(false); } },
                { name: 'DaemonSets Node Agents', category: 'Views', action: () => { setActiveTab('daemonsets'); setIsCmdPaletteOpen(false); } },
                { name: 'StatefulSets Clustered Apps', category: 'Views', action: () => { setActiveTab('statefulsets'); setIsCmdPaletteOpen(false); } },
                { name: 'Services Network', category: 'Views', action: () => { setActiveTab('services'); setIsCmdPaletteOpen(false); } },
                { name: 'Ingresses SSL Routing', category: 'Views', action: () => { setActiveTab('ingresses'); setIsCmdPaletteOpen(false); } },
                { name: 'Jobs Batch run', category: 'Views', action: () => { setActiveTab('jobs'); setIsCmdPaletteOpen(false); } },
                { name: 'CronJobs Schedule list', category: 'Views', action: () => { setActiveTab('cronjobs'); setIsCmdPaletteOpen(false); } },
                { name: 'Namespaces List', category: 'Views', action: () => { setActiveTab('namespaces'); setIsCmdPaletteOpen(false); } },
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
                { name: 'Open SBOM (Syft/Grype)', category: 'Security & Scans', action: () => { setActiveTab('image-scanner'); setIsCmdPaletteOpen(false); } },
                { name: 'Open Kubescape Compliance', category: 'Security & Scans', action: () => { setActiveTab('kubescape'); setIsCmdPaletteOpen(false); } },
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
                      ref={cmdPaletteInputRef}
                      type="text"
                      placeholder="Search views, namespaces, custom resources..."
                      value={cmdPaletteSearch}
                      onChange={e => {
                        let val = e.target.value;
                        if (val === ':') val = '';
                        setCmdPaletteSearch(val);
                        setActivePaletteIndex(0);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setActivePaletteIndex(prev => Math.min(prev + 1, filtered.length - 1));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setActivePaletteIndex(prev => Math.max(prev - 1, 0));
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          const query = cmdPaletteSearch.trim().toLowerCase();
                          const command = query.startsWith(':') ? query.slice(1).trim() : query;
                          let targetTab: ResourceKind | null = null;
                          if (['po', 'pod', 'pods'].includes(command)) targetTab = 'pods';
                          else if (['dep', 'deploy', 'deployments'].includes(command)) targetTab = 'deployments';
                          else if (['svc', 'service', 'services'].includes(command)) targetTab = 'services';
                          else if (['ing', 'ingress', 'ingresses'].includes(command)) targetTab = 'ingresses';
                          else if (['no', 'node', 'nodes'].includes(command)) targetTab = 'nodes';
                          else if (['cm', 'configmap', 'configmaps'].includes(command)) targetTab = 'configmaps';
                          else if (['sec', 'secret', 'secrets'].includes(command)) targetTab = 'secrets';
                          else if (['pv'].includes(command)) targetTab = 'persistentvolumes';
                          else if (['pvc'].includes(command)) targetTab = 'persistentvolumeclaims';
                          else if (['job', 'jobs'].includes(command)) targetTab = 'jobs';
                          else if (['cj', 'cronjob', 'cronjobs'].includes(command)) targetTab = 'cronjobs';
                          else if (['helm'].includes(command)) targetTab = 'helm';
                          else if (['crd', 'crds'].includes(command)) targetTab = 'crds';
                          else if (['audit'].includes(command)) targetTab = 'cluster-auditor';
                          else if (['scan', 'scanner'].includes(command)) targetTab = 'image-scanner';
                          else if (['kube', 'compliance', 'kubescape'].includes(command)) targetTab = 'kubescape';
                          else if (['gitea', 'git', 'tea'].includes(command)) targetTab = 'gitea';
                          else if (['topo', 'topology'].includes(command)) targetTab = 'topology';
                          else if (['event', 'events'].includes(command)) targetTab = 'events';
                          else if (['log', 'logs'].includes(command)) targetTab = 'logs';

                          if (targetTab) {
                            setActiveTab(targetTab);
                            setIsCmdPaletteOpen(false);
                            return;
                          }

                          if (command.startsWith('ns ')) {
                            const nsName = command.slice(3).trim();
                            if (namespaces.includes(nsName)) {
                              setSelectedNs(nsName);
                              setIsCmdPaletteOpen(false);
                              return;
                            }
                          }

                          if (namespaces.includes(command)) {
                            setSelectedNs(command);
                            setIsCmdPaletteOpen(false);
                            return;
                          }
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
