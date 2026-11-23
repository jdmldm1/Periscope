// @vitest-environment jsdom
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => api, isAxiosError: () => false } }));

import { CommandPalette } from './CommandPalette';

const handlers = {
    setIsOpen: vi.fn(),
    setSelectedNs: vi.fn(),
    handleContextChange: vi.fn(),
    setActiveTab: vi.fn(),
    fetchResources: vi.fn(),
    fetchRunningImagesAndScan: vi.fn(),
    onOpenResource: vi.fn(),
};

const Harness = ({ initial = '' }: { initial?: string }) => {
    const [search, setSearch] = useState(initial);
    return (
        <CommandPalette
            isOpen={true}
            setIsOpen={handlers.setIsOpen}
            search={search}
            setSearch={setSearch}
            namespaces={['default', 'prod']}
            setSelectedNs={handlers.setSelectedNs}
            contexts={[{ name: 'kind-test' }]}
            handleContextChange={handlers.handleContextChange}
            setActiveTab={handlers.setActiveTab}
            fetchResources={handlers.fetchResources}
            fetchRunningImagesAndScan={handlers.fetchRunningImagesAndScan}
            onOpenResource={handlers.onOpenResource}
        />
    );
};

const type = (value: string) => fireEvent.change(screen.getByRole('textbox'), { target: { value } });

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: { results: [] } });
});

describe('CommandPalette', () => {
    it('opens a view from an alias', () => {
        render(<Harness initial=":rbac" />);
        fireEvent.click(screen.getByText(/RBAC Explorer/));
        expect(handlers.setActiveTab).toHaveBeenCalledWith('rbac');
        expect(handlers.setIsOpen).toHaveBeenCalledWith(false);
    });

    it('offers the new views', () => {
        render(<Harness initial=":usage" />);
        expect(screen.getByText(/Resource Usage Heatmap/)).toBeTruthy();
        type(':certs');
        expect(screen.getByText(/Certificates/)).toBeTruthy();
    });

    it('does not search resources for command queries or one-character input', async () => {
        render(<Harness />);
        type(':pods');
        type('a');
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(api.get).not.toHaveBeenCalled();
    });

    it('searches resources after a debounce and opens the selected hit', async () => {
        api.get.mockResolvedValue({
            data: { results: [{ kind: 'deployments', name: 'checkout-api', namespace: 'prod' }] },
        });
        render(<Harness />);
        type('checkout');
        await screen.findByText('checkout-api · deployments · prod');
        expect(api.get).toHaveBeenCalledTimes(1);
        expect(api.get).toHaveBeenCalledWith('/kube/search', { params: { q: 'checkout' } });
        fireEvent.click(screen.getByText('checkout-api · deployments · prod'));
        expect(handlers.onOpenResource).toHaveBeenCalledWith({
            kind: 'deployments',
            name: 'checkout-api',
            namespace: 'prod',
        });
        expect(handlers.setIsOpen).toHaveBeenCalledWith(false);
    });

    it('lists cluster-scoped hits without a namespace', async () => {
        api.get.mockResolvedValue({ data: { results: [{ kind: 'nodes', name: 'worker-1', namespace: null }] } });
        render(<Harness />);
        type('worker');
        expect(await screen.findByText('worker-1 · nodes')).toBeTruthy();
    });

    it('survives a failing search and keeps view results available', async () => {
        api.get.mockRejectedValue(new Error('down'));
        render(<Harness />);
        type('topology');
        await waitFor(() => expect(api.get).toHaveBeenCalled());
        expect(screen.getByText(/Topology Map/)).toBeTruthy();
    });

    it('activates the highlighted item with the keyboard', () => {
        render(<Harness initial=":events" />);
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
        expect(handlers.setActiveTab).toHaveBeenCalledWith('events');
    });

    it('closes on Escape', () => {
        render(<Harness />);
        fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
        expect(handlers.setIsOpen).toHaveBeenCalledWith(false);
    });
});
