import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useK8sResources } from '../utils/kubeHooks';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

interface ModalContextType {
  // Core modal
  modal: any;
  setModal: (m: any) => void;
  modalData: any;
  setModalData: (d: any) => void;
  fetchModalData: (type: string) => Promise<void>;
  
  // YAML editor
  yamlEdit: string;
  setYamlEdit: (y: string) => void;
  isEditingYaml: boolean;
  setIsEditingYaml: (e: boolean) => void;
  saveYaml: () => Promise<void>;
  copyToClipboard: () => void;
  downloadYaml: () => void;
  downloadLogs: () => void;
  
  // Container selection
  selectedContainer: string;
  setSelectedContainer: (c: string) => void;
  getPodContainers: () => string[];
  
  // Log streaming
  isStreamingLogs: boolean;
  setIsStreamingLogs: (s: boolean) => void;
  scrollToBottomLogs: () => void;
  
  // Pod file explorer
  currentDirPath: string;
  setCurrentDirPath: (p: string) => void;
  isListingFiles: boolean;
  podFiles: any[];
  podFileUploadProgress: number;
  podFileUploadName: string;
  handleUploadPodFile: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleCreatePodFolder: () => Promise<void>;
  fetchPodFilesList: (path: string) => Promise<void>;
  handleEditPodFile: (fileName: string) => Promise<void>;
  handleDownloadPodFile: (fileName: string, isDir?: boolean) => void;
  handleDeletePodFile: (fileName: string, isDir: boolean) => Promise<void>;
  
  // Helm revision
  handleRollback: (ns: string, name: string, rev: number) => Promise<void>;
  handleInspectRevisionValues: (ns: string, name: string, rev: number) => Promise<void>;
  selectedRevisionValues: any;
  setSelectedRevisionValues: (v: any) => void;
  isLoadingRevisionValues: boolean;
  handleHelmUpgradeFromModal: () => Promise<void>;
  renderDiffView: () => React.ReactNode;
}

const ModalContext = createContext<ModalContextType | null>(null);

export function useModalContext() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModalContext must be used within ModalProvider');
  return ctx;
}

export function ModalProvider({ children, selectedNs }: { children: ReactNode; selectedNs: string }) {
  const { data: allPods } = useK8sResources('pods', selectedNs);
  
  const [modal, setModal] = useState<any>(null);
  const [modalData, setModalData] = useState<any>(null);
  const [yamlEdit, setYamlEdit] = useState('');
  const [isEditingYaml, setIsEditingYaml] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState('');
  const [isStreamingLogs, setIsStreamingLogs] = useState(false);
  
  // Pod file explorer
  const [currentDirPath, setCurrentDirPath] = useState('/');
  const [isListingFiles, setIsListingFiles] = useState(false);
  const [podFiles, setPodFiles] = useState<any[]>([]);
  const [podFileUploadProgress, setPodFileUploadProgress] = useState(-1);
  const [podFileUploadName, setPodFileUploadName] = useState('');
  
  // Helm revision
  const [selectedRevisionValues, setSelectedRevisionValues] = useState<any>(null);
  const [isLoadingRevisionValues, setIsLoadingRevisionValues] = useState(false);

  useEffect(() => {
    if (!modal) {
      setCurrentDirPath('/');
    }
  }, [modal]);

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

  const fetchModalData = async (type: string) => {
    if (!modal) return;
    setModalData(null);
    try {
      let endpoint = '';
      if (type === 'yaml') endpoint = `/kube/resource/${modal.kind}/${modal.namespace}/${modal.name}/yaml`;
      else if (type === 'events') endpoint = `/kube/resource/${modal.kind}/${modal.namespace}/${modal.name}/events`;
      else if (type === 'logs') endpoint = `/kube/resource/pods/${modal.namespace}/${modal.name}/logs?container=${selectedContainer}`;
      else if (type === 'diagnose') endpoint = `/kube/diagnose/${modal.namespace}/${modal.name}`;
      else if (type === 'history') endpoint = `/helm/${modal.namespace}/${modal.name}/history`;
      else if (type === 'values') endpoint = `/helm/${modal.namespace}/${modal.name}/values`;
      else if (type === 'decoded') endpoint = `/kube/resource/secrets/${modal.namespace}/${modal.name}`;
      else if (type === 'portforward' || type === 'pvc-files') {
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
    a.download = `${modal?.name || 'resource'}.yaml`;
    a.click();
  };

  const scrollToBottomLogs = () => {
    const el = document.querySelector('.terminal-container');
    if (el) el.scrollTop = el.scrollHeight;
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

  const handleUploadPodFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!modal || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    setPodFileUploadName(file.name);
    setPodFileUploadProgress(0);
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

  const handleRollback = async (ns: string, name: string, rev: number) => {
    try {
      await api.post(`/helm/${ns}/${name}/rollback`, { revision: rev });
      alert(`Rolled back to revision ${rev}`);
      fetchModalData('history');
    } catch (err: any) { alert(err.message); }
  };

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

  return (
    <ModalContext.Provider value={{
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
    }}>
      {children}
    </ModalContext.Provider>
  );
}
