import { useState, useEffect } from 'react';
import {
  useTopologyData,
  useNodeMetrics,
  usePodMetrics,
  useDashboardStats,
  useZarfStatus,
  useK8sResources,
} from './utils/kubeHooks';
import { useClusterActions } from './hooks/useClusterActions';
import { useHelmManager } from './hooks/useHelmManager';
import { useZarfWorkspace } from './hooks/useZarfWorkspace';
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation';
import { useResourceWatcher } from './hooks/useResourceWatcher';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { CommandPalette } from './components/layout/CommandPalette';
import { ResourceListView } from './components/views/ResourceListView';
import { TopologyView } from './components/views/TopologyView';
import { ZarfManagerView } from './components/views/ZarfManagerView';
import { LogsView } from './components/views/LogsView';
import { ImageScannerView } from './components/views/ImageScannerView';
import { KubescapeView } from './components/views/KubescapeView';
import { HelmManagerView } from './components/views/HelmManagerView';
import { ClusterTerminalView } from './components/views/ClusterTerminalView';
import { TrafficInspectorView } from './components/views/TrafficInspectorView';
import { DashboardView } from './components/views/DashboardView';
import { AutoscaleManagerView } from './components/views/AutoscaleManagerView';
import { BackupRestoreView } from './components/views/BackupRestoreView';
import { CronJobManagerView } from './components/views/CronJobManagerView';
import { ModalManager } from './components/modals/ModalManager';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DeployZarfModal } from './components/modals/DeployZarfModal';
import { DeployHelmModal, type HelmDeployForm } from './components/modals/DeployHelmModal';
import { parseCpu, parseMem, matchesSelector, pluralizeKind, getNodeUsagePercent as computeNodeUsagePercent } from './utils/helpers';
import { renderStatusBadge, renderSparkline } from './utils/resourceStatus';
import { ChevronRight, Columns, Network as NetworkIcon } from 'lucide-react';
import { AppProvider, useAppContext } from './contexts/AppContext';
import { ScannerProvider, useScannerContext } from './contexts/ScannerContext';
import { ModalProvider, useModalContext } from './contexts/ModalContext';
import axios from 'axios';
import { LoginView } from './components/views/LoginView';
import { ChangePasswordModal } from './components/modals/ChangePasswordModal';
import { OrasView } from './components/views/OrasView';

function AppContent({ onLogout, onChangePassword }: { onLogout: () => void; onChangePassword: () => void }) {
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

  // Local UI state owned by the shell
  const [topologyMode, setTopologyMode] = useState<'columns' | 'graph'>('graph');
  const [hoveredTopologyItem, setHoveredTopologyItem] = useState<any>(null);
  const [podMetricsHistory, setPodMetricsHistory] = useState<Record<string, any>>({});
  const [establishingPortForward, setEstablishingPortForward] = useState<string | null>(null);
  const [cmdPaletteSearch, setCmdPaletteSearch] = useState('');
  const [kubescapeSearchQuery, setKubescapeSearchQuery] = useState('');
  const [kubescapeSeverityFilter, setKubescapeSeverityFilter] = useState('all');
  const [expandedControlId, setExpandedControlId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [helmDeployForm, setHelmDeployForm] = useState<HelmDeployForm>({ releaseName: '', repo: '', chartName: '', version: '', namespace: 'default', valuesYaml: '' });

  // Data fetching hooks for child views
  const { data: topologyData } = useTopologyData(selectedNs);
  const { data: nodeMetrics } = useNodeMetrics();
  const { data: podMetrics } = usePodMetrics();
  const { data: dashboardData } = useDashboardStats(selectedNs);
  const { data: zarfStatusData } = useZarfStatus();
  const { data: allPods } = useK8sResources('pods', selectedNs);
  const { data: allDeployments } = useK8sResources('deployments', selectedNs);

  const {
    helmRepos, searchRepos, isSearchingHelm, helmSearchResults,
    addRepo, removeRepo, updateRepos, newHelmRepo, setNewHelmRepo,
  } = useHelmManager();

  const zarf = useZarfWorkspace();

  const openCommandPalette = (initialQuery: string) => {
    setCmdPaletteSearch(initialQuery);
    setIsCmdPaletteOpen(true);
  };
  useKeyboardNavigation({ openCommandPalette });

  // Keep a short rolling history of per-pod CPU/memory usage to drive the
  // inline sparklines in the resource list.
  useEffect(() => {
    if (!podMetrics) return;
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
  }, [podMetrics]);

  const getNodeUsagePercent = (metric: any) => computeNodeUsagePercent(metric, filteredResources);

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

  // Opens a service in a new tab: prefer NodePort / LoadBalancer addresses, and
  // fall back to setting up an on-demand port-forward to a matching pod.
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
        remotePort: Number(targetPort),
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

  const tabTitle = activeTab.charAt(0).toUpperCase() + activeTab.slice(1).replace('-', ' ');

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
        onLogout={onLogout}
        onChangePassword={onChangePassword}
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
                  tabTitle
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
                <button className={`btn btn-sm ${topologyMode === 'columns' ? 'btn-primary' : ''}`} onClick={() => setTopologyMode('columns')} title="List View">
                  <Columns size={14} />
                </button>
                <button className={`btn btn-sm ${topologyMode === 'graph' ? 'btn-primary' : ''}`} onClick={() => setTopologyMode('graph')} title="Graph View">
                  <NetworkIcon size={14} />
                </button>
              </div>
            )}
          </div>

          <ErrorBoundary fallbackTitle={`${tabTitle} View`}>
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
                {...zarf}
                search={search}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                zarfStatus={zarfStatusData || { installed: true }}
              />
            ) : activeTab === 'oras' ? (
              <OrasView />
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
                kubescapeSearchQuery={kubescapeSearchQuery}
                setKubescapeSearchQuery={setKubescapeSearchQuery}
                kubescapeSeverityFilter={kubescapeSeverityFilter}
                setKubescapeSeverityFilter={setKubescapeSeverityFilter}
                expandedControlId={expandedControlId}
                setExpandedControlId={setExpandedControlId}
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
                namespace={selectedNs}
                pods={allPods || []}
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
                renderStatusBadge={(res) => renderStatusBadge(res, activeTab)}
                renderSmallSparkline={renderSparkline}
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

      <DeployZarfModal isOpen={isDeployZarfModalOpen} onClose={() => setIsDeployZarfModalOpen(false)} />
      <DeployHelmModal
        isOpen={isDeployHelmModalOpen}
        onClose={() => setIsDeployHelmModalOpen(false)}
        form={helmDeployForm}
        setForm={setHelmDeployForm}
        onSubmit={handleCustomHelmInstall}
      />
    </div>
  );
}

