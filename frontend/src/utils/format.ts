import axios from 'axios';

export const apiErrorMessage = (err: unknown): string => {
    if (axios.isAxiosError(err)) {
        const data = err.response?.data as { error?: string } | undefined;
        return data?.error || err.message;
    }
    return err instanceof Error ? err.message : 'Unknown error';
};

export const formatCpu = (millis: number | null | undefined): string => {
    if (millis === null || millis === undefined) return '–';
    if (millis >= 1000) return `${(millis / 1000).toFixed(millis % 1000 === 0 ? 0 : 2)} cores`;
    return `${Math.round(millis)}m`;
};

export const formatBytes = (bytes: number | null | undefined): string => {
    if (bytes === null || bytes === undefined) return '–';
    const units = ['B', 'Ki', 'Mi', 'Gi', 'Ti'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)}${units[unit]}`;
};

export const formatAge = (iso: string | undefined): string => {
    if (!iso) return '–';
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
};

export const KIND_TO_TAB: Record<string, string> = {
    Pod: 'pods',
    Deployment: 'deployments',
    StatefulSet: 'statefulsets',
    DaemonSet: 'daemonsets',
    Job: 'jobs',
    CronJob: 'cronjobs',
    Service: 'services',
    Ingress: 'ingresses',
    ConfigMap: 'configmaps',
    Secret: 'secrets',
    PersistentVolumeClaim: 'persistentvolumeclaims',
    PersistentVolume: 'persistentvolumes',
    Node: 'nodes',
    Namespace: 'namespaces',
};
