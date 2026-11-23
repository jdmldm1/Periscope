// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../test/render';

const api = vi.hoisted(() => ({ get: vi.fn() }));
const nav = vi.hoisted(() => ({ setActiveTab: vi.fn(), setSelectedNs: vi.fn(), setSearch: vi.fn() }));

vi.mock('axios', () => ({ default: { create: () => api, isAxiosError: () => false } }));
vi.mock('../../contexts/AppContext', () => ({ useAppContext: () => nav }));

import { EventsView } from './EventsView';

const event = (over: Record<string, unknown>) => ({
    metadata: { name: `e-${Math.random()}`, namespace: 'prod', creationTimestamp: '2030-01-01T00:00:00Z' },
    type: 'Normal',
    reason: 'Scheduled',
    message: 'Assigned pod',
    count: 1,
    lastTimestamp: '2030-01-01T00:00:00Z',
    involvedObject: { kind: 'Pod', name: 'web-1', namespace: 'prod' },
    ...over,
});

const EVENTS = [
    event({
        type: 'Warning',
        reason: 'BackOff',
        message: 'Back-off restarting',
        lastTimestamp: '2030-01-02T00:00:00Z',
    }),
    event({
        type: 'Warning',
        reason: 'BackOff',
        message: 'Back-off restarting',
        lastTimestamp: '2030-01-03T00:00:00Z',
    }),
    event({
        reason: 'Pulled',
        message: 'Image pulled',
        involvedObject: { kind: 'Deployment', name: 'api', namespace: 'prod' },
    }),
    event({
        reason: 'Odd',
        message: 'Something',
        involvedObject: { kind: 'ReplicaSet', name: 'rs', namespace: 'prod' },
    }),
];

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: EVENTS });
});

describe('EventsView', () => {
    it('requests events for the selected namespace', async () => {
        renderWithQuery(<EventsView selectedNs="prod" />);
        await screen.findByText('Pulled');
        expect(api.get).toHaveBeenCalledWith('/kube/resource/events', { params: { namespace: 'prod' } });
    });

    it('groups repeated events and shows the combined count', async () => {
        renderWithQuery(<EventsView selectedNs="all" />);
        await screen.findByText('Pulled');
        expect(screen.getAllByText('BackOff')).toHaveLength(1);
        expect(screen.getByText('×2')).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Group repeats'));
        expect(screen.getAllByText('BackOff')).toHaveLength(2);
    });

    it('filters by type and free text', async () => {
        renderWithQuery(<EventsView selectedNs="all" />);
        await screen.findByText('Pulled');
        fireEvent.click(screen.getByRole('button', { name: /Warnings/ }));
        expect(screen.queryByText('Pulled')).toBeNull();
        expect(screen.getByText('BackOff')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'All' }));
        fireEvent.change(screen.getByPlaceholderText(/Filter by reason/), { target: { value: 'image' } });
        expect(screen.getByText('Pulled')).toBeTruthy();
        expect(screen.queryByText('BackOff')).toBeNull();
    });

    it('shows an empty state when nothing matches', async () => {
        renderWithQuery(<EventsView selectedNs="all" />);
        await screen.findByText('Pulled');
        fireEvent.change(screen.getByPlaceholderText(/Filter by reason/), { target: { value: 'zzz-no-match' } });
        expect(screen.getByText('No matching events.')).toBeTruthy();
    });

    it('opens the involved object in its resource tab', async () => {
        renderWithQuery(<EventsView selectedNs="all" />);
        fireEvent.click(await screen.findByText('Pulled'));
        expect(nav.setSelectedNs).toHaveBeenCalledWith('prod');
        expect(nav.setSearch).toHaveBeenCalledWith('api');
        expect(nav.setActiveTab).toHaveBeenCalledWith('deployments');
    });

    it('does nothing when the kind has no tab', async () => {
        renderWithQuery(<EventsView selectedNs="all" />);
        fireEvent.click(await screen.findByText('Odd'));
        expect(nav.setActiveTab).not.toHaveBeenCalled();
    });

    it('reports a load failure', async () => {
        api.get.mockRejectedValue(new Error('down'));
        renderWithQuery(<EventsView selectedNs="all" />);
        await waitFor(() => expect(screen.getByText('Failed to load events.')).toBeTruthy());
    });
});
