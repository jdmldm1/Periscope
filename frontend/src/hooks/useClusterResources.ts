import { useState, useEffect } from 'react';
import { useK8sResources } from '../utils/kubeHooks';

export const useClusterResources = (activeTab: string, selectedNs: string) => {
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const { data: resourcesData, isLoading: isResourcesLoading } = useK8sResources(activeTab, selectedNs);

  useEffect(() => {
    if (resourcesData) {
      setResources(resourcesData);
      setLoading(false);
    } else if (isResourcesLoading) {
      setLoading(true);
    }
  }, [resourcesData, isResourcesLoading]);

  const filteredResources = resources.filter(r => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      r.metadata?.name?.toLowerCase().includes(searchLower) ||
      r.metadata?.namespace?.toLowerCase().includes(searchLower) ||
      Object.values(r.metadata?.labels || {}).some((l: any) => l.toLowerCase().includes(searchLower))
    );
  });

  return {
    resources,
    filteredResources,
    loading,
    search,
    setSearch,
  };
};
