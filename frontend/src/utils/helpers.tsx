

// Unit parsers for metrics
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

// YAML JSON syntax highlighter
export const highlightYaml = (text: string) => {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  html = html.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")(\s*:)/g, '<span class="yaml-key">$1</span>$3');
  html = html.replace(/:(\s*)("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*")/g, ':$1<span class="yaml-string">$2</span>');
  html = html.replace(/:(\s*)([0-9.-]+)(?=\s|,|$|\n)/g, ':$1<span class="yaml-number">$2</span>');
  html = html.replace(/:(\s*)(true|false)(?=\s|,|$|\n)/g, ':$1<span class="yaml-boolean">$2</span>');
  html = html.replace(/:(\s*)(null)(?=\s|,|$|\n)/g, ':$1<span class="yaml-null">$2</span>');
  
  return html;
};

// Log viewer with regex colors and search filters
export const colorizeLogs = (logs: string, filter: string) => {
  if (!logs) return [];
  const lines = logs.split('\n');
  
  return lines
    .filter(line => !filter || line.toLowerCase().includes(filter.toLowerCase()))
    .map((line, i) => {
      let type = 'normal';
      
      if (/error|fail|exception|fatal/i.test(line)) {
        type = 'error';
      } else if (/warn|warning/i.test(line)) {
        type = 'warn';
      } else if (/info/i.test(line)) {
        type = 'info';
      } else if (/success|ok|ready/i.test(line)) {
        type = 'success';
      }
      
      if (filter) {
        const regex = new RegExp(`(${filter})`, 'gi');
        const parts = line.split(regex);
        return (
          <span key={i} className={`log-line log-${type}`}>
            {parts.map((part, pi) => 
              part.toLowerCase() === filter.toLowerCase() 
                ? <mark key={pi} className="log-highlight">{part}</mark>
                : part
            )}
          </span>
        );
      }
      return <span key={i} className={`log-line log-${type}`}>{line}</span>;
    });
};

export const pluralizeKind = (kind: string): string => {
  if (!kind) return '';
  const k = kind.toLowerCase();
  if (k === 'ingress') return 'ingresses';
  if (k === 'persistentvolume') return 'persistentvolumes';
  if (k === 'persistentvolumeclaim') return 'persistentvolumeclaims';
  if (k.endsWith('y')) return k.slice(0, -1) + 'ies';
  return k + 's';
};

export const matchesSelector = (labels: any, selector: any) => {
  if (!labels || !selector) return false;
  return Object.keys(selector).every(key => labels[key] === selector[key]);
};
