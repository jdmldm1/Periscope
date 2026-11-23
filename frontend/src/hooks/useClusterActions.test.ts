// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), delete: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => api } }));

import { useClusterActions } from './useClusterActions';

const refresh = vi.fn();
let actions: ReturnType<typeof useClusterActions>;

beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    api.put.mockResolvedValue({});
    api.delete.mockResolvedValue({});
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    actions = useClusterActions(refresh);
});

describe('workload restart and scale', () => {
    it('restarts statefulsets and daemonsets through the generic workload route', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        await actions.handleWorkloadRestart('statefulsets', 'db', 'prod');
        expect(api.put).toHaveBeenCalledWith('/kube/workloads/statefulsets/prod/db/restart');
        expect(refresh).toHaveBeenCalled();
    });

    it('does not restart when the user declines', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        await actions.handleWorkloadRestart('daemonsets', 'agent', 'prod');
        expect(api.put).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
    });

    it('alerts and skips the refresh when a restart fails', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        api.put.mockRejectedValue({ response: { data: { error: 'forbidden' } } });
        await actions.handleWorkloadRestart('statefulsets', 'db', 'prod');
        expect(window.alert).toHaveBeenCalledWith('Failed to restart db: forbidden');
        expect(refresh).not.toHaveBeenCalled();
    });

    it('scales to the entered replica count', async () => {
        vi.spyOn(window, 'prompt').mockReturnValue('4');
        await actions.handleWorkloadScale('statefulsets', 'db', 'prod', 2);
        expect(api.put).toHaveBeenCalledWith('/kube/workloads/statefulsets/prod/db/scale', { replicas: 4 });
        expect(refresh).toHaveBeenCalled();
    });

    it.each([null, '', '  ', 'abc', '-1', '1.5'])('ignores an invalid scale answer (%s)', async (answer) => {
        vi.spyOn(window, 'prompt').mockReturnValue(answer);
        await actions.handleWorkloadScale('statefulsets', 'db', 'prod', 2);
        expect(api.put).not.toHaveBeenCalled();
    });

    it('allows scaling to zero', async () => {
        vi.spyOn(window, 'prompt').mockReturnValue('0');
        await actions.handleWorkloadScale('statefulsets', 'db', 'prod', 2);
        expect(api.put).toHaveBeenCalledWith('/kube/workloads/statefulsets/prod/db/scale', { replicas: 0 });
    });
});

describe('node actions', () => {
    it.each(['cordon', 'uncordon', 'drain'] as const)(
        '%s calls the matching endpoint after confirmation',
        async (action) => {
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            await actions.handleNodeAction('worker-1', action);
            expect(api.put).toHaveBeenCalledWith(`/kube/nodes/worker-1/${action}`);
            expect(refresh).toHaveBeenCalled();
        },
    );

    it('warns about the consequences before draining', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        await actions.handleNodeAction('worker-1', 'drain');
        expect(confirm.mock.calls[0][0]).toMatch(/evicted/);
        expect(api.put).not.toHaveBeenCalled();
    });

    it('alerts with the API error when a node action fails', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        api.put.mockRejectedValue({ response: { data: { error: 'cannot evict pod' } } });
        await actions.handleNodeAction('worker-1', 'drain');
        expect(window.alert).toHaveBeenCalledWith('Failed to drain worker-1: cannot evict pod');
    });
});

describe('existing deployment actions', () => {
    it('restart, stop and start use the deployment routes', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        await actions.handleRestart('api', 'prod');
        await actions.handleStop('api', 'prod');
        await actions.handleStart('api', 'prod');
        expect(api.put.mock.calls.map((c) => c[0])).toEqual([
            '/kube/resource/deployments/prod/api/restart',
            '/kube/resource/deployments/prod/api/stop',
            '/kube/resource/deployments/prod/api/start',
        ]);
    });

    it('delete picks the helm, custom-resource or generic endpoint', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        await actions.handleDelete('helm', 'rel', 'prod');
        await actions.handleDelete('custom', 'w1', 'prod', { group: 'g.io', version: 'v1', plural: 'widgets' });
        await actions.handleDelete('pods', 'p1', 'prod');
        expect(api.delete.mock.calls.map((c) => c[0])).toEqual([
            '/helm/prod/rel',
            '/custom/g.io/v1/widgets/prod/w1',
            '/kube/resource/pods/prod/p1',
        ]);
    });

    it('delete explains the blast radius for namespaces', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
        await actions.handleDelete('namespaces', 'prod', 'prod');
        expect(confirm.mock.calls[0][0]).toMatch(/AND EVERYTHING inside it/);
        expect(api.delete).not.toHaveBeenCalled();
    });
});
