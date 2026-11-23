// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithQuery } from '../../test/render';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('axios', () => ({ default: { create: () => api, isAxiosError: () => false } }));

import { CertificatesView } from './CertificatesView';

const RESPONSE = {
    certManager: true,
    summary: { total: 4, expired: 1, critical: 1, warning: 0, ok: 2, other: 0 },
    certificates: [
        {
            source: 'secret',
            name: 'old-tls',
            namespace: 'prod',
            status: 'expired',
            daysLeft: -3,
            notAfter: '2030-01-01T00:00:00Z',
            dnsNames: ['old.example'],
        },
        {
            source: 'cert-manager',
            name: 'web',
            namespace: 'prod',
            status: 'critical',
            daysLeft: 4,
            ready: false,
            readyMessage: 'issuing',
            issuer: 'ClusterIssuer/le',
            dnsNames: ['web.example'],
        },
        { source: 'secret', name: 'api-tls', namespace: 'dev', status: 'ok', daysLeft: 200, dnsNames: ['api.example'] },
        { source: 'secret', name: 'broken', namespace: 'dev', status: 'invalid', error: 'bad pem' },
    ],
};

beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: RESPONSE });
});

describe('CertificatesView', () => {
    it('shows summary tiles and every certificate', async () => {
        renderWithQuery(<CertificatesView selectedNs="all" />);
        await screen.findByText('old-tls');
        expect(screen.getByText('Under 7 days')).toBeTruthy();
        expect(screen.getByText('expired 3d ago')).toBeTruthy();
        expect(screen.getByText('4d left')).toBeTruthy();
        expect(screen.getByText('bad pem')).toBeTruthy();
        expect(screen.getByText(/not ready/)).toBeTruthy();
    });

    it('filters by status tile and toggles it off again', async () => {
        renderWithQuery(<CertificatesView selectedNs="all" />);
        await screen.findByText('old-tls');
        fireEvent.click(screen.getByText('Expired'));
        expect(screen.getByText('old-tls')).toBeTruthy();
        expect(screen.queryByText('api-tls')).toBeNull();
        fireEvent.click(screen.getByText('Expired'));
        expect(screen.getByText('api-tls')).toBeTruthy();
    });

    it('the attention filter keeps only expiring and expired certificates', async () => {
        renderWithQuery(<CertificatesView selectedNs="all" />);
        await screen.findByText('old-tls');
        fireEvent.click(screen.getByRole('button', { name: 'Needs attention' }));
        expect(screen.getByText('old-tls')).toBeTruthy();
        expect(screen.getByText('web')).toBeTruthy();
        expect(screen.queryByText('api-tls')).toBeNull();
        expect(screen.queryByText('broken')).toBeNull();
    });

    it('filters by text and by selected namespace', async () => {
        const { rerender: _rerender } = renderWithQuery(<CertificatesView selectedNs="dev" />);
        await screen.findByText('api-tls');
        expect(screen.queryByText('old-tls')).toBeNull();
        fireEvent.change(screen.getByPlaceholderText(/Filter by name/), { target: { value: 'api.example' } });
        expect(screen.getByText('api-tls')).toBeTruthy();
        expect(screen.queryByText('broken')).toBeNull();
    });

    it('explains when cert-manager is not installed', async () => {
        api.get.mockResolvedValue({ data: { ...RESPONSE, certManager: false } });
        renderWithQuery(<CertificatesView selectedNs="all" />);
        expect(await screen.findByText(/cert-manager Certificates were not found/)).toBeTruthy();
    });

    it('shows an empty state', async () => {
        api.get.mockResolvedValue({
            data: {
                certManager: true,
                summary: { total: 0, expired: 0, critical: 0, warning: 0, ok: 0, other: 0 },
                certificates: [],
            },
        });
        renderWithQuery(<CertificatesView selectedNs="all" />);
        expect(await screen.findByText('No certificates match.')).toBeTruthy();
    });
});
