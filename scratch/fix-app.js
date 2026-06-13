const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, '..', 'frontend', 'src', 'App.tsx');
let content = fs.readFileSync(appFile, 'utf8');

// 1. Remove Download, Upload unused imports
const oldImports = 'Globe, ExternalLink, Download, Upload,\n  Bell';
const newImports = 'Globe, ExternalLink,\n  Bell';
if (content.includes(oldImports)) {
    content = content.replace(oldImports, newImports);
    console.log('Fixed unused lucide imports');
}

// 2. Remove unused exportImageScanner functions
const startFuncs = '  const exportImageScannerVulnerabilitiesJson = () => {';
const endFuncs = '  const handleZarfUpload = async () => {';
const startIdx = content.indexOf(startFuncs);
if (startIdx !== -1) {
    const endIdx = content.indexOf(endFuncs, startIdx);
    if (endIdx !== -1) {
        content = content.slice(0, startIdx) + content.slice(endIdx);
        console.log('Removed unused exportImageScanner functions');
    }
}

// 3. Remove unused isTopologyItemConnected function
const startConnected = '  const isTopologyItemConnected = (colType: \'node\' | \'service\' | \'deployment\' | \'pod\', item: any) => {';
const endConnected = '  const renderSmallSparkline = (points: number[], color: string) => {';
const startCIdx = content.indexOf(startConnected);
if (startCIdx !== -1) {
    const endCIdx = content.indexOf(endConnected, startCIdx);
    if (endCIdx !== -1) {
        content = content.slice(0, startCIdx) + content.slice(endCIdx);
        console.log('Removed unused isTopologyItemConnected function');
    }
}

// 4. Update handleToggleAutoScan definition
const oldToggleDef = `  const handleToggleAutoScan = async (enabled: boolean) => {
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
  };`;

const newToggleDef = `  const handleToggleAutoScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  };`;

if (content.includes(oldToggleDef)) {
    content = content.replace(oldToggleDef, newToggleDef);
    console.log('Updated handleToggleAutoScan signature');
}

// 5. Update TopologyView instantiation to pass correct props
const oldTopoView = `            <TopologyView 
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
            />`;

const newTopoView = `            <TopologyView 
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
            />`;

if (content.includes(oldTopoView)) {
    content = content.replace(oldTopoView, newTopoView);
    console.log('Aligned TopologyView props');
} else {
    console.log('Could not find old TopologyView block to replace');
}

// 6. Update ZarfManagerView instantiation to pass correct props
const oldZarfView = `            <ZarfManagerView
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
            />`;

const newZarfView = `            <ZarfManagerView
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
            />`;

if (content.includes(oldZarfView)) {
    content = content.replace(oldZarfView, newZarfView);
    console.log('Aligned ZarfManagerView props');
} else {
    console.log('Could not find old ZarfManagerView block to replace');
}

fs.writeFileSync(appFile, content, 'utf8');
console.log('Fix script complete.');
