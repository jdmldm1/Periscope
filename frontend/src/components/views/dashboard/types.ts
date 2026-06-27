// Shared types and constants for the dashboard panels.

export interface Issue {
  severity: 'critical' | 'warning' | 'info';
  kind: string;
  namespace: string;
  name: string;
  reason: string;
  message: string;
  restarts?: number;
  ownerKind?: string;
  ownerName?: string;
  count?: number;
}

export interface RecentWarning {
  reason: string;
  message: string;
  kind: string;
  name: string;
  namespace: string;
  count: number;
  timestamp?: string;
}

export const SEV_COLOR: Record<string, string> = {
  critical: 'var(--accent-error)',
  warning: 'var(--accent-warning)',
  info: 'var(--accent-blue)',
};
