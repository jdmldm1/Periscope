import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const useNamespaces = () => {
  return useQuery({
    queryKey: ['namespaces'],
    queryFn: async () => {
      const { data } = await api.get('/kube/namespaces');
      return data;
    },
  });
};

export const useKubeContexts = () => {
  return useQuery({
    queryKey: ['kube-contexts'],
    queryFn: async () => {
      const { data } = await api.get('/kube/contexts');
      return data;
    },
  });
};

export const useK8sResources = (kind: string, namespace: string) => {
  return useQuery({
    queryKey: ['resources', kind, namespace],
    queryFn: async () => {
      let endpoint = `/kube/resource/${kind}?namespace=${namespace}`;
      if (kind === 'helm') endpoint = `/helm?namespace=${namespace}`;
      if (kind === 'zarf') endpoint = `/zarf/packages`;
      
      const { data } = await api.get(endpoint);
      return data;
    },
    enabled: !!kind && !['dashboard', 'topology', 'logs', 'image-scanner', 'kubescape', 'gitea', 'pvc-explorer', 'cluster-terminal', 'traffic', 'helm-repos', 'zarf-registry', 'autoscale-manager', 'backup-restore', 'cronjobs'].includes(kind),
    refetchInterval: 10000,
  });
};

export const useNodeMetrics = () => {
  return useQuery({
    queryKey: ['metrics', 'nodes'],
    queryFn: async () => {
      const { data } = await api.get('/metrics/nodes');
      return data;
    },
    refetchInterval: 5000,
  });
};

export const usePodMetrics = () => {
  return useQuery({
    queryKey: ['metrics', 'pods'],
    queryFn: async () => {
      const { data } = await api.get('/metrics/pods');
      return data;
    },
    refetchInterval: 5000,
  });
};

export const useDashboardStats = (namespace: string) => {
  return useQuery({
    queryKey: ['dashboard-stats', namespace],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/stats', {
        params: { namespace },
      });
      return data;
    },
    refetchInterval: 10000,
  });
};

export const useIntegrationReadiness = (namespace: string) => {
  return useQuery({
    queryKey: ['dashboard-integration', namespace],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/integration', {
        params: { namespace },
      });
      return data;
    },
    refetchInterval: 15000,
  });
};

export interface IssueDetailParams {
  kind: string;
  namespace: string;
  name: string;
}

export const useIssueDetail = (params: IssueDetailParams | null) => {
  return useQuery({
    queryKey: ['dashboard-issue-detail', params?.kind, params?.namespace, params?.name],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/issue-detail', {
        params: { kind: params!.kind, namespace: params!.namespace, name: params!.name },
      });
      return data;
    },
    enabled: !!params,
    refetchInterval: 8000,
  });
};

export const useTopologyData = (namespace: string) => {
  return useQuery({
    queryKey: ['topology', namespace],
    queryFn: async () => {
      const [nodes, services, deployments, pods] = await Promise.all([
        api.get('/kube/resource/nodes').then(r => r.data),
        api.get('/kube/resource/services', { params: { namespace } }).then(r => r.data),
        api.get('/kube/resource/deployments', { params: { namespace } }).then(r => r.data),
        api.get('/kube/resource/pods', { params: { namespace } }).then(r => r.data),
      ]);
      return { nodes, services, deployments, pods };
    },
    refetchInterval: 10000,
  });
};

export const useKubescapeStatus = () => {
  return useQuery({
    queryKey: ['kubescape-status'],
    queryFn: async () => {
      const { data } = await api.get('/security/kubescape/status');
      return data;
    },
    refetchInterval: (query) => (query.state.data?.scanning ? 2000 : 30000),
  });
};

export const useZarfStatus = () => {
  return useQuery({
    queryKey: ['zarf-status'],
    queryFn: async () => {
      const { data } = await api.get('/zarf/status');
      return data;
    },
  });
};

export const useGrypeDbStatus = () => {
  return useQuery({
    queryKey: ['grype-db-status'],
    queryFn: async () => {
      const { data } = await api.get('/zarf/scanner/grype/db-status');
      return data;
    },
    refetchInterval: (query) => (query.state.data?.isUpdating ? 2000 : 60000),
  });
};

export const useSbomScans = () => {
  return useQuery({
    queryKey: ['sbom-scans'],
    queryFn: async () => {
      const { data } = await api.get('/zarf/scanner/sbom/scans');
      return data;
    },
    refetchInterval: 15000,
  });
};
