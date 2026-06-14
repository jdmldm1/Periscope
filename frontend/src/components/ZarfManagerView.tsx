import React, { useEffect, useRef } from 'react';
import { Network } from 'vis-network';
import { Package, Trash2, Activity, Search, Download, Upload, FileText, X, RefreshCw, Copy, Shield } from 'lucide-react';

interface ZarfManagerViewProps {
  resources: any[];
  search: string;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  zarfStatus: { installed: boolean; version?: string };
  zarfViewMode: 'packages' | 'local' | 'tools' | 'edit' | 'registry' | 'sbom';
  setZarfViewMode: (mode: 'packages' | 'local' | 'tools' | 'edit' | 'registry' | 'sbom') => void;
  isClearingZarfCache: boolean;
  handleClearZarfCache: () => void;
  zarfLocalPackages: any[];
  fetchZarfLocalPackages: () => void;
  handleDeleteWorkspaceItem: (name: string) => void;
  handleCompressFolder: (folderName: string) => void;
  handleDecompressPackage: (packageName: string) => void;
  handleUnpackZarfPackage: (path: string) => void;
  isUnpackingZarf: boolean;
  selectedZarfPackagePath: string;
  zarfConfigText: string;
  setZarfConfigText: (text: string) => void;
  isSavingZarfConfig: boolean;
  handleRebuildAndDeployZarf: () => void;
  setZarfUnpackTempDir: (dir: string) => void;
  
  // Package Upload / Deploy States
  isDeployModalOpen: boolean;
  setIsDeployModalOpen: (open: boolean) => void;
  zarfUploadFile: File | null;
  setZarfUploadFile: (file: File | null) => void;
  zarfConfigFile: File | null;
  setZarfConfigFile: (file: File | null) => void;
  zarfUploadProgress: number;
  setZarfUploadProgress: (progress: number) => void;
  handleUploadZarfPackage: () => void;
  selectedZarfConfigPath: string;
  setSelectedZarfConfigPath: (path: string) => void;
  handleDeployLocalPackage: (path: string) => void;
  
  // SBOM States
  sbomPackageName: string;
  setSbomPackageName: (name: string) => void;
  sbomExtractedFiles: Array<{ name: string; url: string }>;
  setSbomExtractedFiles: (files: Array<{ name: string; url: string }>) => void;
  sbomSelectedFileUrl: string;
  setSbomSelectedFileUrl: (url: string) => void;
  isExtractingSbom: boolean;
  handleExtractSbom: () => void;
  
  // Inspect package detail
  selectedZarfPackageDetail: any;
  setSelectedZarfPackageDetail: (detail: any) => void;
  isPackageDetailModalOpen: boolean;
  setIsPackageDetailModalOpen: (open: boolean) => void;
  isFetchingPackageDetail: boolean;
  handleInspectDeployedZarfPackage: (name: string) => void;
  handleRemoveZarfPackage: (name: string) => void;
  selectedZarfGraphPkg: string | null;
  setSelectedZarfGraphPkg: (pkg: string | null) => void;

  // Registry States
  registryPullSource: string;
  setRegistryPullSource: (source: string) => void;
  registryPullTarget: string;
  setRegistryPullTarget: (target: string) => void;
  handlePullRegistryImage: (e: React.FormEvent) => void;
  isPullingRegistry: boolean;
  registryPushTarget: string;
  setRegistryPushTarget: (target: string) => void;
  handlePushRegistryImage: (e: React.FormEvent) => void;
  isPushingRegistry: boolean;
  zarfRegistryImages: any[];
  isFetchingRegistry: boolean;
  fetchZarfRegistryImages: () => void;
  handleDownloadRegistryImage: (full: string) => void;
  handleDeleteRegistryImage: (repository: string, tag: string) => void;
  handlePruneRegistry: () => void;
}

