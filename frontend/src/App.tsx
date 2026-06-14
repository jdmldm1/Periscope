import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNamespaces, useKubeContexts, useTopologyData, useNodeMetrics, usePodMetrics, useDashboardStats, useKubescapeStatus, useZarfStatus, useGrypeDbStatus, useSbomScans, useK8sResources } from './utils/kubeHooks';
import { useClusterResources } from './hooks/useClusterResources';
import { useClusterActions } from './hooks/useClusterActions';
import { useZarfManager } from './hooks/useZarfManager';
import { useHelmManager } from './hooks/useHelmManager';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { StatsGrid } from './components/StatsGrid';
import { ResourceListView } from './components/ResourceListView';
import { ModalManager } from './components/ModalManager';
import { CommandPalette } from './components/CommandPalette';
import { TopologyView } from './components/TopologyView';
import { ZarfManagerView } from './components/ZarfManagerView';
import { LogsView } from './components/LogsView';
import { ImageScannerView } from './components/ImageScannerView';
import { KubescapeView } from './components/KubescapeView';
import { HelmManagerView } from './components/HelmManagerView';
import { ClusterTerminalView } from './components/ClusterTerminalView';
import { TrafficInspectorView } from './components/TrafficInspectorView';
import { ClusterPrunerView } from './components/ClusterPrunerView';
import { AlertSettingsView } from './components/AlertSettingsView';
import { PvcExplorerView } from './components/PvcExplorerView';
import { DashboardView } from './components/DashboardView';
import { parseCpu, parseMem, matchesSelector } from './utils/helpers';
import axios from 'axios';
import { ChevronRight, Columns, Network as NetworkIcon, X } from 'lucide-react';

const api = axios.create({ baseURL: '/api' });

export type ResourceKind = 
  'dashboard' | 'topology' | 'nodes' | 'events' | 'logs' | 'cluster-terminal' | 'crds' | 
  'pods' | 'deployments' | 'statefulsets' | 'daemonsets' | 'jobs' | 'cronjobs' |
  'services' | 'ingresses' | 'traffic' | 'configmaps' | 'secrets' | 'persistentvolumes' | 
  'persistentvolumeclaims' | 'helm' | 'helm-repos' | 'zarf' | 'zarf-registry' | 'image-scanner' | 'kubescape' | 'gitea' | 'custom' |
  'cluster-pruner' | 'alert-settings' | 'pvc-explorer';