function App() {
  const [authState, setAuthState] = useState<{
    checked: boolean;
    enabled: boolean;
    authenticated: boolean;
    isDefault: boolean;
  }>({
    checked: false,
    enabled: true,
    authenticated: false,
    isDefault: false
  });

  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const { data } = await axios.get('/api/auth/status');
        const token = localStorage.getItem('periscope_token');
        if (data.enabled) {
          if (token) {
            setAuthState({
              checked: true,
              enabled: true,
              authenticated: true,
              isDefault: !!data.isDefault
            });
            if (data.isDefault) {
              setIsChangePasswordOpen(true);
            }
          } else {
            setAuthState({
              checked: true,
              enabled: true,
              authenticated: false,
              isDefault: !!data.isDefault
            });
          }
        } else {
          setAuthState({
            checked: true,
            enabled: false,
            authenticated: true,
            isDefault: false
          });
        }
      } catch (err) {
        console.error('Failed to check auth status:', err);
        const token = localStorage.getItem('periscope_token');
        setAuthState({
          checked: true,
          enabled: true,
          authenticated: !!token,
          isDefault: false
        });
      }
    };

    checkAuthStatus();
  }, []);

  const handleLoginSuccess = (token: string, isDefault: boolean) => {
    localStorage.setItem('periscope_token', token);
    setAuthState({
      checked: true,
      enabled: true,
      authenticated: true,
      isDefault: isDefault
    });
    if (isDefault) {
      setIsChangePasswordOpen(true);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout');
    } catch (e) {}
    localStorage.removeItem('periscope_token');
    setAuthState(prev => ({
      ...prev,
      authenticated: false
    }));
    setIsChangePasswordOpen(false);
  };

  const handlePasswordChanged = () => {
    setIsChangePasswordOpen(false);
    setAuthState(prev => ({
      ...prev,
      isDefault: false
    }));
  };

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          if (!error.config.url.includes('/auth/status') && !error.config.url.includes('/auth/login')) {
            localStorage.removeItem('periscope_token');
            setAuthState(prev => ({
              ...prev,
              authenticated: false
            }));
          }
        }
        return Promise.reject(error);
      }
    );
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  if (!authState.checked) {
    return <div className="loader-container"><div className="loader"></div></div>;
  }

  if (authState.enabled && !authState.authenticated) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <AppProvider>
      <AppProvidersInner onLogout={handleLogout} onChangePassword={() => setIsChangePasswordOpen(true)} />
      <ChangePasswordModal 
        isOpen={isChangePasswordOpen} 
        forced={authState.isDefault} 
        onPasswordChanged={handlePasswordChanged}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </AppProvider>
  );
}

function AppProvidersInner({ onLogout, onChangePassword }: { onLogout: () => void; onChangePassword: () => void }) {
  const { selectedNs } = useAppContext();
  return (
    <ScannerProvider>
      <ModalProvider selectedNs={selectedNs}>
        <AppContent onLogout={onLogout} onChangePassword={onChangePassword} />
      </ModalProvider>
    </ScannerProvider>
  );
}

export default App;
