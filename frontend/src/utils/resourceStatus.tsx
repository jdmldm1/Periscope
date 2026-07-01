import type { ResourceKind } from '../contexts/AppContext';

type BadgeType = 'success' | 'warning' | 'error' | 'info';

const BADGE_COLORS: Record<BadgeType, string> = {
  success: 'var(--accent-success)',
  warning: 'var(--accent-warning)',
  error: 'var(--accent-error)',
  info: 'var(--accent-blue)',
};

// Kubernetes resources don't carry their own "kind" on the objects we list, so
// when the active tab is ambiguous (e.g. a drill-down mixing pods and
// workloads) we sniff the shape of the object to decide how to read its status.
function inferKind(res: any): string {
  if (res.spec?.backoffLimit !== undefined || res.status?.succeeded !== undefined || res.status?.failed !== undefined) return 'jobs';
  if (res.spec?.schedule !== undefined) return 'cronjobs';
  if (res.status?.podIP !== undefined || (res.spec?.containers && !res.spec?.template)) return 'pods';
  if (res.status?.nodeInfo !== undefined) return 'nodes';
  if (res.spec?.template !== undefined) return 'workloads';
  return '';
}

function podStatus(res: any): { status: string; type: BadgeType } {
  // A pod with a deletionTimestamp is on its way out — show that clearly
  // instead of leaving it as "Running" until it disappears.
  if (res.metadata?.deletionTimestamp) {
    return { status: 'Terminating', type: 'warning' };
  }

  let status = res.status?.phase || 'Unknown';
  let type: BadgeType = 'warning';
  if (status === 'Running') type = 'success';
  else if (status === 'Succeeded') type = 'info';
  else if (status === 'Failed') type = 'error';

  const containerErrors = (res.status?.containerStatuses || []).filter((s: any) => {
    if (s.state?.waiting) {
      const transient = ['ContainerCreating', 'PodInitializing', 'AlwaysPullImages'].includes(s.state.waiting.reason);
      return !transient;
    }
    if (s.state?.terminated) return s.state.terminated.exitCode !== 0;
    return false;
  });

  if (containerErrors.length > 0) {
    status = containerErrors[0].state?.waiting?.reason || containerErrors[0].state?.terminated?.reason || 'Error';
    type = 'error';
  }
  return { status, type };
}

function workloadStatus(res: any): { status: string; type: BadgeType } {
  const ready = res.status?.readyReplicas || res.status?.numberReady || 0;
  const specReplicas = res.spec?.replicas;
  const desired = res.status?.replicas ?? res.status?.desiredNumberScheduled ?? specReplicas ?? 0;
  // A deployment scaled to 0 is "Stopped" — make that explicit rather than
  // showing a bare "0/0 Ready" that reads like a problem.
  if (specReplicas === 0 || desired === 0) {
    return { status: 'Stopped', type: 'warning' };
  }
  return {
    status: `${ready}/${desired} Ready`,
    type: ready === desired && desired > 0 ? 'success' : 'warning',
  };
}

function jobStatus(res: any): { status: string; type: BadgeType } {
  const succeeded = res.status?.succeeded || 0;
  const failed = res.status?.failed || 0;
  const active = res.status?.active || 0;
  const conditions = res.status?.conditions || [];
  const isComplete = conditions.some((c: any) => c.type === 'Complete' && c.status === 'True');
  const isFailed = conditions.some((c: any) => c.type === 'Failed' && c.status === 'True');

  if (isComplete || (succeeded > 0 && active === 0)) return { status: 'Succeeded', type: 'success' };
  if (isFailed || failed > 0) return { status: 'Failed', type: 'error' };
  if (active > 0) return { status: 'Running', type: 'info' };
  return { status: 'Completed', type: 'success' };
}

function cronJobStatus(res: any): { status: string; type: BadgeType } {
  if (res.spec?.suspend) return { status: 'Suspended', type: 'warning' };
  const active = res.status?.active || [];
  return { status: active.length > 0 ? 'Running' : 'Active', type: 'success' };
}

// Resolve a resource into a human-readable status string plus the badge color
// category to render it with, given the tab it's being shown under.
export function resolveStatus(res: any, activeTab: any): { status: string; type: 'success' | 'warning' | 'error' | 'info' } {
  const inferred = inferKind(res);
  const isJob = activeTab === 'jobs' || inferred === 'jobs';
  const isCronJob = activeTab === 'cronjobs' || inferred === 'cronjobs';
  const isPod = activeTab === 'pods' || inferred === 'pods';
  const isNode = activeTab === 'nodes' || inferred === 'nodes';
  const isWorkload = ['deployments', 'statefulsets', 'daemonsets'].includes(activeTab) || inferred === 'workloads';

  if (isPod) return podStatus(res);
  if (isWorkload) return workloadStatus(res);
  if (isNode) {
    const readyCond = (res.status?.conditions || []).find((c: any) => c.type === 'Ready');
    const ready = readyCond?.status === 'True';
    return { status: ready ? 'Ready' : 'NotReady', type: ready ? 'success' : 'error' };
  }
  if (isJob) return jobStatus(res);
  if (isCronJob) return cronJobStatus(res);

  if (['services', 'configmaps', 'secrets', 'ingresses', 'networkpolicies', 'persistentvolumes', 'persistentvolumeclaims', 'crds', 'custom', 'helm', 'zarf', 'zarf-registry'].includes(activeTab)) {
    let status = res.status?.phase || 'Active';
    if (activeTab === 'zarf' || activeTab === 'helm' || activeTab === 'zarf-registry') status = res.status?.phase || 'deployed';
    const ok = ['Active', 'Bound', 'Available', 'deployed', 'Running'].includes(status);
    return { status, type: ok ? 'success' : 'info' };
  }

  return { status: 'Unknown', type: 'warning' };
}

// Renders the colored status pill shown next to each resource row.
export function renderStatusBadge(res: any, activeTab: ResourceKind): React.ReactNode {
  if (activeTab === 'events') return null;
  const { status, type } = resolveStatus(res, activeTab);
  const color = BADGE_COLORS[type] || 'var(--text-muted)';
  return (
    <span className="badge" style={{ background: `${color}10`, color, borderColor: `${color}30` }}>
      {status}
    </span>
  );
}

// Renders a tiny inline sparkline from a series of numeric points.
export function renderSparkline(points: number[], color: string): React.ReactNode | null {
  if (!points || points.length < 2) return null;
  const max = Math.max(...points, 1);
  const width = 40;
  const height = 16;
  const coords = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - (p / max) * height;
    return `${x},${y}`;
  });
  return (
    <svg width={width} height={height} style={{ overflow: 'visible', verticalAlign: 'middle', marginLeft: 6 }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={coords.join(' ')} />
    </svg>
  );
}
