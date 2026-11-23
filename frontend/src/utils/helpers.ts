export const parseCpu = (cpuStr: string) => {
    if (!cpuStr) return 0;
    if (cpuStr.endsWith('n')) return parseFloat(cpuStr) / 1000000000;
    if (cpuStr.endsWith('u')) return parseFloat(cpuStr) / 1000000;
    if (cpuStr.endsWith('m')) return parseFloat(cpuStr) / 1000;
    return parseFloat(cpuStr);
};
export const parseMem = (memStr: string) => {
    if (!memStr) return 0;
    if (memStr.endsWith('Ki')) return parseFloat(memStr) * 1024;
    if (memStr.endsWith('Mi')) return parseFloat(memStr) * 1024 * 1024;
    if (memStr.endsWith('Gi')) return parseFloat(memStr) * 1024 * 1024 * 1024;
    return parseFloat(memStr);
};
export const matchesSelector = (labels: any, selector: any) => {
    if (!selector || typeof selector !== 'object' || Object.keys(selector).length === 0) return false;
    if (!labels || typeof labels !== 'object') return false;
    return Object.entries(selector).every(([k, v]) => labels[k] === v);
};
export const pluralizeKind = (k: string) => {
    if (k.endsWith('s')) return k.toLowerCase();
    return k.toLowerCase() + 's';
};
export const getNodeUsagePercent = (metric: any, nodes: any[]) => {
    const node = (nodes || []).find((n) => n.metadata.name === metric.metadata.name);
    if (!node) return { cpuPercent: 0, memPercent: 0 };
    const cpuCap = parseCpu(node.status?.capacity?.cpu || '1');
    const memCap = parseMem(node.status?.capacity?.memory || '1Ki');
    const cpuUse = parseCpu(metric.usage?.cpu || '0');
    const memUse = parseMem(metric.usage?.memory || '0');
    return {
        cpuPercent: Math.round((cpuUse / cpuCap) * 100),
        memPercent: Math.round((memUse / memCap) * 100),
    };
};
