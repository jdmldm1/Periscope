import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const KIND_TO_QUERY_KEY_MAP: Record<string, string> = {
  'Pod': 'pods',
  'Service': 'services',
  'Deployment': 'deployments',
  'StatefulSet': 'statefulsets',
  'DaemonSet': 'daemonsets',
  'ConfigMap': 'configmaps',
  'Secret': 'secrets',
  'Ingress': 'ingresses',
  'PersistentVolumeClaim': 'persistentvolumeclaims',
  'PersistentVolume': 'persistentvolumes',
  'Node': 'nodes',
  'Namespace': 'namespaces',
  'Event': 'events',
};

export const useResourceWatcher = () => {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connect = () => {
      if (socketRef.current) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const token = localStorage.getItem('PERISCOPE_API_KEY') || new URLSearchParams(window.location.search).get('token') || '';
      const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
      const wsUrl = `${protocol}//${host}/api/resources/ws${tokenParam}`;

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log('[useResourceWatcher] Connected to Kubernetes resource watcher');
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const { kind, namespace, name, action } = data;
          console.debug(`[useResourceWatcher] Received cluster event: ${action} ${kind} ${namespace}/${name}`);

          const queryKey = KIND_TO_QUERY_KEY_MAP[kind];
          if (queryKey) {
            // Resource lists are cached under ['resources', kind, namespace], so a
            // plain ['pods'] key never matches. Match the cached key by predicate
            // so the list refetches automatically when the cluster changes.
            queryClient.invalidateQueries({
              predicate: (query) =>
                query.queryKey[0] === 'resources' && query.queryKey[1] === queryKey,
            });

            // Also refresh topology and dashboard health if anything that affects
            // cluster state changes (nodes included, so NotReady surfaces live).
            if (['pods', 'services', 'deployments', 'nodes'].includes(queryKey)) {
              queryClient.invalidateQueries({ queryKey: ['topology'] });
              queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
              queryClient.invalidateQueries({ queryKey: ['dashboard-integration'] });
            }
          }
        } catch (err) {
          console.error('[useResourceWatcher] Error parsing event message:', err);
        }
      };

      socket.onclose = (e) => {
        console.log('[useResourceWatcher] Connection closed:', e.reason);
        socketRef.current = null;
      };

      socket.onerror = (err) => {
        console.error('[useResourceWatcher] Connection error:', err);
        socket.close();
      };
    };

    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [queryClient]);
};
