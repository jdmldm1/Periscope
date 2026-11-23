// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../test/render';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => api, isAxiosError: () => false } }));

import { RbacExplorerView } from './RbacExplorerView';

const SUBJECTS = [
    { kind: 'Group', name: 'ops', bindings: 1, clusterAdmin: true, wildcard: true, clusterWide: true },
    { kind: 'User', name: 'alice', bindings: 2, clusterAdmin: false, wildcard: false, clusterWide: false },
    {
        kind: 'ServiceAccount',
        name: 'app',
        namespace: 'prod',
        bindings: 1,
        clusterAdmin: false,
        wildcard: true,
        clusterWide: false,
    },
];

const GRANT = {
    binding: { name: 'ops-admin', kind: 'ClusterRoleBinding' },
    role: { kind: 'ClusterRole', name: 'cluster-admin', found: true },
    scope: 'cluster',
    clusterAdmin: true,
    wildcard: true,
    rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }],
};

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url: string) => {
        if (url === '/rbac/subjects') return Promise.resolve({ data: { subjects: SUBJECTS } });
        if (url === '/rbac/subject') return Promise.resolve({ data: { grants: [GRANT] } });
        if (url === '/rbac/whocan') return Promise.resolve({ data: { subjects: [SUBJECTS[1]] } });
        return Promise.reject(new Error(`unexpected ${url}`));
    });
});

describe('RbacExplorerView', () => {
    it('lists subjects with risk badges', async () => {
        renderWithQuery(<RbacExplorerView selectedNs="all" />);
        await screen.findByText('ops');
        expect(screen.getByText('3 subjects')).toBeTruthy();
        expect(screen.getByText('admin')).toBeTruthy();
        expect(screen.getAllByText('wildcard')).toHaveLength(1);
    });

    it('filters by kind, text and risk', async () => {
        renderWithQuery(<RbacExplorerView selectedNs="all" />);
        await screen.findByText('ops');
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ServiceAccount' } });
        expect(screen.getByText('1 subject')).toBeTruthy();
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'all' } });
        fireEvent.change(screen.getByPlaceholderText('Filter subjects…'), { target: { value: 'ali' } });
        expect(screen.getByText('1 subject')).toBeTruthy();
        fireEvent.change(screen.getByPlaceholderText('Filter subjects…'), { target: { value: '' } });
        fireEvent.click(screen.getByLabelText('Admin / wildcard only'));
        expect(screen.getByText('2 subjects')).toBeTruthy();
    });

    it('shows bindings and rules for the selected subject', async () => {
        renderWithQuery(<RbacExplorerView selectedNs="all" />);
        fireEvent.click(await screen.findByText('ops'));
        await screen.findByText('ClusterRole/cluster-admin');
        expect(api.get).toHaveBeenCalledWith('/rbac/subject', {
            params: { kind: 'Group', name: 'ops', namespace: undefined },
        });
        expect(screen.getByText(/via ClusterRoleBinding ops-admin · cluster-wide/)).toBeTruthy();
        expect(screen.getByText('cluster-admin')).toBeTruthy();
    });

    it('passes the namespace for service accounts', async () => {
        renderWithQuery(<RbacExplorerView selectedNs="all" />);
        fireEvent.click(await screen.findByText('app'));
        await waitFor(() =>
            expect(api.get).toHaveBeenCalledWith('/rbac/subject', {
                params: { kind: 'ServiceAccount', name: 'app', namespace: 'prod' },
            }),
        );
    });

    it('answers who-can queries scoped to the selected namespace', async () => {
        renderWithQuery(<RbacExplorerView selectedNs="prod" />);
        await screen.findByText('ops');
        fireEvent.click(screen.getByRole('button', { name: 'Who can…?' }));
        expect(screen.getByText(/Pick a verb and resource/)).toBeTruthy();
        fireEvent.change(screen.getByPlaceholderText(/resource \(pods/), { target: { value: 'pods/exec' } });
        fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));
        await screen.findByText('alice');
        expect(api.get).toHaveBeenCalledWith('/rbac/whocan', {
            params: { verb: 'get', resource: 'pods/exec', apiGroup: '', namespace: 'prod' },
        });
        expect(screen.getByText('1 subject')).toBeTruthy();
    });

    it('omits the namespace parameter for cluster-wide who-can queries', async () => {
        renderWithQuery(<RbacExplorerView selectedNs="all" />);
        await screen.findByText('ops');
        fireEvent.click(screen.getByRole('button', { name: 'Who can…?' }));
        fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));
        await waitFor(() =>
            expect(api.get).toHaveBeenCalledWith('/rbac/whocan', {
                params: { verb: 'get', resource: 'secrets', apiGroup: '', namespace: undefined },
            }),
        );
    });

    it('surfaces API errors', async () => {
        api.get.mockRejectedValue(new Error('forbidden'));
        renderWithQuery(<RbacExplorerView selectedNs="all" />);
        expect(await screen.findByText('forbidden')).toBeTruthy();
    });
});
