import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAppContext } from '../contexts/AppContext';
import { useZarfManager } from './useZarfManager';

// Encapsulates everything the Zarf Manager screen needs: the local workspace
// (upload / unpack / rebuild), the SBOM inspector, and the embedded registry
// browser. App.tsx used to hold all of this state and ~15 handlers inline; this
// hook keeps that surface in one place. The returned object's keys deliberately
// match ZarfManagerView's prop names so the caller can spread them directly.
export const useZarfWorkspace = () => {
  const { api, queryClient, activeTab } = useAppContext();
  const { zarfPackages, removePackage } = useZarfManager();

  // Workspace / packages
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

  // SBOM inspector
  const [sbomPackageName, setSbomPackageName] = useState('');
  const [sbomExtractedFiles, setSbomExtractedFiles] = useState<any[]>([]);
  const [sbomSelectedFileUrl, setSbomSelectedFileUrl] = useState('');
  const [isExtractingSbom, setIsExtractingSbom] = useState(false);

  // Registry browser
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

  // Refresh the workspace + registry whenever the user lands on a Zarf screen,
  // and keep the sub-view in sync with which Zarf tab is active.
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
          'x-target-ref': registryPushTarget,
        },
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
          'x-file-name': zarfUploadFile.name,
        },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setZarfUploadProgress(percent);
        },
      });
      const packagePath = uploadRes.data.filepath;

      let configPath = '';
      if (zarfConfigFile) {
        const configText = await zarfConfigFile.text();
        const configRes = await api.post(`/zarf/config`, {
          content: configText,
          filename: zarfConfigFile.name || 'zarf-config.yaml',
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

  // Keys mirror ZarfManagerView's prop names so the caller can spread this whole
  // object onto the component.
  return {
    resources: zarfPackages || [],
    zarfViewMode, setZarfViewMode,
    isClearingZarfCache, handleClearZarfCache,
    zarfLocalPackages, fetchZarfLocalPackages,
    handleDeleteWorkspaceItem, handleCompressFolder, handleDecompressPackage,
    handleUnpackZarfPackage, isUnpackingZarf, selectedZarfPackagePath,
    zarfConfigText, setZarfConfigText, isSavingZarfConfig, handleRebuildAndDeployZarf, setZarfUnpackTempDir,
    isDeployModalOpen, setIsDeployModalOpen,
    zarfUploadFile, setZarfUploadFile, zarfConfigFile, setZarfConfigFile,
    zarfUploadProgress, setZarfUploadProgress, handleUploadZarfPackage,
    selectedZarfConfigPath, setSelectedZarfConfigPath, handleDeployLocalPackage,
    sbomPackageName, setSbomPackageName, sbomExtractedFiles, setSbomExtractedFiles,
    sbomSelectedFileUrl, setSbomSelectedFileUrl, isExtractingSbom, handleExtractSbom,
    selectedZarfPackageDetail, setSelectedZarfPackageDetail, isPackageDetailModalOpen, setIsPackageDetailModalOpen,
    isFetchingPackageDetail, handleInspectDeployedZarfPackage, handleRemoveZarfPackage,
    selectedZarfGraphPkg, setSelectedZarfGraphPkg,
    registryPullSource, setRegistryPullSource, registryPullTarget, setRegistryPullTarget,
    handlePullRegistryImage, isPullingRegistry,
    registryPushTarget, setRegistryPushTarget, handlePushRegistryImage, isPushingRegistry,
    zarfRegistryImages: registryImages, isFetchingRegistry, fetchZarfRegistryImages,
    handleDownloadRegistryImage, handleDeleteRegistryImage, handlePruneRegistry,
  };
};
