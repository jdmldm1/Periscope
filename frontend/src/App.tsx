import React, { useState, useEffect, useRef } from 'react';
import { 
  useTopologyData, 
  useNodeMetrics, 
  usePodMetrics, 
  useDashboardStats, 
  useZarfStatus, 
  useK8sResources 
} from './utils/kubeHooks';
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
import { DashboardView } from './components/DashboardView';
import { AutoscaleManagerView } from './components/AutoscaleManagerView';
import { BackupRestoreView } from './components/BackupRestoreView';
import { CronJobManagerView } from './components/CronJobManagerView';
import { parseCpu, parseMem, matchesSelector } from './utils/helpers';
import axios from 'axios';
import { ChevronRight, Columns, Network as NetworkIcon, X } from 'lucide-react';
import { AppProvider, useAppContext } from './contexts/AppContext';
import type { ResourceKind } from './contexts/AppContext';
import { ScannerProvider, useScannerContext } from './contexts/ScannerContext';
import { ModalProvider, useModalContext } from './contexts/ModalContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useResourceWatcher } from './hooks/useResourceWatcher';

function AppContent() {
  useResourceWatcher();
  const {
    activeTab, setActiveTab,
    namespaces, selectedNs, setSelectedNs,
    contexts, currentContext, handleContextChange,
    search, setSearch, filteredResources, loading,
    isCmdPaletteOpen, setIsCmdPaletteOpen,
    customCrd, setCustomCrd,
    collapsedSections, toggleSection,
    handleDrillDownToPods,
    isDeployZarfModalOpen, setIsDeployZarfModalOpen,
    isDeployHelmModalOpen, setIsDeployHelmModalOpen,
    focusedRowIndex, setFocusedRowIndex,
    api,
    queryClient,
  } = useAppContext();

  const {
    enableAutoScan, handleToggleAutoScan,
    scanSingleImage, fetchRunningImagesAndScan,
    isScanningAllRunningImages, runningImagesScanResults,
    sbomScansData, grypeDbStatus,
    kubescapeStatusData, triggerKubescapeScan,
  } = useScannerContext();

  const {
    modal, setModal, modalData, setModalData, fetchModalData,
    yamlEdit, setYamlEdit, isEditingYaml, setIsEditingYaml,
    saveYaml, copyToClipboard, downloadYaml, downloadLogs,
    selectedContainer, setSelectedContainer, getPodContainers,
    isStreamingLogs, setIsStreamingLogs, scrollToBottomLogs,
    currentDirPath, setCurrentDirPath, isListingFiles, podFiles,
    podFileUploadProgress, podFileUploadName,
    handleUploadPodFile, handleCreatePodFolder, fetchPodFilesList,
    handleEditPodFile, handleDownloadPodFile, handleDeletePodFile,
    handleRollback, handleInspectRevisionValues,
    selectedRevisionValues, setSelectedRevisionValues,
    isLoadingRevisionValues, handleHelmUpgradeFromModal,
    renderDiffView,
  } = useModalContext();

  // Local/UI states in AppContent
  const [topologyMode, setTopologyMode] = useState<'columns' | 'graph'>('graph');
  const [hoveredTopologyItem, setHoveredTopologyItem] = useState<any>(null);
  const [podMetricsHistory, setPodMetricsHistory] = useState<Record<string, any>>({});
  const [establishingPortForward, setEstablishingPortForward] = useState<string | null>(null);
  const [cmdPaletteSearch, setCmdPaletteSearch] = useState('');
  const [navigationStack, setNavigationStack] = useState<Array<{tab: ResourceKind; search: string; ns: string; focusedRow: number | null}>>([]);
  const isDrillDownRef = useRef(false);

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
  const [isClearingZarfCache, setIsClearingZarfCache] = useState(false);
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

  // Helm forms
  const [zarfDeployForm, setZarfDeployForm] = useState({ packagePath: '' });
  const [isSubmittingZarfDeploy, setIsSubmittingZarfDeploy] = useState(false);
  const [helmDeployForm, setHelmDeployForm] = useState({ releaseName: '', repo: '', chartName: '', version: '', namespace: 'default', valuesYaml: '' });

  // Data fetching hooks for child views
  const { data: topologyData } = useTopologyData(selectedNs);
  const { data: nodeMetrics } = useNodeMetrics();
  const { data: podMetrics } = usePodMetrics();
  const { data: dashboardData } = useDashboardStats(selectedNs);
  const { data: zarfStatusData } = useZarfStatus();
  const { zarfPackages, removePackage } = useZarfManager();
  const { 
    helmRepos, 
    searchRepos, 
    isSearchingHelm, 
    helmSearchResults, 
    addRepo, 
    removeRepo, 
    updateRepos, 
    newHelmRepo, 
    setNewHelmRepo 
  } = useHelmManager();

  const { data: allPods } = useK8sResources('pods', selectedNs);
  const { data: allDeployments } = useK8sResources('deployments', selectedNs);

  // Effects
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

  // Clear the navigation stack when the user explicitly switches tabs (not from our drill-down)
  useEffect(() => {
    if (isDrillDownRef.current) {
      isDrillDownRef.current = false;
    } else {
      setNavigationStack([]);
    }
  }, [activeTab]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdPaletteSearch('');
        setIsCmdPaletteOpen(true);
        return;
      }

      const target = e.target as HTMLElement;
      if (
        target && 
        (target.tagName === 'INPUT' || 
         target.tagName === 'TEXTAREA' || 
         target.isContentEditable)
      ) {
        return;
      }

      if (e.key === ':') {
        e.preventDefault();
        setCmdPaletteSearch(':');
        setIsCmdPaletteOpen(true);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (modal) {
          setModal(null);
          setModalData(null);
          setSelectedRevisionValues(null);
        } else if (navigationStack.length > 0) {
          const prev = navigationStack[navigationStack.length - 1];
          setNavigationStack(s => s.slice(0, -1));
          setActiveTab(prev.tab);
          setSearch(prev.search);
          setSelectedNs(prev.ns);
          setFocusedRowIndex(prev.focusedRow);
        }
        return;
      }

      if (!modal && !isCmdPaletteOpen && filteredResources.length > 0) {
        const numResources = filteredResources.length;

        if (e.key === 'ArrowDown' || e.key === 'j') {
          e.preventDefault();
          setFocusedRowIndex(prev => {
            if (prev === null) return 0;
            const nextIdx = Math.min(prev + 1, numResources - 1);
            const el = document.querySelector(`[data-row-index="${nextIdx}"]`);
            el?.scrollIntoView({ block: 'nearest' });
            return nextIdx;
          });
        } else if (e.key === 'ArrowUp' || e.key === 'k') {
          e.preventDefault();
          setFocusedRowIndex(prev => {
            if (prev === null) return 0;
            const nextIdx = Math.max(prev - 1, 0);
            const el = document.querySelector(`[data-row-index="${nextIdx}"]`);
            el?.scrollIntoView({ block: 'nearest' });
            return nextIdx;
          });
        } else if (e.key === 'd') {
          if (focusedRowIndex !== null && filteredResources[focusedRowIndex]) {
            const res = filteredResources[focusedRowIndex];
            setIsEditingYaml(false);
            setModal({
              type: 'yaml',
              name: res.metadata.name,
              namespace: res.metadata.namespace,
              kind: activeTab,
              uid: res.metadata.uid
            });
          }
        } else if (e.key === 'e') {
          if (focusedRowIndex !== null && filteredResources[focusedRowIndex]) {
            const res = filteredResources[focusedRowIndex];
            setIsEditingYaml(true);
            setModal({
              type: 'yaml',
              name: res.metadata.name,
              namespace: res.metadata.namespace,
              kind: activeTab,
              uid: res.metadata.uid
            });
          }
        } else if (e.key === 'Enter') {
          if (focusedRowIndex !== null && filteredResources[focusedRowIndex]) {
            const res = filteredResources[focusedRowIndex];
            if (activeTab === 'pods') {
              setSelectedContainer(res.spec?.containers?.[0]?.name || '');
              setModal({
                type: 'logs',
                name: res.metadata.name,
                namespace: res.metadata.namespace,
                kind: activeTab,
                uid: res.metadata.uid
              });
            } else if (['deployments', 'statefulsets', 'daemonsets', 'jobs'].includes(activeTab)) {
              isDrillDownRef.current = true;
              setNavigationStack(s => [...s, { tab: activeTab, search, ns: selectedNs, focusedRow: focusedRowIndex }]);
              handleDrillDownToPods(res);
              setFocusedRowIndex(null);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [modal, isCmdPaletteOpen, filteredResources, focusedRowIndex, activeTab, navigationStack, search, selectedNs]);

  // Helpers
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

    let inferredKind = '';
    if (res.spec?.backoffLimit !== undefined || res.status?.succeeded !== undefined || res.status?.failed !== undefined) {
      inferredKind = 'jobs';
    } else if (res.spec?.schedule !== undefined) {
      inferredKind = 'cronjobs';
    } else if (res.status?.podIP !== undefined || (res.spec?.containers && !res.spec?.template)) {
      inferredKind = 'pods';
    } else if (res.status?.nodeInfo !== undefined) {
      inferredKind = 'nodes';
    } else if (res.spec?.template !== undefined) {
      inferredKind = 'workloads';
    }

    const isJob = activeTab === 'jobs' || inferredKind === 'jobs';
    const isCronJob = activeTab === 'cronjobs' || inferredKind === 'cronjobs';
    const isPod = activeTab === 'pods' || inferredKind === 'pods';
    const isNode = activeTab === 'nodes' || inferredKind === 'nodes';
    const isWorkload = ['deployments', 'statefulsets', 'daemonsets'].includes(activeTab) || inferredKind === 'workloads';

    if (isPod) {
      // A pod with a deletionTimestamp is on its way out — show that clearly
      // instead of leaving it as "Running" until it disappears.
      if (res.metadata?.deletionTimestamp) {
        return (
          <span className="badge" style={{ background: 'var(--accent-warning)10', color: 'var(--accent-warning)', borderColor: 'var(--accent-warning)30' }}>
            Terminating
          </span>
        );
      }

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
    } else if (isWorkload) {
      const ready = res.status?.readyReplicas || res.status?.numberReady || 0;
      const specReplicas = res.spec?.replicas;
      const desired = res.status?.replicas ?? res.status?.desiredNumberScheduled ?? specReplicas ?? 0;
      // A deployment scaled to 0 is "Stopped" — make that explicit rather than
      // showing a bare "0/0 Ready" that reads like a problem.
      if (specReplicas === 0 || desired === 0) {
        status = 'Stopped';
        type = 'warning';
      } else {
        status = `${ready}/${desired} Ready`;
        type = (ready === desired && desired > 0) ? 'success' : 'warning';
      }
    } else if (isNode) {
      const readyCond = (res.status?.conditions || []).find((c: any) => c.type === 'Ready');
      status = readyCond?.status === 'True' ? 'Ready' : 'NotReady';
      type = status === 'Ready' ? 'success' : 'error';
    } else if (isJob) {
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
    } else if (isCronJob) {
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

  const pluralizeKind = (k: string) => {
    if (k.endsWith('s')) return k.toLowerCase();
    return k.toLowerCase() + 's';
  };

  const refreshResources = () => {
    // Resource lists are cached under ['resources', kind, namespace]; the topology
    // and dashboard widgets under their own keys. Invalidate them all so the UI
    // reflects stop/start/restart/scale/delete actions immediately instead of
    // waiting for the next poll.
    queryClient.invalidateQueries({ queryKey: ['resources'] });
    queryClient.invalidateQueries({ queryKey: ['topology'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  };

  const { handleRestart, handleScale, handleStop, handleStart, handleDelete } = useClusterActions(refreshResources);

  const handleOpenDiagnostics = (name: string, namespace: string) => {
    setModal({ type: 'diagnose', kind: 'pods', name, namespace });
  };

  const fetchHelmInspect = async (name: string, namespace: string) => {
    setModal({ type: 'values', kind: 'helm', name, namespace });
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

  const stats = {
    nodes: (nodeMetrics || []).length,
    pods: (podMetrics || []).length,
    deployments: (allDeployments || []).length
  };

  // Controls the off-canvas sidebar drawer on small / touch screens.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="layout-container">
      {mobileNavOpen && <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setSearch={setSearch}
        collapsedSections={collapsedSections}
        toggleSection={toggleSection}
        setCustomCrd={setCustomCrd}
        isOpen={mobileNavOpen}
        onNavigate={() => setMobileNavOpen(false)}
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
          onToggleSidebar={() => setMobileNavOpen(v => !v)}
        />

        <div className="content-area">
          {activeTab === 'dashboard' && (
            <ErrorBoundary fallbackTitle="Stats Grid">
              <StatsGrid 
                stats={stats} 
                nodeMetrics={nodeMetrics || []} 
                getNodeCapacity={getNodeCapacity} 
                setActiveTab={setActiveTab} 
              />
            </ErrorBoundary>
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

          <ErrorBoundary fallbackTitle={`${activeTab.charAt(0).toUpperCase() + activeTab.slice(1).replace('-', ' ')} View`}>
            {activeTab === 'topology' ? (
              <TopologyView 
                topologyMode={topologyMode}
                topologyData={topologyData || { nodes: [], services: [], deployments: [], pods: [] }} 
                selectedNs={selectedNs}
                hoveredTopologyItem={hoveredTopologyItem}
                setHoveredTopologyItem={setHoveredTopologyItem}
                podMetrics={podMetrics || []}
                setModal={setModal}
                handleOpenDiagnostics={handleOpenDiagnostics}
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
                runningImagesScanResults={runningImagesScanResults}
                isScanningAllRunningImages={isScanningAllRunningImages}
                scanSingleImage={scanSingleImage}
                fetchRunningImagesAndScan={fetchRunningImagesAndScan}
                enableAutoScan={enableAutoScan}
                handleToggleAutoScan={handleToggleAutoScan}
                grypeDbStatus={grypeDbStatus}
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
            ) : activeTab === 'autoscale-manager' ? (
              <AutoscaleManagerView selectedNs={selectedNs} />
            ) : activeTab === 'backup-restore' ? (
              <BackupRestoreView selectedNs={selectedNs} />
            ) : activeTab === 'cronjobs' ? (
              <CronJobManagerView selectedNs={selectedNs} />
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
                handleStop={handleStop}
                handleStart={handleStart}
                handleDrillDownToPods={handleDrillDownToPods}
                handleOpenServiceWebsite={handleOpenServiceWebsite}
                establishingPortForward={establishingPortForward}
                handleOpenDiagnostics={handleOpenDiagnostics}
                handleDelete={(res) => handleDelete(activeTab, res.metadata.name, res.metadata.namespace)}
                setIsEditingYaml={setIsEditingYaml}
                renderStatusBadge={renderStatusBadge}
                renderSmallSparkline={renderSmallSparkline}
              />
            )}
          </ErrorBoundary>
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

function App() {
  return (
    <AppProvider>
      <AppProvidersInner />
    </AppProvider>
  );
}

function AppProvidersInner() {
  const { selectedNs } = useAppContext();
  return (
    <ScannerProvider>
      <ModalProvider selectedNs={selectedNs}>
        <AppContent />
      </ModalProvider>
    </ScannerProvider>
  );
}

export default App;