export const ZarfManagerView: React.FC<ZarfManagerViewProps> = ({
  resources,
  search,
  activeTab,
  setActiveTab: _setActiveTab,
  zarfStatus,
  zarfViewMode,
  setZarfViewMode,
  isClearingZarfCache,
  handleClearZarfCache,
  zarfLocalPackages,
  fetchZarfLocalPackages,
  handleDeleteWorkspaceItem,
  handleCompressFolder,
  handleDecompressPackage,
  handleUnpackZarfPackage,
  isUnpackingZarf,
  selectedZarfPackagePath,
  zarfConfigText,
  setZarfConfigText,
  isSavingZarfConfig,
  handleRebuildAndDeployZarf,
  isDeployModalOpen,
  setIsDeployModalOpen,
  zarfUploadFile,
  setZarfUploadFile,
  zarfConfigFile,
  setZarfConfigFile,
  zarfUploadProgress,
  handleUploadZarfPackage,
  selectedZarfConfigPath,
  setSelectedZarfConfigPath,
  handleDeployLocalPackage,
  sbomPackageName,
  setSbomPackageName,
  sbomExtractedFiles,
  sbomSelectedFileUrl,
  setSbomSelectedFileUrl,
  isExtractingSbom,
  handleExtractSbom,
  selectedZarfPackageDetail,
  isPackageDetailModalOpen,
  setIsPackageDetailModalOpen,
  isFetchingPackageDetail,
  handleInspectDeployedZarfPackage,
  handleRemoveZarfPackage,
  selectedZarfGraphPkg,
  setSelectedZarfGraphPkg,
  registryPullSource,
  setRegistryPullSource,
  registryPullTarget,
  setRegistryPullTarget,
  handlePullRegistryImage,
  isPullingRegistry,
  registryPushTarget,
  setRegistryPushTarget,
  handlePushRegistryImage,
  isPushingRegistry,
  zarfRegistryImages,
  isFetchingRegistry,
  fetchZarfRegistryImages,
  handleDownloadRegistryImage,
  handleDeleteRegistryImage,
  handlePruneRegistry,
}) => {

  // Auto-close modal when upload progress finishes and resets to -1
  const prevProgressRef = useRef(zarfUploadProgress);
  useEffect(() => {
    if (prevProgressRef.current >= 0 && zarfUploadProgress === -1) {
      setIsDeployModalOpen(false);
    }
    prevProgressRef.current = zarfUploadProgress;
  }, [zarfUploadProgress]);

  const filteredResources = resources.filter(r => {
    const term = search.toLowerCase();
    if (!term) return true;
    const name = r.name || r.Name || r.package || r.Package || '';
    return name.toLowerCase().includes(term);
  });

  const buildZarfGraphData = (pkg: any, pods: any[]) => {
    const nodes: any[] = [];
    const edges: any[] = [];
    const pkgName = pkg.name || pkg.Name || pkg.package || pkg.Package || 'zarf-package';
    
    nodes.push({
      id: 'package',
      label: `📦 ${pkgName}\n(Zarf Package)`,
      shape: 'box',
      margin: 12,
      font: { color: '#fff', size: 13, bold: true },
      color: {
        background: '#1e293b',
        border: '#3b82f6',
        highlight: { background: '#334155', border: '#60a5fa' }
      },
      borderWidth: 2
    });

    const componentsList = Array.isArray(pkg.deployedComponents)
      ? pkg.deployedComponents.map((c: any) => c.name || c)
      : (Array.isArray(pkg.components) 
         ? pkg.components.map((c: any) => c.name || c)
         : []);

    componentsList.forEach((compName: string, idx: number) => {
      const compPods = pods.filter(p => p.metadata?.labels?.['zarf.dev/component'] === compName);
      const isHealthy = compPods.length > 0 && compPods.every(p => p.status?.phase === 'Running');
      const isPending = compPods.length > 0 && compPods.some(p => p.status?.phase === 'Pending');
      
      let nodeColor = '#64748b';
      if (compPods.length > 0) {
        if (isHealthy) nodeColor = '#10b981';
        else if (isPending) nodeColor = '#f59e0b';
        else nodeColor = '#ef4444';
      }

      nodes.push({
        id: `comp-${compName}`,
        label: `⚙️ ${compName}\n(${compPods.length} pods)`,
        shape: 'box',
        margin: 10,
        font: { color: '#fff', size: 11 },
        color: {
          background: '#0f172a',
          border: nodeColor,
          highlight: { background: '#1e293b', border: nodeColor }
        },
        borderWidth: 2
      });

      edges.push({
        from: 'package',
        to: `comp-${compName}`,
        arrows: 'to',
        dashes: true,
        color: { color: '#475569', highlight: '#94a3b8' }
      });

      if (idx > 0) {
        const prevCompName = componentsList[idx - 1];
        edges.push({
          from: `comp-${prevCompName}`,
          to: `comp-${compName}`,
          arrows: 'to',
          label: 'deploy order',
          font: { size: 8, color: 'var(--text-muted)', align: 'horizontal' },
          color: { color: '#fb923c', highlight: '#fdba74' },
          smooth: { type: 'curvedCW', roundness: 0.15 }
        });
      }
    });

    return { nodes, edges };
  };

  const ZarfComponentGraph: React.FC<{ pkg: any; pods: any[] }> = ({ pkg, pods }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
      if (!containerRef.current) return;
      
      const graphData = buildZarfGraphData(pkg, pods);
      const options = {
        physics: {
          stabilization: true,
          barnesHut: {
            gravitationalConstant: -1800,
            centralGravity: 0.25,
            smoothCurves: true,
            springLength: 90,
            springConstant: 0.035
          }
        },
        layout: {
          hierarchical: {
            enabled: true,
            direction: 'UD',
            sortMethod: 'directed',
            nodeSpacing: 160
          }
        }
      };
      
      const network = new Network(containerRef.current, graphData, options);
      return () => network.destroy();
    }, [pkg, pods]);

    return (
      <div 
        ref={containerRef} 
        style={{ 
          height: '240px', 
          background: '#040711', 
          border: '1px solid var(--border-color)', 
          borderRadius: 6,
          position: 'relative'
        }} 
      />
    );
  };

  const renderZarfPackagesView = () => {
    return (
      <div className="zarf-packages-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        
        {/* Status Bar */}
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                className="btn btn-danger" 
                onClick={handleClearZarfCache}
                disabled={isClearingZarfCache}
              >
                <Trash2 size={14} /> Clear Cache
              </button>
              <button className="btn btn-primary" onClick={() => setIsDeployModalOpen(true)}>
                <Package size={14} /> Deploy New Package
              </button>
            </div>
          )}
        </div>

        {/* Deployed Packages Section */}
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
              {filteredResources.map((pkg: any) => {
                const name = pkg.metadata?.name || pkg.name || pkg.Name || pkg.package || pkg.Package || 'Unknown';
                const version = pkg.version || pkg.Version || 'N/A';
                const arch = pkg.architecture || pkg.arch || pkg.Architecture || 'N/A';
                const components = Array.isArray(pkg.deployedComponents) 
                  ? pkg.deployedComponents.map((c: any) => c.name || c).join(', ')
                  : (Array.isArray(pkg.components) ? pkg.components.join(', ') : String(pkg.components || 'N/A'));
                
                return (
                  <div 
                    key={name}
                    className="resource-row animate-fade-in"
                    style={{
                      padding: '16px 20px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
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
                          onClick={() => setSelectedZarfGraphPkg(selectedZarfGraphPkg === name ? null : name)}
                          style={{
                            background: selectedZarfGraphPkg === name ? 'rgba(59, 130, 246, 0.15)' : 'none',
                            borderColor: selectedZarfGraphPkg === name ? 'var(--accent-blue)' : 'var(--border-color)'
                          }}
                        >
                          <Activity size={14} style={{ marginRight: 4 }} /> Graph
                        </button>
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

                    {selectedZarfGraphPkg === name && (
                      <div style={{ width: '100%', marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600, letterSpacing: '0.5px' }}>
                          ZARF COMPONENT DEPLOYMENT DEPENDENCY TREE:
                        </div>
                        <ZarfComponentGraph pkg={pkg} pods={resources.filter((r: any) => r.kind === 'Pod')} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Local Workspace Files Section */}
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Local Workspace Files ({zarfLocalPackages.length})</h3>
            <button className="btn btn-icon" onClick={fetchZarfLocalPackages}>
              <RefreshCw size={14} />
            </button>
          </div>

          {zarfLocalPackages.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '16px 0', textAlign: 'center' }}>
              No local workspace files or package archives found.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                        {isPackage && <span className="badge badge-running" style={{ textTransform: 'none', background: 'rgba(57, 255, 20, 0.1)', color: '#39ff14', borderColor: '#39ff14' }}>Zarf Archive</span>}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Size: <span style={{ color: 'var(--text-main)', marginRight: 12 }}>{pkg.isDir ? 'N/A' : `${(pkg.size / (1024 * 1024)).toFixed(1)} MB`}</span>
                        Modified: <span style={{ color: 'var(--text-main)' }}>{new Date(pkg.mtime).toLocaleString()}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(pkg.name.endsWith('.yaml') || pkg.name.endsWith('.yml')) && (
                        <button 
                          className={`btn ${selectedZarfConfigPath === pkg.path ? 'btn-primary' : ''}`}
                          onClick={() => setSelectedZarfConfigPath(selectedZarfConfigPath === pkg.path ? '' : pkg.path)}
                          style={selectedZarfConfigPath === pkg.path ? { background: 'var(--accent-green)', color: '#000' } : {}}
                        >
                          {selectedZarfConfigPath === pkg.path ? 'Active Config' : 'Set as Config'}
                        </button>
                      )}
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

        {/* Upload & Deploy Popup Modal */}
        {isDeployModalOpen && (
          <div 
            className="modal-overlay" 
            onClick={() => {
              if (zarfUploadProgress < 0) setIsDeployModalOpen(false);
            }}
            style={{ zIndex: 1000 }}
          >
            <div 
              className="modal-content animate-fade-in" 
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 550 }}
            >
              <div className="modal-header">
                <h3 className="modal-title">Upload & Deploy Zarf Package</h3>
                {zarfUploadProgress < 0 && (
                  <button className="btn btn-icon" onClick={() => setIsDeployModalOpen(false)}>
                    <X size={16} />
                  </button>
                )}
              </div>
              
              <div className="modal-body" style={{ padding: 24, minHeight: 'auto', gap: 16 }}>
                <div 
                  style={{ 
                    border: '2px dashed var(--border-color)', 
                    borderRadius: 6, 
                    padding: '30px 20px', 
                    textAlign: 'center', 
                    background: 'rgba(0,0,0,0.1)', 
                    cursor: zarfUploadProgress >= 0 ? 'not-allowed' : 'pointer'
                  }}
                  onClick={() => {
                    if (zarfUploadProgress < 0) {
                      document.getElementById('zarf-modal-file-input')?.click();
                    }
                  }}
                >
                  <input 
                    type="file" 
                    id="zarf-modal-file-input" 
                    style={{ display: 'none' }} 
                    accept=".zst"
                    disabled={zarfUploadProgress >= 0}
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

                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '16px 20px' }}>
                  <h4 style={{ fontSize: '0.85rem', marginBottom: 8, color: 'var(--text-main)' }}>Optional: Zarf Configuration (zarf-config.yaml)</h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <input 
                      type="file" 
                      id="zarf-modal-config-input" 
                      style={{ display: 'none' }} 
                      accept=".yaml,.yml"
                      disabled={zarfUploadProgress >= 0}
                      onChange={e => {
                        const files = e.target.files;
                        if (files && files.length > 0) {
                          setZarfConfigFile(files[0]);
                        }
                      }}
                    />
                    <button 
                      className="btn" 
                      onClick={() => {
                        if (zarfUploadProgress < 0) {
                          document.getElementById('zarf-modal-config-input')?.click();
                        }
                      }}
                      disabled={zarfUploadProgress >= 0}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <FileText size={14} /> {zarfConfigFile ? 'Change Config' : 'Browse Config'}
                    </button>
                    {zarfConfigFile ? (
                      <div style={{ fontSize: '0.85rem', color: 'var(--accent-green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Shield size={14} /> {zarfConfigFile.name}
                        <button className="btn btn-sm btn-icon" onClick={() => setZarfConfigFile(null)}><X size={12}/></button>
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No config file selected (optional)</div>
                    )}
                  </div>
                </div>

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

              <div className="modal-footer">
                <button 
                  className="btn" 
                  onClick={() => setIsDeployModalOpen(false)}
                  disabled={zarfUploadProgress >= 0}
                >
                  Close
                </button>
                {zarfUploadFile && (
                  <button 
                    className="btn btn-primary" 
                    onClick={handleUploadZarfPackage}
                    disabled={zarfUploadProgress >= 0}
                  >
                    Upload & Deploy
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Inspect Deployed Package Modal */}
        {isPackageDetailModalOpen && selectedZarfPackageDetail && (
          <div 
            className="modal-overlay" 
            onClick={() => setIsPackageDetailModalOpen(false)}
            style={{ zIndex: 1000 }}
          >
            <div 
              className="modal-content animate-fade-in" 
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 800, width: '90%' }}
            >
              <div className="modal-header">
                <h3 className="modal-title">
                  🔍 Deployed Zarf Package: {selectedZarfPackageDetail.name || selectedZarfPackageDetail.metadata?.name || 'Details'}
                </h3>
                <button className="btn btn-icon" onClick={() => setIsPackageDetailModalOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              
              <div className="modal-body" style={{ padding: 24, minHeight: 'auto', gap: 16, maxHeight: '65vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'rgba(255,255,255,0.02)', padding: 16, borderRadius: 6, border: '1px solid var(--border-color)' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Package Name:</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{selectedZarfPackageDetail.name || selectedZarfPackageDetail.metadata?.name || 'N/A'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Version:</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{selectedZarfPackageDetail.version || 'N/A'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Architecture:</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{selectedZarfPackageDetail.architecture || 'N/A'}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Timestamp:</span>
                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{selectedZarfPackageDetail.timestamp || 'N/A'}</div>
                  </div>
                </div>

                {selectedZarfPackageDetail.components && (
                  <div>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: 8, color: 'var(--text-main)' }}>Package Components ({selectedZarfPackageDetail.components.length})</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {selectedZarfPackageDetail.components.map((c: any, idx: number) => (
                        <div key={idx} style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '10px 14px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--accent-blue)', fontSize: '0.85rem' }}>
                            {c.name} {c.required ? <span style={{ color: 'var(--accent-error)', fontSize: '0.75rem' }}>(Required)</span> : ''}
                          </div>
                          {c.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>{c.description}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 style={{ fontSize: '0.9rem', marginBottom: 8, color: 'var(--text-main)' }}>Raw Manifest JSON</h4>
                  <pre style={{ 
                    background: 'var(--bg-main)', 
                    border: '1px solid var(--border-color)', 
                    borderRadius: 4, 
                    padding: 12, 
                    fontSize: '0.8rem', 
                    fontFamily: 'var(--font-mono)', 
                    maxHeight: 250, 
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    color: 'var(--text-main)'
                  }}>
                    {JSON.stringify(selectedZarfPackageDetail, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="modal-footer">
                <button 
                  className="btn" 
                  onClick={() => setIsPackageDetailModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderZarfDeployView = () => {
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
              setZarfViewMode('packages');
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
                setZarfViewMode('packages');
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
                style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)', outline: 'none' }}
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

  const renderZarfRegistryView = () => {
    return (
      <div className="zarf-registry-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Download size={18} style={{ color: 'var(--accent-blue)' }} /> Pull / Copy Upstream Image
            </h3>
            <form onSubmit={handlePullRegistryImage} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Source Image (e.g. nginx:alpine)</label>
                <input 
                  type="text"
                  className="exec-input"
                  style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)' }}
                  placeholder="e.g. nginx:alpine"
                  value={registryPullSource}
                  onChange={e => setRegistryPullSource(e.target.value)}
                  required
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target Local Tag</label>
                <input 
                  type="text"
                  className="exec-input"
                  style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)' }}
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
                  style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)' }}
                  required
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Target Local Tag</label>
                <input 
                  type="text"
                  className="exec-input"
                  style={{ padding: '8px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)' }}
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

        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0 }}>Local Registry Images ({zarfRegistryImages.length})</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={handlePruneRegistry}>
                Prune Unused
              </button>
              <button className="btn btn-icon" onClick={fetchZarfRegistryImages} disabled={isFetchingRegistry}>
                <RefreshCw size={14} className={isFetchingRegistry ? 'spin' : ''} />
              </button>
            </div>
          </div>

          {isFetchingRegistry ? (
            <div style={{ color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>
              <div className="loader" style={{ margin: '0 auto 12px auto' }}></div>
              Fetching images and tags...
            </div>
          ) : zarfRegistryImages.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center', border: '1px dashed var(--border-color)', borderRadius: 8 }}>
              No images found in the local Zarf registry.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 180px', padding: '0 14px 8px 14px', borderBottom: '1px solid var(--border-color)', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                <div>REPOSITORY:TAG</div>
                <div>TAG</div>
                <div style={{ textAlign: 'right' }}>ACTIONS</div>
              </div>
              {zarfRegistryImages.map((img, idx) => (
                <div 
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 150px 180px',
                    alignItems: 'center',
                    padding: '12px 14px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 6
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                    {img.repository}
                  </div>
                  <div>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      background: 'rgba(96, 165, 250, 0.1)', 
                      color: 'var(--accent-blue)', 
                      padding: '2px 8px', 
                      borderRadius: 4, 
                      border: '1px solid rgba(96, 165, 250, 0.2)' 
                    }}>
                      {img.tag}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button 
                      className="btn btn-sm" 
                      title="Download as TAR"
                      onClick={() => handleDownloadRegistryImage(img.full)}
                      style={{ padding: '4px 8px' }}
                    >
                      <Download size={14} />
                    </button>
                    <button 
                      className="btn btn-sm" 
                      title="Copy Pull Command"
                      onClick={() => {
                        navigator.clipboard.writeText(`docker pull zarf-docker-registry.zarf.svc.cluster.local:5000/${img.full}`);
                        alert('Pull command copied to clipboard!');
                      }}
                      style={{ padding: '4px 8px' }}
                    >
                      <Copy size={14} />
                    </button>
                    <button 
                      className="btn btn-danger btn-sm" 
                      title="Delete Image"
                      onClick={() => handleDeleteRegistryImage(img.repository, img.tag)}
                      style={{ padding: '4px 8px' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (zarfViewMode === 'edit') {
    return renderZarfDeployView();
  }

  if (activeTab === 'zarf-registry') {
    return renderZarfRegistryView();
  }

  if (activeTab === 'zarf-sbom') {
    return renderZarfSbomView();
  }

  return renderZarfPackagesView();
};
