const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, '..', 'frontend', 'src', 'App.tsx');
let content = fs.readFileSync(appFile, 'utf8');

// 1. Add fetchScannerConfig to the mount useEffect
const oldEffect = `  useEffect(() => {
    fetchNamespaces();
    fetchZarfStatus();
    fetchContexts();
  }, []);`;

const newEffect = `  useEffect(() => {
    fetchNamespaces();
    fetchZarfStatus();
    fetchContexts();
    fetchScannerConfig();
  }, []);`;

if (content.includes(oldEffect)) {
    content = content.replace(oldEffect, newEffect);
    console.log('Successfully updated mount useEffect with fetchScannerConfig');
} else {
    console.log('Could not find exact mount useEffect to replace');
}

// Helper to remove block between two markers (exclusive of end marker, inclusive of start marker)
function removeBlock(startMarker, endMarker, replacement = '') {
    const startIdx = content.indexOf(startMarker);
    if (startIdx === -1) {
        console.log(`Could not find start marker: ${startMarker}`);
        return false;
    }
    const endIdx = content.indexOf(endMarker, startIdx);
    if (endIdx === -1) {
        console.log(`Could not find end marker: ${endMarker}`);
        return false;
    }
    content = content.slice(0, startIdx) + replacement + content.slice(endIdx);
    console.log(`Successfully removed/replaced block starting with "${startMarker.slice(0, 40)}..."`);
    return true;
}

// 2. Remove renderPodStatusDoughnut, renderResourceBarChart, renderSparkline, renderDashboardView
// This block ends just before the comment and state for selectedHelmRelease
const dashboardStart = '  const renderPodStatusDoughnut = (phases: { running: number,';
const dashboardEnd = '  // We need this state as well\n  const [selectedHelmRelease,';
removeBlock(dashboardStart, dashboardEnd);

// 3. Remove renderHelmReleasesView, renderHelmInstallView, renderHelmReposView
// This block ends just before renderZarfPackagesView
const helmStart = '  const renderHelmReleasesView = () => {';
const helmEnd = '  const renderZarfPackagesView = () => {';
removeBlock(helmStart, helmEnd);

// 4. Remove renderZarfPackagesView, renderZarfDeployView, renderZarfSbomView
// This block ends just before renderImageScannerView
const zarfStart = '  const renderZarfPackagesView = () => {';
const zarfEnd = '  const renderImageScannerView = () => {';
removeBlock(zarfStart, zarfEnd);

// 5. Remove renderImageScannerView
// This block ends just before renderKubescapeView
const scannerStart = '  const renderImageScannerView = () => {';
const scannerEnd = '  const renderKubescapeView = () => {';
removeBlock(scannerStart, scannerEnd);

// 6. Remove renderKubescapeView
// This block ends just before renderZarfRegistryView
const kubescapeStart = '  const renderKubescapeView = () => {';
const kubescapeEnd = '  const renderZarfRegistryView = () => {';
removeBlock(kubescapeStart, kubescapeEnd);

// 7. Remove renderZarfRegistryView
// This block ends just before renderPodFilesTab
const registryStart = '  const renderZarfRegistryView = () => {';
const registryEnd = '  const renderPodFilesTab = () => {';
removeBlock(registryStart, registryEnd);

// 8. Remove renderPodFilesTab
// This block ends just before return (
const filesStart = '  const renderPodFilesTab = () => {';
const filesEnd = '  return (\n    <div className="layout-container">';
removeBlock(filesStart, filesEnd);


// 9. Now replace all the render calls in the return JSX with the modular components

const oldRenderCallBlock = `          {loading ? (
            <div className="loader-container"><div className="loader"></div></div>
          ) : activeTab === 'topology' ? (
            renderTopologyView()
          ) : activeTab === 'zarf' ? (
            renderZarfPackagesView()
          ) : activeTab === 'zarf-deploy' ? (
            renderZarfDeployView()
          ) : activeTab === 'zarf-registry' ? (
            renderZarfRegistryView()
          ) : activeTab === 'zarf-sbom' ? (
            renderZarfSbomView()
          ) : activeTab === 'image-scanner' ? (
            renderImageScannerView()
          ) : activeTab === 'kubescape' ? (
            renderKubescapeView()
          ) : activeTab === 'helm' ? (
            renderHelmReleasesView()
          ) : activeTab === 'helm-install' ? (
            renderHelmInstallView()
          ) : activeTab === 'helm-repos' ? (
            renderHelmReposView()
          ) : activeTab === 'dashboard' ? (
            renderDashboardView()
          ) : (`;

const newRenderCallBlock = `          {loading ? (
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
              podMetricsHistory={podMetricsHistory}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              setSearch={setSearch}
              setModal={setModal}
              setSelectedContainer={setSelectedContainer}
              handleRestart={handleRestart}
              handleScale={handleScale}
              handleDrillDownToPods={handleDrillDownToPods}
              fetchTopologyData={fetchTopologyData}
            />
          ) : activeTab === 'zarf' || activeTab === 'zarf-deploy' || activeTab === 'zarf-registry' || activeTab === 'zarf-sbom' ? (
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
          ) : activeTab === 'image-scanner' ? (
            <ImageScannerView
              runningImages={runningImages}
              runningImagesScanResults={runningImagesScanResults}
              isScanningAllRunningImages={isScanningAllRunningImages}
              selectedScanFilterImage={selectedScanFilterImage}
              setSelectedScanFilterImage={setSelectedScanFilterImage}
              imageScannerActiveTab={imageScannerActiveTab}
              setImageScannerActiveTab={setImageScannerActiveTab}
              imageScanSearchQuery={imageScanSearchQuery}
              setImageScanSearchQuery={setImageScanSearchQuery}
              imageScanSeverityFilter={imageScanSeverityFilter}
              setImageScanSeverityFilter={setImageScanSeverityFilter}
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
          ) : activeTab === 'helm' || activeTab === 'helm-install' || activeTab === 'helm-repos' ? (
            <HelmManagerView
              resources={resources}
              selectedNs={selectedNs}
              search={search}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              setModal={setModal}
              handleDelete={handleDelete}
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
          ) : activeTab === 'dashboard' ? (
            <DashboardView
              dashboardData={dashboardData}
              cpuHistory={cpuHistory}
              memHistory={memHistory}
              setActiveTab={setActiveTab}
              setSearch={setSearch}
              setIsCmdPaletteOpen={setIsCmdPaletteOpen}
              zarfStatus={zarfStatus}
            />
          ) : (`;

if (content.includes(oldRenderCallBlock)) {
    content = content.replace(oldRenderCallBlock, newRenderCallBlock);
    console.log('Successfully replaced activeTab render calls with modular views');
} else {
    console.log('Could not find exact activeTab render calls block to replace');
}

// 10. Replace renderPodFilesTab() call inside the files modal block
const oldPodFilesCall = `              {modal.type === 'files' ? (
                renderPodFilesTab()`;

const newPodFilesCall = `              {modal.type === 'files' ? (
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
                />`;

if (content.includes(oldPodFilesCall)) {
    content = content.replace(oldPodFilesCall, newPodFilesCall);
    console.log('Successfully replaced renderPodFilesTab() call with PodFilesExplorer component');
} else {
    console.log('Could not find exact renderPodFilesTab() call block to replace');
}

fs.writeFileSync(appFile, content, 'utf8');
console.log('Refactoring finished successfully!');
