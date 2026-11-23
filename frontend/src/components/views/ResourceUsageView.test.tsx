// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithQuery } from '../../test/render';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => api, isAxiosError: () => false } }));

import { ResourceUsageView } from './ResourceUsageView';

const MB = 1024 * 1024;
const RESPONSE = {
    metricsAvailable: true,
    nodes: [
        {
            name: 'node-1',
            cpu: { allocatable: 4000, request: 1000, usage: 500 },
            memory: { allocatable: 8192 * MB, request: 2048 * MB, usage: 1024 * MB },
            pods: { count: 12, allocatable: 110 },
        },
    ],
    pods: [
        {
            name: 'hot',
            namespace: 'prod',
            node: 'node-1',
            cpu: { request: 100, limit: 200, usage: 190 },
            memory: { request: 100 * MB, limit: 200 * MB, usage: 20 * MB },
            hints: ['cpu near limit'],
        },
        {
            name: 'idle',
            namespace: 'prod',
            node: 'node-1',
            cpu: { request: 1000, limit: 0, usage: 10 },
            memory: { request: 100 * MB, limit: 0, usage: 90 * MB },
            hints: ['cpu over-provisioned'],
        },
        {
            name: 'bare',
            namespace: 'dev',
            node: 'node-1',
            cpu: { request: 0, limit: 0, usage: null },
            memory: { request: 0, limit: 0, usage: null },
            hints: [],
        },
    ],
};

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: RESPONSE });
});

describe('ResourceUsageView', () => {
    it('requests usage for the selected namespace', async () => {
        renderWithQuery(<ResourceUsageView selectedNs="prod" />);
        await screen.findByText('node-1');
        expect(api.get).toHaveBeenCalledWith('/metrics/usage', { params: { namespace: 'prod' } });
    });

    it('renders node capacity and a cell per pod grouped by namespace', async () => {
        renderWithQuery(<ResourceUsageView selectedNs="all" />);
        await screen.findByText('node-1');
        expect(screen.getByText(/12\/110 pods/)).toBeTruthy();
        expect(screen.getByText(/used 500m · requested 1 cores · allocatable 4 cores/)).toBeTruthy();
        expect(screen.getByLabelText('hot: 95%')).toBeTruthy();
        expect(screen.getByLabelText('idle: 1%')).toBeTruthy();
        expect(screen.getByLabelText('bare: no data')).toBeTruthy();
        expect(screen.getByText('prod · 2')).toBeTruthy();
        expect(screen.getByText('dev · 1')).toBeTruthy();
    });

    it('switches the metric to memory', async () => {
        renderWithQuery(<ResourceUsageView selectedNs="all" />);
        await screen.findByText('node-1');
        fireEvent.click(screen.getByRole('button', { name: 'Memory' }));
        expect(screen.getByLabelText('hot: 10%')).toBeTruthy();
        expect(screen.getByLabelText('idle: 90%')).toBeTruthy();
        expect(screen.getByText(/used 1\.0Gi · requested 2\.0Gi · allocatable 8\.0Gi/)).toBeTruthy();
    });

    it('lists right-sizing hints and selecting a pod shows its numbers', async () => {
        renderWithQuery(<ResourceUsageView selectedNs="all" />);
        await screen.findByText('node-1');
        expect(screen.getByText('Right-sizing hints (2)')).toBeTruthy();
        expect(screen.getByText('cpu near limit')).toBeTruthy();
        fireEvent.click(screen.getByLabelText('idle: 1%'));
        expect(screen.getByText(/CPU 10m used \/ 1 cores requested/)).toBeTruthy();
        fireEvent.click(screen.getByLabelText('idle: 1%'));
        expect(screen.queryByText(/CPU 10m used/)).toBeNull();
    });

    it('warns when metrics-server is unreachable', async () => {
        api.get.mockResolvedValue({ data: { ...RESPONSE, metricsAvailable: false } });
        renderWithQuery(<ResourceUsageView selectedNs="all" />);
        expect(await screen.findByText(/metrics-server is not reachable/)).toBeTruthy();
    });

    it('reports when no pod needs attention', async () => {
        api.get.mockResolvedValue({ data: { ...RESPONSE, pods: [] } });
        renderWithQuery(<ResourceUsageView selectedNs="all" />);
        expect(await screen.findByText('No pods need attention.')).toBeTruthy();
    });
});
