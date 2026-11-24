import { describe, it, expect } from 'vitest';
import {
    inferKind,
    podStatus,
    workloadStatus,
    jobStatus,
    cronJobStatus,
    resolveStatus,
    renderStatusBadge,
    renderSparkline,
} from './resourceStatus';

describe('resourceStatus', () => {
    describe('inferKind', () => {
        it('infers jobs from backoffLimit', () => {
            expect(inferKind({ spec: { backoffLimit: 4 } })).toBe('jobs');
        });

        it('infers cronjobs from schedule', () => {
            expect(inferKind({ spec: { schedule: '0 * * * *' } })).toBe('cronjobs');
        });

        it('infers pods from podIP or containers without template', () => {
            expect(inferKind({ status: { podIP: '10.244.0.5' } })).toBe('pods');
            expect(inferKind({ spec: { containers: [{ name: 'c' }] } })).toBe('pods');
        });

        it('infers nodes from nodeInfo', () => {
            expect(inferKind({ status: { nodeInfo: { kubeletVersion: 'v1.30.0' } } })).toBe('nodes');
        });

        it('infers workloads from template', () => {
            expect(inferKind({ spec: { template: {} } })).toBe('workloads');
        });

        it('returns empty string when unknown', () => {
            expect(inferKind({})).toBe('');
        });
    });

    describe('podStatus', () => {
        it('identifies terminating pods', () => {
            const res = podStatus({ metadata: { deletionTimestamp: '2026-11-23T00:00:00Z' } });
            expect(res).toEqual({ status: 'Terminating', type: 'warning' });
        });

        it('identifies healthy running pods', () => {
            const res = podStatus({ status: { phase: 'Running' } });
            expect(res).toEqual({ status: 'Running', type: 'success' });
        });

        it('identifies succeeded and failed phases', () => {
            expect(podStatus({ status: { phase: 'Succeeded' } })).toEqual({ status: 'Succeeded', type: 'info' });
            expect(podStatus({ status: { phase: 'Failed' } })).toEqual({ status: 'Failed', type: 'error' });
        });

        it('identifies waiting container errors', () => {
            const res = podStatus({
                status: {
                    phase: 'Running',
                    containerStatuses: [{ state: { waiting: { reason: 'CrashLoopBackOff', message: 'crash' } } }],
                },
            });
            expect(res).toEqual({ status: 'CrashLoopBackOff', type: 'error' });
        });

        it('ignores transient waiting reasons', () => {
            const res = podStatus({
                status: {
                    phase: 'Pending',
                    containerStatuses: [{ state: { waiting: { reason: 'ContainerCreating' } } }],
                },
            });
            expect(res).toEqual({ status: 'Pending', type: 'warning' });
        });

        it('identifies non-zero terminated exit code', () => {
            const res = podStatus({
                status: {
                    phase: 'Running',
                    containerStatuses: [{ state: { terminated: { exitCode: 137, reason: 'OOMKilled' } } }],
                },
            });
            expect(res).toEqual({ status: 'OOMKilled', type: 'error' });
        });
    });

    describe('workloadStatus', () => {
        it('identifies stopped workloads', () => {
            expect(workloadStatus({ spec: { replicas: 0 } })).toEqual({ status: 'Stopped', type: 'warning' });
        });

        it('identifies partially ready workloads', () => {
            const res = workloadStatus({
                status: { readyReplicas: 1, replicas: 3 },
            });
            expect(res).toEqual({ status: '1/3 Ready', type: 'warning' });
        });

        it('identifies fully ready workloads', () => {
            const res = workloadStatus({
                status: { readyReplicas: 3, replicas: 3 },
            });
            expect(res).toEqual({ status: '3/3 Ready', type: 'success' });
        });
    });

    describe('jobStatus', () => {
        it('identifies complete jobs', () => {
            const res = jobStatus({
                status: { conditions: [{ type: 'Complete', status: 'True' }] },
            });
            expect(res).toEqual({ status: 'Succeeded', type: 'success' });
        });

        it('identifies failed jobs', () => {
            const res = jobStatus({
                status: { failed: 1 },
            });
            expect(res).toEqual({ status: 'Failed', type: 'error' });
        });

        it('identifies active running jobs', () => {
            const res = jobStatus({
                status: { active: 1 },
            });
            expect(res).toEqual({ status: 'Running', type: 'info' });
        });
    });

    describe('cronJobStatus', () => {
        it('identifies suspended cronjobs', () => {
            expect(cronJobStatus({ spec: { suspend: true } })).toEqual({ status: 'Suspended', type: 'warning' });
        });

        it('identifies active running cronjobs', () => {
            expect(cronJobStatus({ status: { active: [{ name: 'job-1' }] } })).toEqual({
                status: 'Running',
                type: 'success',
            });
        });

        it('identifies active scheduled cronjobs', () => {
            expect(cronJobStatus({ status: { active: [] } })).toEqual({ status: 'Active', type: 'success' });
        });
    });

    describe('resolveStatus', () => {
        it('resolves nodes readiness', () => {
            expect(resolveStatus({ status: { conditions: [{ type: 'Ready', status: 'True' }] } }, 'nodes')).toEqual({
                status: 'Ready',
                type: 'success',
            });
            expect(resolveStatus({ status: { conditions: [{ type: 'Ready', status: 'False' }] } }, 'nodes')).toEqual({
                status: 'NotReady',
                type: 'error',
            });
        });

        it('resolves namespaces', () => {
            expect(resolveStatus({ status: { phase: 'Active' } }, 'namespaces')).toEqual({
                status: 'Active',
                type: 'success',
            });
        });

        it('resolves standard resources like services and configmaps', () => {
            expect(resolveStatus({ status: { phase: 'Active' } }, 'services')).toEqual({
                status: 'Active',
                type: 'success',
            });
            expect(resolveStatus({}, 'services')).toEqual({
                status: 'Active',
                type: 'success',
            });
        });
    });

    describe('renderStatusBadge and renderSparkline', () => {
        it('returns null for events tab', () => {
            expect(renderStatusBadge({}, 'events')).toBeNull();
        });

        it('renders a badge element for valid resources', () => {
            const badge = renderStatusBadge({ status: { phase: 'Running' } }, 'pods');
            expect(badge).not.toBeNull();
        });

        it('renders sparklines for numerical points', () => {
            expect(renderSparkline([], '#fff')).toBeNull();
            expect(renderSparkline([1], '#fff')).toBeNull();
            const sparkline = renderSparkline([10, 20, 15, 30], '#3b82f6');
            expect(sparkline).not.toBeNull();
        });
    });
});
