import React from 'react';

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

export const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const timeAgo = (date: string | Date) => {
  const now = new Date();
  const past = new Date(date);
  const diff = now.getTime() - past.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};

export const highlightYaml = (yaml: string) => {
  if (!yaml) return '';
  return yaml
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^(\s*)([\w-]+):/gm, '$1<span class="yaml-key" style="color: #60a5fa">$2</span>:')
    .replace(/: (.*)$/gm, ': <span class="yaml-value" style="color: #10b981">$1</span>')
    .replace(/#.*$/gm, '<span class="yaml-comment" style="color: #6b7280">$&</span>');
};

export const colorizeLogs = (logs: string, search: string = '') => {
  if (!logs || typeof logs !== 'string') return null;
  const lines = logs.split('\n');
  return lines.map((line, i) => {
    if (search && !line.toLowerCase().includes(search.toLowerCase())) return null;
    let color = 'var(--text-main)';
    if (line.includes('ERROR') || line.includes('Err') || line.includes('Fail')) color = 'var(--accent-red)';
    else if (line.includes('WARN')) color = 'var(--accent-warning)';
    else if (line.includes('INFO')) color = 'var(--accent-green)';
    
    return React.createElement('div', {
      key: i,
      style: { color, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', whiteSpace: 'pre-wrap', marginBottom: 2 }
    }, [
      React.createElement('span', { key: 'num', style: { opacity: 0.3, marginRight: 8, userSelect: 'none' } }, i + 1),
      line
    ]);
  });
};

export const matchesSelector = (labels: any, selector: any) => {
  if (!selector || typeof selector !== 'object' || Object.keys(selector).length === 0) return false;
  if (!labels || typeof labels !== 'object') return false;
  return Object.entries(selector).every(([k, v]) => labels[k] === v);
};