function App() {
  const { data: namespacesData } = useNamespaces();
  const { data: contextsData } = useKubeContexts();
  
  const [activeTab, setActiveTab] = useState<ResourceKind>(() => {
    const saved = localStorage.getItem('activeTab');
    return (saved as ResourceKind) || 'dashboard';
  });

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  const [namespaces, setNamespaces] = useState<string[]>(['all']);
  const [selectedNs, setSelectedNs] = useState<string>('all');
  
  useEffect(() => {
    if (namespacesData) setNamespaces(['all', ...namespacesData]);
  }, [namespacesData]);

  const [contexts, setContexts] = useState<any[]>([]);
  const [currentContext, setCurrentContext] = useState<string>('');

  useEffect(() => {
    if (contextsData) {
      setContexts(contextsData.contexts || []);
      setCurrentContext(contextsData.currentContext || '');
    }
  }, [contextsData]);

  const { search, setSearch, filteredResources, loading } = useClusterResources(activeTab, selectedNs);

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sidebar_collapsed');
      return saved ? JSON.parse(saved) : { cluster: false, workloads: true, network: true, config: true, security: true, tools: true };
    } catch (e) { return { cluster: false, workloads: true, network: true, config: true, security: true, tools: true }; }
  });

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const updated = { ...prev, [section]: !prev[section] };
      localStorage.setItem('sidebar_collapsed', JSON.stringify(updated));
      return updated;
    });
  };

  const queryClient = useQueryClient();
  const [customCrd, setCustomCrd] = useState<any>(null);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [cmdPaletteSearch, setCmdPaletteSearch] = useState('');
  const [modal, setModal] = useState<any>(null);
  const [modalData, setModalData] = useState<any>(null);
  const [yamlEdit, setYamlEdit] = useState('');
  const [isEditingYaml, setIsEditingYaml] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState('');
  const [isStreamingLogs, setIsStreamingLogs] = useState(false);
  const [enableAutoScan, setEnableAutoScan] = useState(true);
  const [localScanningImages, setLocalScanningImages] = useState<Set<string>>(new Set());
  
  const [isDeployZarfModalOpen, setIsDeployZarfModalOpen] = useState(false);
  const [zarfDeployForm, setZarfDeployForm] = useState({ packagePath: '' });
  const [isSubmittingZarfDeploy, setIsSubmittingZarfDeploy] = useState(false);

  const [isDeployHelmModalOpen, setIsDeployHelmModalOpen] = useState(false);
  const [helmDeployForm, setHelmDeployForm] = useState({ releaseName: '', repo: '', chartName: '', version: '', namespace: 'default', valuesYaml: '' });

  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);

  const { data: topologyData } = useTopologyData(selectedNs);
  const { data: nodeMetrics } = useNodeMetrics();
  const { data: podMetrics } = usePodMetrics();
  const [podMetricsHistory, setPodMetricsHistory] = useState<Record<string, any>>({});

  useEffect(() => {
    if (podMetrics) {
      setPodMetricsHistory(prev => {
        const updated = { ...prev };
        podMetrics.forEach((pm: any) => {
          const key = `${pm.metadata.namespace}/${pm.metadata.name}`;
          let cpu = 0; let mem = 0;
          pm.containers?.forEach((c: any) => {
            cpu += parseCpu(c.usage?.cpu || '0');
            mem += parseMem(c.usage?.memory || '0');
          });
          const existing = updated[key] || { cpu: [], mem: [] };
          updated[key] = { cpu: [...existing.cpu.slice(-14), cpu], mem: [...existing.mem.slice(-14), mem] };
        });
        return updated;
      });
    }
  }, [podMetrics]);

  const handleContextChange = async (ctx: string) => {
    try {
      await api.post('/kube/contexts', { context: ctx });
      window.location.reload();
    } catch (err) { console.error(err); }
  };

  const getNodeUsagePercent = (metric: any) => {
    const node = (filteredResources || []).find(n => n.metadata.name === metric.metadata.name);
    if (!node) return { cpuPercent: 0, memPercent: 0 };
    const cpuCap = parseCpu(node.status?.capacity?.cpu || '1');
    const memCap = parseMem(node.status?.capacity?.memory || '1Ki');
    const cpuUse = parseCpu(metric.usage?.cpu || '0');
    const memUse = parseMem(metric.usage?.memory || '0');
    return {
      cpuPercent: Math.round((cpuUse / cpuCap) * 100),
      memPercent: Math.round((memUse / memCap) * 100)
    };
  };

  const getNodeCapacity = (name: string) => {
    const node = (filteredResources || []).find(n => n.metadata.name === name);
    return {
      cpu: parseCpu(node?.status?.capacity?.cpu || '1'),
      memory: parseMem(node?.status?.capacity?.memory || '1Ki')
    };
  };

  const renderStatusBadge = (res: any) => {
    if (activeTab === 'events') return null;
    
    let status = 'Unknown';
    let type: 'success' | 'warning' | 'error' | 'info' = 'warning';

    if (activeTab === 'pods') {
      status = res.status?.phase || 'Unknown';
      if (status === 'Running') type = 'success';
      else if (status === 'Succeeded') type = 'info';
      else if (status === 'Failed') type = 'error';
      else type = 'warning';

      const containerErrors = (res.status?.containerStatuses || []).filter((s: any) => {
        if (s.state?.waiting) {
          const transient = ['ContainerCreating', 'PodInitializing', 'AlwaysPullImages'].includes(s.state.waiting.reason);
          return !transient;
        }
        if (s.state?.terminated) {
          return s.state.terminated.exitCode !== 0;
        }
        return false;
      });

      if (containerErrors.length > 0) {
        status = containerErrors[0].state?.waiting?.reason || containerErrors[0].state?.terminated?.reason || 'Error';
        type = 'error';
      }
    } else if (activeTab === 'deployments' || activeTab === 'statefulsets' || activeTab === 'daemonsets') {
      const ready = res.status?.readyReplicas || res.status?.numberReady || 0;
      const desired = res.status?.replicas || res.status?.desiredNumberScheduled || 0;
      status = `${ready}/${desired} Ready`;
      type = (ready === desired && desired > 0) ? 'success' : 'warning';
      if (desired === 0) type = 'info';
    } else if (activeTab === 'nodes') {
      const readyCond = (res.status?.conditions || []).find((c: any) => c.type === 'Ready');
      status = readyCond?.status === 'True' ? 'Ready' : 'NotReady';
      type = status === 'Ready' ? 'success' : 'error';
    } else if (activeTab === 'jobs') {
      const succeeded = res.status?.succeeded || 0;
      const failed = res.status?.failed || 0;
      const active = res.status?.active || 0;
      const conditions = res.status?.conditions || [];
      const isComplete = conditions.some((c: any) => c.type === 'Complete' && c.status === 'True');
      const isFailed = conditions.some((c: any) => c.type === 'Failed' && c.status === 'True');

      if (isComplete || (succeeded > 0 && active === 0)) {
        status = 'Succeeded';
        type = 'success';
      } else if (isFailed || failed > 0) {
        status = 'Failed';
        type = 'error';
      } else if (active > 0) {
        status = 'Running';
        type = 'info';
      } else {
        status = 'Completed';
        type = 'success';
      }
    } else if (activeTab === 'cronjobs') {
      const active = res.status?.active || [];
      const suspend = res.spec?.suspend || false;
      if (suspend) {
        status = 'Suspended';
        type = 'warning';
      } else if (active.length > 0) {
        status = 'Running';
        type = 'success';
      } else {
        status = 'Active';
        type = 'success';
      }
    } else if (['services', 'configmaps', 'secrets', 'ingresses', 'networkpolicies', 'persistentvolumes', 'persistentvolumeclaims', 'crds', 'custom', 'helm', 'zarf', 'zarf-registry'].includes(activeTab)) {
      status = res.status?.phase || 'Active';
      if (activeTab === 'zarf' || activeTab === 'helm' || activeTab === 'zarf-registry') status = res.status?.phase || 'deployed';
      type = (status === 'Active' || status === 'Bound' || status === 'Available' || status === 'deployed' || status === 'Running') ? 'success' : 'info';
    }

    const colorMap = {
      success: 'var(--accent-success)',
      warning: 'var(--accent-warning)',
      error: 'var(--accent-error)',
      info: 'var(--accent-blue)'
    };
    const color = (colorMap as any)[type] || 'var(--text-muted)';

    return (
      <span className="badge" style={{ background: `${color}10`, color, borderColor: `${color}30` }}>
        {status}
      </span>
    );
  };

  const renderSmallSparkline = (points: number[], color: string) => {
    if (!points || points.length < 2) return null;
    const max = Math.max(...points, 1);
    const width = 40;
    const height = 16;
    const coords = points.map((p, idx) => {
      const x = (idx / (points.length - 1)) * width;
      const y = height - (p / max) * height;
      return `${x},${y}`;
    });
    return (
      <svg width={width} height={height} style={{ overflow: 'visible', verticalAlign: 'middle', marginLeft: 6 }}>
        <polyline fill="none" stroke={color} strokeWidth="1.5" points={coords.join(' ')} />
      </svg>
    );
  };

  const fetchModalData = async (type: string) => {
    if (!modal) return;
    setModalData(null);
    try {
      let endpoint = '';
      if (type === 'yaml') endpoint = `/kube/resource/${modal.kind}/${modal.namespace}/${modal.name}/yaml`;
      else if (type === 'events') endpoint = `/kube/resource/${modal.kind}/${modal.namespace}/${modal.name}/events`;
      else if (type === 'logs') endpoint = `/kube/resource/pods/${modal.namespace}/${modal.name}/logs?container=${selectedContainer}`;
      else if (type === 'history') endpoint = `/helm/${modal.namespace}/${modal.name}/history`;
      else if (type === 'values') endpoint = `/helm/${modal.namespace}/${modal.name}/values`;
      else if (type === 'decoded') endpoint = `/kube/resource/secrets/${modal.namespace}/${modal.name}`;
      else if (type === 'portforward') {
          setModalData([]);
          return;
      } else if (type === 'files') {
          fetchPodFilesList(currentDirPath);
          return;
      }

      const { data } = await api.get(endpoint);
      setModalData(data);
      if (type === 'yaml' || type === 'values') setYamlEdit(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(err);
      setModalData({ error: 'Failed to fetch data' });
    }
  };

  useEffect(() => {
    if (modal) fetchModalData(modal.type);
  }, [modal?.type, modal?.name, selectedContainer]);

  useEffect(() => {
    const fetchScannerConfig = async () => {
      try {
        const { data } = await api.get('/zarf/scanner/config');
        setEnableAutoScan(data.enableAutoScan);
      } catch (err) {
        console.error('Failed to fetch scanner config', err);
      }
    };
    fetchScannerConfig();
  }, []);

  const handleToggleAutoScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.checked;
    setEnableAutoScan(newVal);
    try {
      await api.post('/zarf/scanner/config', { enableAutoScan: newVal });
    } catch (err) {
      console.error('Failed to toggle auto scan', err);
      setEnableAutoScan(!newVal);
    }
  };

  const scanSingleImage = async (img: string) => {
    setLocalScanningImages(prev => {
      const next = new Set(prev);
      next.add(img);
      return next;
    });
    try {
      await api.post('/zarf/scanner/sbom/scan', { imageRef: img, rescan: true });
      await api.post('/zarf/scanner/sbom/vulnerabilities', { imageRef: img });
      queryClient.invalidateQueries({ queryKey: ['sbom-scans'] });
    } catch (err: any) {
      console.error(err);
      alert('Failed to scan image: ' + (err.response?.data?.error || err.message));
    } finally {
      setLocalScanningImages(prev => {
        const next = new Set(prev);
        next.delete(img);
        return next;
      });
    }
  };

  const { data: dashboardData } = useDashboardStats(selectedNs);
  const { data: kubescapeStatusData } = useKubescapeStatus();
  const { data: zarfStatusData } = useZarfStatus();
  const { data: grypeDbStatusData } = useGrypeDbStatus();
  const { data: sbomScansData } = useSbomScans();
  
  const runningImagesScanResultsMerged = React.useMemo(() => {
    if (!sbomScansData) return {};
    const merged = { ...sbomScansData };
    localScanningImages.forEach(img => {
      if (merged[img]) {
        merged[img] = { ...merged[img], status: 'scanning' };
      } else {
        merged[img] = { status: 'scanning' };
      }
    });
    return merged;
  }, [sbomScansData, localScanningImages]);
  
  const { zarfPackages, removePackage } = useZarfManager();

  // Zarf states
  const [zarfViewMode, setZarfViewMode] = useState<'packages' | 'local' | 'tools' | 'edit' | 'registry' | 'sbom'>('packages');
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [zarfUploadFile, setZarfUploadFile] = useState<File | null>(null);
  const [zarfConfigFile, setZarfConfigFile] = useState<File | null>(null);
  const [zarfUploadProgress, setZarfUploadProgress] = useState(-1);
  const [selectedZarfConfigPath, setSelectedZarfConfigPath] = useState('');
  const [zarfLocalPackages, setZarfLocalPackages] = useState<any[]>([]);
  const [isUnpackingZarf, setIsUnpackingZarf] = useState(false);
  const [selectedZarfPackagePath, setSelectedZarfPackagePath] = useState('');
  const [zarfConfigText, setZarfConfigText] = useState('');
  const [zarfUnpackTempDir, setZarfUnpackTempDir] = useState('');
  const [isSavingZarfConfig, setIsSavingZarfConfig] = useState(false);
  const [selectedZarfGraphPkg, setSelectedZarfGraphPkg] = useState<string | null>(null);
  const [isPackageDetailModalOpen, setIsPackageDetailModalOpen] = useState(false);
  const [selectedZarfPackageDetail, setSelectedZarfPackageDetail] = useState<any>(null);
  const [isFetchingPackageDetail, setIsFetchingPackageDetail] = useState(false);

  // Zarf SBOMS
  const [sbomPackageName, setSbomPackageName] = useState('');
  const [sbomExtractedFiles, setSbomExtractedFiles] = useState<any[]>([]);
  const [sbomSelectedFileUrl, setSbomSelectedFileUrl] = useState('');
  const [isExtractingSbom, setIsExtractingSbom] = useState(false);

  // Zarf Registry
  const [registryPullSource, setRegistryPullSource] = useState('');
  const [registryPullTarget, setRegistryPullTarget] = useState('');
  const [isPullingRegistry, setIsPullingRegistry] = useState(false);
  const [registryPushTarget, setRegistryPushTarget] = useState('');
  const [isPushingRegistry, setIsPushingRegistry] = useState(false);
  const [isFetchingRegistry, setIsFetchingRegistry] = useState(false);
  const [registryImages, setRegistryImages] = useState<any[]>([]);

  const fetchZarfLocalPackages = async () => {
    try {
      const { data } = await api.get('/zarf/local-packages');
      setZarfLocalPackages(data);
    } catch (err: any) {
      console.error('Failed to fetch local packages:', err);
    }
  };

  const fetchZarfRegistryImages = async () => {
    setIsFetchingRegistry(true);
    try {
      const { data } = await api.get('/zarf/registry/all-images');
      setRegistryImages(data);
    } catch (err: any) {
      console.error('Failed to fetch registry images:', err);
    } finally {
      setIsFetchingRegistry(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'zarf' || activeTab === 'zarf-registry') {
      fetchZarfLocalPackages();
      fetchZarfRegistryImages();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'zarf-registry') {
      setZarfViewMode('registry');
    } else if (activeTab === 'zarf') {
      setZarfViewMode('packages');
    }
  }, [activeTab]);

  const [isClearingZarfCache, setIsClearingZarfCache] = useState(false);
  const handleClearZarfCache = async () => {
    if (!confirm('Are you sure you want to clear the Zarf cache?')) return;
    setIsClearingZarfCache(true);
    try {
      await api.post('/zarf/clear-cache');
      alert('Zarf cache cleared successfully.');
    } catch (err: any) {
      alert('Failed to clear cache: ' + err.message);
    } finally {
      setIsClearingZarfCache(false);
    }
  };

  const handleDeleteWorkspaceItem = async (name: string) => {
    if (!confirm(`Delete ${name} from workspace?`)) return;
    try {
      await api.delete('/zarf/local-packages', { params: { name } });
      fetchZarfLocalPackages();
    } catch (err: any) {
      alert('Failed to delete workspace item: ' + err.message);
    }
  };

  const handleCompressFolder = async (folderName: string) => {
    try {
      await api.post('/zarf/archiver/compress', { source: folderName, dest: folderName + '.tar.zst' });
      fetchZarfLocalPackages();
    } catch (err: any) {
      alert('Failed to compress folder: ' + err.message);
    }
  };

  const handleDecompressPackage = async (packageName: string) => {
    try {
      const dest = packageName.replace(/\.tar\.zst$/, '').replace(/\.zst$/, '');
      await api.post('/zarf/archiver/decompress', { source: packageName, dest });
      fetchZarfLocalPackages();
    } catch (err: any) {
      alert('Failed to decompress package: ' + err.message);
    }
  };

  const handleUnpackZarfPackage = async (packagePath: string) => {
    setIsUnpackingZarf(true);
    setSelectedZarfPackagePath(packagePath);
    try {
      const { data } = await api.post('/zarf/unpack', { packagePath });
      setZarfConfigText(data.configText);
      setZarfUnpackTempDir(data.tempDir);
      setZarfViewMode('edit');
    } catch (err: any) {
      alert('Failed to unpack package: ' + err.message);
    } finally {
      setIsUnpackingZarf(false);
    }
  };

  const handleRebuildAndDeployZarf = async () => {
    setIsSavingZarfConfig(true);
    try {
      await api.post('/zarf/rebuild-deploy', { tempDir: zarfUnpackTempDir, configText: zarfConfigText });
      alert('Rebuild & Deploy process started. Check background tasks.');
      setZarfViewMode('packages');
    } catch (err: any) {
      alert('Failed to rebuild and deploy: ' + err.message);
    } finally {
      setIsSavingZarfConfig(false);
    }
  };

  const handleDeployLocalPackage = async (packagePath: string) => {
    try {
      await api.post('/zarf/deploy', { packagePath, configPath: selectedZarfConfigPath || undefined });
      alert('Deployment task started in background.');
    } catch (err: any) {
      alert('Failed to deploy local package: ' + err.message);
    }
  };

  const handleInspectDeployedZarfPackage = async (name: string) => {
    setIsFetchingPackageDetail(true);
    try {
      const { data } = await api.get(`/zarf/packages/${name}`);
      setSelectedZarfPackageDetail(data);
      setIsPackageDetailModalOpen(true);
    } catch (err: any) {
      alert('Failed to inspect package: ' + err.message);
    } finally {
      setIsFetchingPackageDetail(false);
    }
  };

  const handleRemoveZarfPackage = async (name: string) => {
    if (!confirm(`Are you sure you want to remove Zarf package "${name}"?`)) return;
    try {
      await removePackage(name);
      alert(`Successfully removed package "${name}"`);
    } catch (err: any) {
      alert(`Failed to remove package: ` + err.message);
    }
  };

  const handleExtractSbom = async () => {
    setIsExtractingSbom(true);
    try {
      const { data } = await api.post('/zarf/sbom/inspect', { packageName: sbomPackageName });
      setSbomExtractedFiles(data.files || []);
      if (data.files && data.files.length > 0) {
        setSbomSelectedFileUrl(data.files[0].url);
      }
    } catch (err: any) {
      alert('Failed to extract SBOMs: ' + err.message);
    } finally {
      setIsExtractingSbom(false);
    }
  };

  const handlePullRegistryImage = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPullingRegistry(true);
    try {
      await api.post('/zarf/registry/pull', { source: registryPullSource, target: registryPullTarget });
      alert('Image copy task started in background.');
      setRegistryPullSource('');
      setRegistryPullTarget('');
      fetchZarfRegistryImages();
    } catch (err: any) {
      alert('Failed to pull image: ' + err.message);
    } finally {
      setIsPullingRegistry(false);
    }
  };

  const handlePushRegistryImage = async (e: React.FormEvent) => {
    e.preventDefault();
    const fileInput = document.getElementById('registry-image-file-input') as HTMLInputElement;
    const file = fileInput?.files?.[0];
    if (!file || !registryPushTarget) return;

    setIsPushingRegistry(true);
    try {
      await axios.post('/api/zarf/registry/push', file, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-target-ref': registryPushTarget
        }
      });
      alert('Image pushed successfully to local registry.');
      setRegistryPushTarget('');
      if (fileInput) fileInput.value = '';
      fetchZarfRegistryImages();
    } catch (err: any) {
      alert('Failed to push image: ' + err.message);
    } finally {
      setIsPushingRegistry(false);
    }
  };

  const handleDownloadRegistryImage = async (full: string) => {
    try {
      const { data } = await api.get('/zarf/registry/download', { params: { imageRef: full } });
      alert('Download started in background. File will download when ready.');
      window.open(data.downloadPath, '_blank');
    } catch (err: any) {
      alert('Failed to start image download: ' + err.message);
    }
  };

  const handleDeleteRegistryImage = async (repository: string, tag: string) => {
    if (!confirm(`Are you sure you want to delete ${repository}:${tag}?`)) return;
    try {
      await api.delete('/zarf/registry/image', { params: { imageRef: `${repository}:${tag}` } });
      alert('Image deleted successfully.');
      fetchZarfRegistryImages();
    } catch (err: any) {
      alert('Failed to delete registry image: ' + err.message);
    }
  };

  const handlePruneRegistry = async () => {
    if (!confirm('Are you sure you want to prune the local registry?')) return;
    try {
      await api.post('/zarf/registry/prune');
      alert('Pruning task started in background.');
    } catch (err: any) {
      alert('Failed to prune registry: ' + err.message);
    }
  };

  const handleUploadZarfPackage = async () => {
    if (!zarfUploadFile) return;
    setZarfUploadProgress(0);
    try {
      const uploadRes = await axios.post(`/api/zarf/upload`, zarfUploadFile, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-file-name': zarfUploadFile.name
        },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setZarfUploadProgress(percent);
        }
      });
      const packagePath = uploadRes.data.filepath;

      let configPath = '';
      if (zarfConfigFile) {
        const configText = await zarfConfigFile.text();
        const configRes = await api.post(`/zarf/config`, {
          content: configText,
          filename: zarfConfigFile.name || 'zarf-config.yaml'
        });
        configPath = configRes.data.filepath;
      }

      await api.post(`/zarf/deploy`, { packagePath, configPath: configPath || undefined });

      setIsDeployModalOpen(false);
      setZarfUploadFile(null);
      setZarfConfigFile(null);
      fetchZarfLocalPackages();
      queryClient.invalidateQueries({ queryKey: ['zarf-packages'] });
      alert('Upload completed. Deploying package in background...');
    } catch (err: any) {
      alert('Upload & Deploy failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setZarfUploadProgress(-1);
    }
  };

  const { helmRepos, searchRepos, isSearchingHelm, helmSearchResults, addRepo, removeRepo, updateRepos, newHelmRepo, setNewHelmRepo } = useHelmManager();

  const { data: allPods } = useK8sResources('pods', selectedNs);
  const { data: allDeployments } = useK8sResources('deployments', selectedNs);

  const getPodContainers = () => {
    if (!modal || modal.kind !== 'pods') return [];
    const pod = (allPods || []).find((p: any) => p.metadata.name === modal.name);
    return pod?.spec?.containers?.map((c: any) => c.name) || [];
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(yamlEdit);
    alert('Copied to clipboard');
  };

  const downloadYaml = () => {
    const blob = new Blob([yamlEdit], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${modal.name}.yaml`;
    a.click();
  };

  const scrollToBottomLogs = () => {
    const el = document.querySelector('.terminal-container');
    if (el) el.scrollTop = el.scrollHeight;
  };

  const pluralizeKind = (k: string) => {
    if (k.endsWith('s')) return k.toLowerCase();
    return k.toLowerCase() + 's';
  };

  const fetchRunningImagesAndScan = async () => {
    try {
      setIsScanningAllRunningImages(true);
      const { data: images } = await api.get('/zarf/scanner/running-images');
      for (const img of images) {
        await api.post('/zarf/scanner/sbom/scan', { imageRef: img });
        await api.post('/zarf/scanner/sbom/vulnerabilities', { imageRef: img });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsScanningAllRunningImages(false);
    }
  };

  const triggerKubescapeScan = async () => {
    try {
      await api.post('/security/kubescape/scan');
      queryClient.invalidateQueries({ queryKey: ['kubescape-status'] });
    } catch (err) {
      console.error(err);
    }
  };

  const handleCustomHelmInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/helm/deploy', helmDeployForm);
      alert('Helm chart deployment started');
      setIsDeployHelmModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Failed to deploy Helm chart');
    }
  };

  const { handleRestart, handleScale, handleDelete } = useClusterActions(() => {});

  const [topologyMode, setTopologyMode] = useState<'columns' | 'graph'>('graph');
  const [hoveredTopologyItem, setHoveredTopologyItem] = useState<any>(null);

  const stats = {
    nodes: (nodeMetrics || []).length,
    pods: (podMetrics || []).length,
    deployments: (allDeployments || []).length
  };

  const [establishingPortForward, setEstablishingPortForward] = useState<string | null>(null);
  const [isScanningAllRunningImages, setIsScanningAllRunningImages] = useState(false);

  const fetchHelmInspect = async (name: string, namespace: string) => {
    setModal({ type: 'values', kind: 'helm', name, namespace });
  };

  const handleOpenServiceWebsite = async (service: any) => {
    const ports = service.spec?.ports || [];
    if (ports.length === 0) return alert('Service has no configured ports.');

    const httpPort = ports.find((p: any) => {
      const name = (p.name || '').toLowerCase();
      const portVal = p.port;
      return name.includes('http') || name.includes('web') || name.includes('html') || [80, 8080, 3000, 5000, 8000].includes(portVal);
    }) || ports[0];

    const protocol = (httpPort.port === 443 || (httpPort.name || '').toLowerCase().includes('https')) ? 'https' : 'http';

    if (service.spec?.type === 'NodePort' && httpPort.nodePort) {
      window.open(`${protocol}://${window.location.hostname}:${httpPort.nodePort}`, '_blank');
      return;
    }

    const ingresses = service.status?.loadBalancer?.ingress || [];
    if (service.spec?.type === 'LoadBalancer' && ingresses.length > 0) {
      const host = ingresses[0].ip || ingresses[0].hostname;
      if (host) {
        window.open(`${protocol}://${host}:${httpPort.port}`, '_blank');
        return;
      }
    }

    const matchingPods = (allPods || []).filter((p: any) => matchesSelector(p.metadata?.labels, service.spec?.selector));
    const runningPod = matchingPods.find((p: any) => p.status?.phase?.toLowerCase() === 'running');
    if (!runningPod) return alert('No running pods found matching the service selector for port-forwarding.');

    setEstablishingPortForward(service.metadata.name);
    try {
      let targetPort = httpPort.targetPort || httpPort.port;
      if (typeof targetPort === 'string' && isNaN(Number(targetPort))) {
        for (const container of runningPod.spec?.containers || []) {
          for (const cp of container.ports || []) {
            if (cp.name === targetPort) { targetPort = cp.containerPort; break; }
          }
        }
      }

      const { data: forward } = await api.post('/portforward', {
        namespace: runningPod.metadata.namespace,
        podName: runningPod.metadata.name,
        remotePort: Number(targetPort)
      });

      if (forward.success) {
        window.open(`${protocol}://${window.location.hostname}:${forward.localPort}`, '_blank');
      } else {
        alert('Failed to establish port forward');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setEstablishingPortForward(null);
    }
  };

  // Pod File Explorer implementation
  const [currentDirPath, setCurrentDirPath] = useState('/');
  const [isListingFiles, setIsListingFiles] = useState(false);

  useEffect(() => {
    if (!modal) {
      setCurrentDirPath('/');
    }
  }, [modal]);
  const [podFiles, setPodFiles] = useState<any[]>([]);
  const [podFileUploadProgress, setPodFileUploadProgress] = useState(-1);
  const [podFileUploadName, setPodFileUploadName] = useState('');

  const fetchPodFilesList = async (path: string) => {
    if (!modal) return;
    setIsListingFiles(true);
    setCurrentDirPath(path);
    const cleanPath = path.endsWith('/') ? path : path + '/';
    try {
      const { data } = await api.post(`/kube/resource/pods/${modal.namespace}/${modal.name}/exec`, {
        command: `ls -la "${cleanPath}"`,
        container: selectedContainer
      });
      if (data.error) throw new Error(data.error);
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
        filesList.push({ name, isDir, isLink, size, date, permissions });
      });
      filesList.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
      setPodFiles(filesList);
    } catch (err: any) {
      console.error(err);
      alert('Error listing files: ' + err.message);
    } finally {
      setIsListingFiles(false);
    }
  };

  const handleUploadPodFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!modal || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    setPodFileUploadName(file.name);
    setPodFileUploadProgress(0);
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post(`/api/kube/resource/pods/${modal.namespace}/${modal.name}/files/upload?destDir=${currentDirPath}&container=${selectedContainer}`, file, {
        headers: { 'Content-Type': 'application/octet-stream', 'x-file-name': file.name },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setPodFileUploadProgress(percent);
        }
      });
      fetchPodFilesList(currentDirPath);
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setPodFileUploadProgress(-1);
    }
  };

  const handleCreatePodFolder = async () => {
    const folderName = prompt('Enter folder name:');
    if (!folderName || !modal) return;
    try {
      await api.post(`/kube/resource/pods/${modal.namespace}/${modal.name}/exec`, {
        command: `mkdir -p "${currentDirPath}${folderName}"`,
        container: selectedContainer
      });
      fetchPodFilesList(currentDirPath);
    } catch (err: any) { alert(err.message); }
  };

  const handleEditPodFile = async (fileName: string) => {
    if (!modal) return;
    const filePath = currentDirPath + fileName;
    try {
      const { data } = await api.get(`/kube/resource/pods/${modal.namespace}/${modal.name}/files/view`, {
        params: { path: filePath, container: selectedContainer }
      });
      const newContent = prompt(`Edit content for ${fileName}:`, data.content);
      if (newContent !== null) {
        await api.post(`/kube/resource/pods/${modal.namespace}/${modal.name}/files/save`, {
          path: filePath, content: newContent, container: selectedContainer
        });
        fetchPodFilesList(currentDirPath);
      }
    } catch (err: any) { alert(err.message); }
  };

  const handleDownloadPodFile = (fileName: string, isDir?: boolean) => {
    if (!modal) return;
    const filePath = currentDirPath + fileName;
    const url = `/api/kube/resource/pods/${modal.namespace}/${modal.name}/files/download?path=${encodeURIComponent(filePath)}&isDir=${!!isDir}&container=${selectedContainer}`;
    window.open(url, '_blank');
  };

  const handleDeletePodFile = async (fileName: string, isDir: boolean) => {
    if (!modal || !confirm(`Delete ${isDir ? 'folder' : 'file'} ${fileName}?`)) return;
    try {
      await api.delete(`/kube/resource/pods/${modal.namespace}/${modal.name}/files`, {
        params: { path: currentDirPath + fileName, container: selectedContainer }
      });
      fetchPodFilesList(currentDirPath);
    } catch (err: any) { alert(err.message); }
  };

  const saveYaml = async () => {
    if (!modal) return;
    try {
      await api.post(`/kube/resource/${modal.kind}/${modal.namespace}/${modal.name}/save`, { yaml: yamlEdit });
      alert('Resource updated successfully');
      setIsEditingYaml(false);
      fetchModalData('yaml');
    } catch (err: any) {
      alert('Failed to save: ' + err.message);
    }
  };

  const downloadLogs = () => {
    if (!modal) return;
    const blob = new Blob([modalData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${modal.name}-logs.txt`;
    a.click();
  };

  const handleRollback = async (ns: string, name: string, rev: number) => {
    try {
      await api.post(`/helm/${ns}/${name}/rollback`, { revision: rev });
      alert(`Rolled back to revision ${rev}`);
      fetchModalData('history');
    } catch (err: any) { alert(err.message); }
  };

  const [selectedRevisionValues, setSelectedRevisionValues] = useState<any>(null);
  const [isLoadingRevisionValues, setIsLoadingRevisionValues] = useState(false);

  const handleInspectRevisionValues = async (ns: string, name: string, rev: number) => {
    setIsLoadingRevisionValues(true);
    try {
      const { data } = await api.get(`/helm/${ns}/${name}/values/revision/${rev}`);
      setSelectedRevisionValues({ revision: rev, values: data });
    } catch (err: any) { alert(err.message); }
    finally { setIsLoadingRevisionValues(false); }
  };

  const handleHelmUpgradeFromModal = async () => {
    if (!modal) return;
    try {
      await api.post(`/helm/${modal.namespace}/${modal.name}/upgrade`, { values: yamlEdit });
      alert('Helm release upgraded');
      fetchModalData('values');
    } catch (err) { alert('Upgrade failed'); }
  };

  const renderDiffView = () => {
    if (!selectedRevisionValues) return null;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Revision #{selectedRevisionValues.revision}</div>
          <pre className="editor-textarea" style={{ flex: 1, overflow: 'auto' }}>{selectedRevisionValues.values}</pre>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Current Deployed</div>
          <pre className="editor-textarea" style={{ flex: 1, overflow: 'auto' }}>{modalData}</pre>
        </div>
      </div>
    );
  };

  console.debug(grypeDbStatusData);

  return (
    <div className="layout-container">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        setSearch={setSearch} 
        collapsedSections={collapsedSections} 
        toggleSection={toggleSection} 
        setCustomCrd={setCustomCrd} 
      />

      <main className="main-content">
        <Header 
          search={search}
          setSearch={setSearch}
          setIsCmdPaletteOpen={setIsCmdPaletteOpen}
          contexts={contexts}
          currentContext={currentContext}
          handleContextChange={handleContextChange}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          selectedNs={selectedNs}
          setSelectedNs={setSelectedNs}
          namespaces={namespaces}
          fetchResources={() => {}}
          setIsDeployZarfModalOpen={setIsDeployZarfModalOpen}
          setIsDeployHelmModalOpen={setIsDeployHelmModalOpen}
        />

        <div className="content-area">
          {activeTab === 'dashboard' && (
            <StatsGrid 
              stats={stats} 
              nodeMetrics={nodeMetrics || []} 
              getNodeCapacity={getNodeCapacity} 
              setActiveTab={setActiveTab} 
            />
          )}

          <div className="header animate-fade-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                {activeTab === 'custom' && customCrd ? (
                  <>
                    <button className="btn btn-icon btn-sm" onClick={() => setActiveTab('crds')} title="Back to CRDs">
                      <ChevronRight size={16} style={{ transform: 'rotate(180deg)' }} />
                    </button>
                    {customCrd.plural}
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>{customCrd.group}</span>
                  </>
                ) : (
                  activeTab.charAt(0).toUpperCase() + activeTab.slice(1).replace('-', ' ')
                )}
                {loading && <div className="loader-sm" style={{ width: 14, height: 14, borderWidth: 2 }}></div>}
              </h2>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 4 }}>
                {selectedNs === 'all' ? 'Cluster-wide' : `Namespace: ${selectedNs}`} 
                {filteredResources.length > 0 && ` • ${filteredResources.length} items`}
              </div>
            </div>

            {activeTab === 'topology' && (
              <div className="tab-group" style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: 2, border: '1px solid var(--border-color)' }}>
                <button 
                  className={`btn btn-sm ${topologyMode === 'columns' ? 'btn-primary' : ''}`} 
                  onClick={() => setTopologyMode('columns')}
                  title="List View"
                >
                  <Columns size={14} />
                </button>
                <button 
                  className={`btn btn-sm ${topologyMode === 'graph' ? 'btn-primary' : ''}`} 
                  onClick={() => setTopologyMode('graph')}
                  title="Graph View"
                >
                  <NetworkIcon size={14} />
                </button>
              </div>
            )}
          </div>

          {activeTab === 'topology' ? (
            <TopologyView 
              topologyMode={topologyMode}
              topologyData={topologyData || { nodes: [], services: [], deployments: [], pods: [] }} 
              selectedNs={selectedNs}
              hoveredTopologyItem={hoveredTopologyItem}
              setHoveredTopologyItem={setHoveredTopologyItem}
              podMetrics={podMetrics || []}
              setModal={setModal}
              handleOpenDiagnostics={() => {}}
              nodeMetrics={nodeMetrics || []}
              getNodeUsagePercent={getNodeUsagePercent}
            />
          ) : activeTab === 'zarf' || activeTab === 'zarf-registry' ? (
            <ZarfManagerView
              resources={zarfPackages || []}
              search={search}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              zarfStatus={zarfStatusData || { installed: true }}
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
              isDeployModalOpen={isDeployModalOpen}
              setIsDeployModalOpen={setIsDeployModalOpen}
              zarfUploadFile={zarfUploadFile}
              setZarfUploadFile={setZarfUploadFile}
              zarfConfigFile={zarfConfigFile}
              setZarfConfigFile={setZarfConfigFile}
              zarfUploadProgress={zarfUploadProgress}
              setZarfUploadProgress={setZarfUploadProgress}
              handleUploadZarfPackage={handleUploadZarfPackage}
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
              zarfRegistryImages={registryImages}
              isFetchingRegistry={isFetchingRegistry}
              fetchZarfRegistryImages={fetchZarfRegistryImages}
              handleDownloadRegistryImage={handleDownloadRegistryImage}
              handleDeleteRegistryImage={handleDeleteRegistryImage}
              handlePruneRegistry={handlePruneRegistry}
            />
          ) : activeTab === 'logs' ? (
            <LogsView namespaces={namespaces} initialNamespace={selectedNs} />
          ) : activeTab === 'image-scanner' ? (
            <ImageScannerView
              runningImages={Object.keys(sbomScansData || {})}
              runningImagesScanResults={runningImagesScanResultsMerged}
              isScanningAllRunningImages={isScanningAllRunningImages}
              scanSingleImage={scanSingleImage}
              fetchRunningImagesAndScan={fetchRunningImagesAndScan}
              enableAutoScan={enableAutoScan}
              handleToggleAutoScan={handleToggleAutoScan}
              grypeDbStatus={grypeDbStatusData}
            />
          ) : activeTab === 'kubescape' ? (
            <KubescapeView
              kubescapeReport={kubescapeStatusData?.report}
              isScanningKubescape={kubescapeStatusData?.scanning}
              triggerKubescapeScan={triggerKubescapeScan}
              kubescapeSearchQuery=""
              setKubescapeSearchQuery={() => {}}
              kubescapeSeverityFilter="all"
              setKubescapeSeverityFilter={() => {}}
              expandedControlId={null}
              setExpandedControlId={() => {}}
            />
          ) : activeTab === 'helm' || activeTab === 'helm-repos' ? (
            <HelmManagerView
              resources={filteredResources}
              selectedNs={selectedNs}
              search={search}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              setModal={setModal}
              handleDelete={(res) => handleDelete('helm', res.metadata.name, res.metadata.namespace)}
              isInstallModalOpen={false}
              setIsInstallModalOpen={() => {}}
              selectedHelmRelease={null}
              setSelectedHelmRelease={() => {}}
              fetchHelmInspect={fetchHelmInspect}
              helmInspectTab="values"
              setHelmInspectTab={() => {}}
              isFetchingHelmInspect={false}
              helmInspectData=""
              helmUpgradeChartRef=""
              setHelmUpgradeChartRef={() => {}}
              isUpgradingHelm={false}
              handleHelmUpgrade={() => {}}
              helmUpgradeValues=""
              setHelmUpgradeValues={() => {}}
              helmCustomInstall={{ ...helmDeployForm, repo: '', version: '' }}
              setHelmCustomInstall={(v: any) => setHelmDeployForm(v)}
              handleCustomHelmInstall={handleCustomHelmInstall}
              isSubmittingHelmDeploy={false}
              helmRepos={helmRepos || []}
              newHelmRepo={newHelmRepo}
              setNewHelmRepo={setNewHelmRepo}
              isSubmittingHelmRepo={false}
              handleAddHelmRepo={() => addRepo(newHelmRepo)}
              handleRemoveHelmRepo={removeRepo}
              handleUpdateHelmRepos={updateRepos}
              helmSearchQuery={search}
              setHelmSearchQuery={setSearch}
              helmSearchResults={helmSearchResults}
              isSearchingHelm={isSearchingHelm}
              handleSearchHelmRepo={(e) => { e.preventDefault(); searchRepos(search); }}
            />
          ) : activeTab === 'cluster-pruner' ? (
            <ClusterPrunerView />
          ) : activeTab === 'alert-settings' ? (
            <AlertSettingsView />
          ) : activeTab === 'pvc-explorer' ? (
            <PvcExplorerView />
          ) : activeTab === 'cluster-terminal' ? (
            <ClusterTerminalView />
          ) : activeTab === 'traffic' ? (
            <TrafficInspectorView selectedNs={selectedNs} />
          ) : activeTab === 'dashboard' ? (
             <DashboardView 
              dashboardData={dashboardData || {}} 
              cpuHistory={[]} 
              memHistory={[]} 
              setActiveTab={setActiveTab} 
              setSearch={setSearch} 
              setIsCmdPaletteOpen={setIsCmdPaletteOpen} 
              zarfStatus={zarfStatusData || { installed: true }} 
              runningImagesScanResults={sbomScansData || {}} 
              kubescapeReport={kubescapeStatusData?.report} 
            />
          ) : (
            <ResourceListView 
              activeTab={activeTab}
              filteredResources={filteredResources}
              focusedRowIndex={focusedRowIndex}
              setFocusedRowIndex={setFocusedRowIndex}
              setSearch={setSearch}
              setSelectedContainer={setSelectedContainer}
              setModal={setModal}
              podMetrics={podMetrics || []}
              podMetricsHistory={podMetricsHistory}
              nodeMetrics={nodeMetrics || []}
              getNodeUsagePercent={getNodeUsagePercent}
              customCrd={customCrd}
              setCustomCrd={setCustomCrd}
              setActiveTab={setActiveTab}
              associatedDeployments={allDeployments || []}
              associatedPods={allPods || []}
              matchesSelector={matchesSelector}
              pluralizeKind={pluralizeKind}
              handleRestart={handleRestart}
              handleScale={handleScale}
              handleDrillDownToPods={() => {}}
              handleOpenServiceWebsite={handleOpenServiceWebsite}
              establishingPortForward={establishingPortForward}
              handleOpenDiagnostics={() => {}}
              handleDelete={(res) => handleDelete(activeTab, res.metadata.name, res.metadata.namespace)}
              setIsEditingYaml={setIsEditingYaml}
              renderStatusBadge={renderStatusBadge}
              renderSmallSparkline={renderSmallSparkline}
            />
          )}
        </div>
      </main>

      <CommandPalette 
        isOpen={isCmdPaletteOpen} 
        setIsOpen={setIsCmdPaletteOpen} 
        search={cmdPaletteSearch} 
        setSearch={setCmdPaletteSearch} 
        namespaces={namespaces} 
        setSelectedNs={setSelectedNs} 
        contexts={contexts} 
        handleContextChange={handleContextChange} 
        setActiveTab={setActiveTab} 
        fetchResources={() => {}} 
        fetchRunningImagesAndScan={fetchRunningImagesAndScan} 
      />

      <ModalManager 
        modal={modal} 
        setModal={setModal} 
        modalData={modalData} 
        setModalData={setModalData} 
        yamlEdit={yamlEdit} 
        setYamlEdit={setYamlEdit} 
        isEditingYaml={isEditingYaml} 
        setIsEditingYaml={setIsEditingYaml} 
        copyToClipboard={copyToClipboard} 
        downloadYaml={downloadYaml} 
        downloadLogs={downloadLogs} 
        logSearch="" 
        setLogSearch={() => {}} 
        selectedContainer={selectedContainer} 
        setSelectedContainer={setSelectedContainer} 
        getPodContainers={getPodContainers} 
        isStreamingLogs={isStreamingLogs} 
        setIsStreamingLogs={setIsStreamingLogs} 
        scrollToBottomLogs={scrollToBottomLogs} 
        fetchModalData={fetchModalData} 
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
        saveYaml={saveYaml} 
        helmValuesEdit={yamlEdit}
        setHelmValuesEdit={setYamlEdit}
        isSavingHelmValues={false} 
        handleHelmUpgradeFromModal={handleHelmUpgradeFromModal} 
        handleRollback={handleRollback} 
        handleInspectRevisionValues={handleInspectRevisionValues} 
        selectedRevisionValues={selectedRevisionValues} 
        setSelectedRevisionValues={setSelectedRevisionValues} 
        isLoadingRevisionValues={isLoadingRevisionValues} 
        renderDiffView={renderDiffView} 
      />

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
              onSubmit={handleCustomHelmInstall}
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
                  spellCheck={false}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
                <button type="button" className="btn" onClick={() => setIsDeployHelmModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  Deploy
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
