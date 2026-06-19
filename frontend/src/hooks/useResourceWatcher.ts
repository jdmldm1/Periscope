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
  const reconnectTimeoutRef = useRef<any>(null);

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
            // Invalidate the query key so React Query refetches automatically
            queryClient.invalidateQueries({ queryKey: [queryKey] });
            
            // Also invalidate topology and stats if nodes/pods/deployments change
            if (['pods', 'services', 'deployments'].includes(queryKey)) {
              queryClient.invalidateQueries({ queryKey: ['topology'] });
              queryClient.invalidateQueries({ queryKey: ['stats'] });
            }
          }
        } catch (err) {
          console.error('[useResourceWatcher] Error parsing event message:', err);
        }
      };

      socket.onclose = (e) => {
        console.log('[useResourceWatcher] Connection closed:', e.reason);
        socketRef.current = null;
        // Reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 5000);
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
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [queryClient]);
};
