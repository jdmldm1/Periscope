import { createContext, useContext, useState, useEffect, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNamespaces, useKubeContexts } from '../utils/kubeHooks';
import { useClusterResources } from '../hooks/useClusterResources';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export type ResourceKind = 
  'dashboard' | 'topology' | 'nodes' | 'events' | 'logs' | 'cluster-terminal' | 'crds' | 
  'pods' | 'deployments' | 'statefulsets' | 'daemonsets' | 'jobs' | 'cronjobs' |
  'services' | 'ingresses' | 'traffic' | 'configmaps' | 'secrets' | 'persistentvolumes' | 
  'persistentvolumeclaims' | 'helm' | 'helm-repos' | 'zarf' | 'zarf-registry' | 'image-scanner' | 'kubescape' | 'custom' |
  'autoscale-manager' | 'backup-restore';

interface AppContextType {
  // Navigation
  activeTab: ResourceKind;
  setActiveTab: (tab: ResourceKind) => void;
  
  // Namespaces
  namespaces: string[];
  selectedNs: string;
  setSelectedNs: (ns: string) => void;
  
  // Kube contexts
  contexts: any[];
  currentContext: string;
  handleContextChange: (ctx: string) => Promise<void>;
  
  // Search & resources
  search: string;
  setSearch: (s: string) => void;
  filteredResources: any[];
  loading: boolean;
  
  // UI state
  isCmdPaletteOpen: boolean;
  setIsCmdPaletteOpen: (open: boolean) => void;
  customCrd: any;
  setCustomCrd: (crd: any) => void;
  
  // Modal
  modal: any;
  setModal: (m: any) => void;
  
  // Drill-down navigation
  handleDrillDownToPods: (deploy: any) => void;
  
  // Sidebar
  collapsedSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  
  // Deploy modals
  isDeployZarfModalOpen: boolean;
  setIsDeployZarfModalOpen: (open: boolean) => void;
  isDeployHelmModalOpen: boolean;
  setIsDeployHelmModalOpen: (open: boolean) => void;
  
  // Keyboard nav
  focusedRowIndex: number | null;
  setFocusedRowIndex: Dispatch<SetStateAction<number | null>>;
  
  // API client
  api: typeof api;
  
  // Query client
  queryClient: ReturnType<typeof useQueryClient>;
}

const AppContext = createContext<AppContextType | null>(null);

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
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

  const [customCrd, setCustomCrd] = useState<any>(null);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);
  const [modal, setModal] = useState<any>(null);
  const [isDeployZarfModalOpen, setIsDeployZarfModalOpen] = useState(false);
  const [isDeployHelmModalOpen, setIsDeployHelmModalOpen] = useState(false);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);

  useEffect(() => {
    setFocusedRowIndex(null);
  }, [activeTab, selectedNs]);

  const handleContextChange = async (ctx: string) => {
    try {
      await api.post('/kube/contexts', { context: ctx });
      window.location.reload();
    } catch (err) { console.error(err); }
  };

  const handleDrillDownToPods = (deploy: any) => {
    if (deploy?.metadata?.namespace) {
      setSelectedNs(deploy.metadata.namespace);
    }
    setActiveTab('pods');
    setSearch(deploy?.metadata?.name || '');
  };

  return (
    <AppContext.Provider value={{
      activeTab, setActiveTab,
      namespaces, selectedNs, setSelectedNs,
      contexts, currentContext, handleContextChange,
      search, setSearch, filteredResources, loading,
      isCmdPaletteOpen, setIsCmdPaletteOpen,
      customCrd, setCustomCrd,
      modal, setModal,
      handleDrillDownToPods,
      collapsedSections, toggleSection,
      isDeployZarfModalOpen, setIsDeployZarfModalOpen,
      isDeployHelmModalOpen, setIsDeployHelmModalOpen,
      focusedRowIndex, setFocusedRowIndex,
      api,
      queryClient,
    }}>
      {children}
    </AppContext.Provider>
  );
}
