// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithQuery } from '../../test/render';

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('axios', () => ({
    default: {
        create: () => api,
        isAxiosError: (e: unknown) => !!(e as { isAxiosError?: boolean })?.isAxiosError,
    },
}));
vi.mock('@monaco-editor/react', () => ({
    DiffEditor: ({ original, modified }: { original: string; modified: string }) => (
        <div data-testid="diff">
            <pre data-testid="diff-original">{original}</pre>
            <pre data-testid="diff-modified">{modified}</pre>
        </div>
    ),
}));

import { RolloutHistoryPanel } from './RolloutHistoryPanel';
import { CrdSchemaPanel } from './CrdSchemaPanel';
import { YamlEditTools } from './YamlEditTools';

const apiError = (message: string) => ({
    isAxiosError: true,
    message: 'failed',
    response: { data: { error: message } },
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
});

describe('RolloutHistoryPanel', () => {
    const revisions = [
        {
            revision: 3,
            name: 'rs3',
            createdAt: new Date().toISOString(),
            changeCause: 'bump image',
            images: ['app:3'],
            replicas: 2,
            readyReplicas: 2,
            current: true,
        },
        {
            revision: 2,
            name: 'rs2',
            createdAt: new Date().toISOString(),
            changeCause: null,
            images: ['app:2', 'sidecar:1'],
            replicas: 0,
            readyReplicas: 0,
            current: false,
        },
    ];

    it('lists revisions newest first and marks the current one', async () => {
        api.get.mockResolvedValue({ data: { revisions } });
        renderWithQuery(<RolloutHistoryPanel namespace="prod" name="web" />);
        await screen.findByText('#3');
        expect(api.get).toHaveBeenCalledWith('/kube/resource/deployments/prod/web/rollout-history');
        expect(screen.getByText('current')).toBeTruthy();
        expect(screen.getByText('app:2')).toBeTruthy();
        expect(screen.getByText('sidecar:1')).toBeTruthy();
        expect(screen.getByText(/bump image/)).toBeTruthy();
    });

    it('disables rolling back to the running revision', async () => {
        api.get.mockResolvedValue({ data: { revisions } });
        renderWithQuery(<RolloutHistoryPanel namespace="prod" name="web" />);
        await screen.findByText('#3');
        const buttons = screen.getAllByRole('button', { name: /Roll back/ });
        expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
        expect((buttons[1] as HTMLButtonElement).disabled).toBe(false);
    });

    it('rolls back after confirmation and shows the result', async () => {
        api.get.mockResolvedValue({ data: { revisions } });
        api.post.mockResolvedValue({ data: { message: 'deployment rolled back' } });
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        renderWithQuery(<RolloutHistoryPanel namespace="prod" name="web" />);
        await screen.findByText('#2');
        fireEvent.click(screen.getAllByRole('button', { name: /Roll back/ })[1]);
        await screen.findByText('deployment rolled back');
        expect(api.post).toHaveBeenCalledWith('/kube/resource/deployments/prod/web/rollback', { revision: 2 });
    });

    it('does nothing when the confirmation is declined', async () => {
        api.get.mockResolvedValue({ data: { revisions } });
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        renderWithQuery(<RolloutHistoryPanel namespace="prod" name="web" />);
        await screen.findByText('#2');
        fireEvent.click(screen.getAllByRole('button', { name: /Roll back/ })[1]);
        expect(api.post).not.toHaveBeenCalled();
    });

    it('shows the API error when the rollback fails', async () => {
        api.get.mockResolvedValue({ data: { revisions } });
        api.post.mockRejectedValue(apiError('revision not found'));
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        renderWithQuery(<RolloutHistoryPanel namespace="prod" name="web" />);
        await screen.findByText('#2');
        fireEvent.click(screen.getAllByRole('button', { name: /Roll back/ })[1]);
        await screen.findByText('revision not found');
    });

    it('explains an empty history', async () => {
        api.get.mockResolvedValue({ data: { revisions: [] } });
        renderWithQuery(<RolloutHistoryPanel namespace="prod" name="web" />);
        expect(await screen.findByText(/No revisions recorded/)).toBeTruthy();
    });
});

describe('CrdSchemaPanel', () => {
    const schema = {
        name: 'widgets.example.com',
        group: 'example.com',
        scope: 'Namespaced',
        kind: 'Widget',
        plural: 'widgets',
        versions: [
            {
                name: 'v1beta1',
                served: true,
                storage: false,
                deprecated: true,
                printerColumns: [],
                fields: [{ path: 'spec.old', type: 'string', required: false, description: 'legacy' }],
            },
            {
                name: 'v1',
                served: true,
                storage: true,
                deprecated: false,
                printerColumns: [{ name: 'Size', type: 'integer', jsonPath: '.spec.size' }],
                fields: [
                    { path: 'spec.size', type: 'integer', required: true, description: 'Replica count' },
                    { path: 'spec.mode', type: 'string', required: false, description: 'Mode', enum: ['a', 'b'] },
                ],
            },
        ],
    };

    it('shows the storage version by default with required markers and enums', async () => {
        api.get.mockResolvedValue({ data: schema });
        renderWithQuery(<CrdSchemaPanel name="widgets.example.com" />);
        await screen.findByText('spec.size');
        expect(api.get).toHaveBeenCalledWith('/kube/crd/widgets.example.com/schema');
        expect(screen.getByText('Widget')).toBeTruthy();
        expect(screen.getByText(/Printer columns: Size/)).toBeTruthy();
        expect(screen.getByText(/one of: a, b/)).toBeTruthy();
        expect(screen.queryByText('spec.old')).toBeNull();
    });

    it('switches versions and filters fields', async () => {
        api.get.mockResolvedValue({ data: schema });
        renderWithQuery(<CrdSchemaPanel name="widgets.example.com" />);
        await screen.findByText('spec.size');
        fireEvent.click(screen.getByRole('button', { name: /v1beta1/ }));
        expect(screen.getByText('spec.old')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /^v1 \(storage\)/ }));
        fireEvent.change(screen.getByPlaceholderText('Filter fields…'), { target: { value: 'replica' } });
        expect(screen.getByText('spec.size')).toBeTruthy();
        expect(screen.queryByText('spec.mode')).toBeNull();
        fireEvent.change(screen.getByPlaceholderText('Filter fields…'), { target: { value: 'zzz' } });
        expect(screen.getByText('No fields match.')).toBeTruthy();
    });

    it('says so when a version has no structural schema', async () => {
        api.get.mockResolvedValue({ data: { ...schema, versions: [{ ...schema.versions[1], fields: [] }] } });
        renderWithQuery(<CrdSchemaPanel name="widgets.example.com" />);
        expect(await screen.findByText(/does not publish a structural schema/)).toBeTruthy();
    });

    it('shows the API error', async () => {
        api.get.mockRejectedValue(apiError('crd not found'));
        renderWithQuery(<CrdSchemaPanel name="missing.example.com" />);
        expect(await screen.findByText('crd not found')).toBeTruthy();
    });
});

describe('YamlEditTools', () => {
    const props = { kind: 'deployments', namespace: 'prod', name: 'web', yaml: 'edited: true' };

    it('validates through the server-side dry run and shows success', async () => {
        api.post.mockResolvedValue({
            data: { valid: true, message: 'deployment.apps/web configured (server dry run)' },
        });
        renderWithQuery(<YamlEditTools {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /Validate/ }));
        await screen.findByText(/configured \(server dry run\)/);
        expect(api.post).toHaveBeenCalledWith('/kube/resource/deployments/prod/web/dry-run', { yaml: 'edited: true' });
    });

    it('shows validation failures', async () => {
        api.post.mockResolvedValue({ data: { valid: false, message: 'spec.replicas: Invalid value' } });
        renderWithQuery(<YamlEditTools {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /Validate/ }));
        await screen.findByText(/Invalid value/);
    });

    it('shows transport errors from the dry run', async () => {
        api.post.mockRejectedValue(apiError('yaml content is required'));
        renderWithQuery(<YamlEditTools {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /Validate/ }));
        await screen.findByText('yaml content is required');
    });

    it('uses "undefined" for cluster-scoped resources', async () => {
        api.post.mockResolvedValue({ data: { valid: true, message: 'ok' } });
        renderWithQuery(<YamlEditTools {...props} kind="nodes" namespace={undefined} name="n1" />);
        fireEvent.click(screen.getByRole('button', { name: /Validate/ }));
        await waitFor(() =>
            expect(api.post).toHaveBeenCalledWith('/kube/resource/nodes/undefined/n1/dry-run', expect.anything()),
        );
    });

    it('opens a diff of the live object against the edits and closes it', async () => {
        api.get.mockResolvedValue({ data: 'live: true' });
        renderWithQuery(<YamlEditTools {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /Diff vs live/ }));
        await screen.findByTestId('diff');
        expect(api.get.mock.calls[0][0]).toBe('/kube/resource/deployments/prod/web/yaml');
        expect(screen.getByTestId('diff-original').textContent).toBe('live: true');
        expect(screen.getByTestId('diff-modified').textContent).toBe('edited: true');
        fireEvent.click(document.querySelector('.modal-header .btn-icon') as Element);
        expect(screen.queryByTestId('diff')).toBeNull();
    });

    it('encodes path segments so a hostile name cannot alter the route', async () => {
        api.get.mockResolvedValue({ data: '' });
        renderWithQuery(<YamlEditTools {...props} name="a/../b" />);
        fireEvent.click(screen.getByRole('button', { name: /Diff vs live/ }));
        await screen.findByTestId('diff');
        expect(api.get.mock.calls[0][0]).toBe('/kube/resource/deployments/prod/a%2F..%2Fb/yaml');
    });

    it('reports a failure to load the live object', async () => {
        api.get.mockRejectedValue(apiError('Resource not found'));
        renderWithQuery(<YamlEditTools {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /Diff vs live/ }));
        await screen.findByText('Resource not found');
        expect(screen.queryByTestId('diff')).toBeNull();
    });
});
