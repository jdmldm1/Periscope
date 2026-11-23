import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search } from 'lucide-react';
import axios from 'axios';
import { apiErrorMessage } from '../../utils/format';

const api = axios.create({ baseURL: '/api' });

interface Certificate {
    source: 'secret' | 'cert-manager';
    name: string;
    namespace: string;
    subject?: string;
    issuer?: string;
    dnsNames?: string[];
    notAfter?: string | null;
    renewalTime?: string | null;
    daysLeft?: number | null;
    status: string;
    ready?: boolean | null;
    readyMessage?: string;
    secretName?: string;
    error?: string;
}

interface CertResponse {
    certManager: boolean;
    summary: { total: number; expired: number; critical: number; warning: number; ok: number; other: number };
    certificates: Certificate[];
}

const STATUS_COLOR: Record<string, string> = {
    expired: 'var(--accent-error)',
    critical: 'var(--accent-error)',
    warning: 'var(--accent-warning)',
    ok: 'var(--accent-success)',
    invalid: 'var(--text-muted)',
    unknown: 'var(--text-muted)',
};

const daysLabel = (c: Certificate) => {
    if (c.daysLeft === null || c.daysLeft === undefined) return c.status;
    if (c.daysLeft < 0) return `expired ${Math.abs(c.daysLeft)}d ago`;
    return `${c.daysLeft}d left`;
};

const Tile = ({
    label,
    value,
    color,
    active,
    onClick,
}: {
    label: string;
    value: number;
    color: string;
    active: boolean;
    onClick: () => void;
}) => (
    <button
        onClick={onClick}
        style={{
            flex: 1,
            minWidth: 120,
            textAlign: 'left',
            cursor: 'pointer',
            background: 'var(--bg-card)',
            border: `1px solid ${active ? color : 'var(--border-color)'}`,
            borderRadius: 10,
            padding: '12px 16px',
            color: 'var(--text-main)',
        }}
    >
        <div style={{ fontSize: '1.6rem', fontWeight: 700, color }}>{value}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
    </button>
);

export const CertificatesView = ({ selectedNs }: { selectedNs: string }) => {
    const [filter, setFilter] = useState<string>('all');
    const [query, setQuery] = useState('');

    const { data, isFetching, refetch, error } = useQuery({
        queryKey: ['certs'],
        queryFn: async () => (await api.get<CertResponse>('/certs')).data,
        refetchInterval: 60000,
    });

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (data?.certificates || []).filter((c) => {
            if (selectedNs !== 'all' && c.namespace !== selectedNs) return false;
            if (filter === 'expiring' && !['expired', 'critical', 'warning'].includes(c.status)) return false;
            if (filter !== 'all' && filter !== 'expiring' && c.status !== filter) return false;
            if (!q) return true;
            return `${c.name} ${c.namespace} ${c.issuer || ''} ${c.subject || ''} ${(c.dnsNames || []).join(' ')}`
                .toLowerCase()
                .includes(q);
        });
    }, [data, filter, query, selectedNs]);

    const s = data?.summary;
    const toggle = (value: string) => setFilter((f) => (f === value ? 'all' : value));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {s && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Tile
                        label="Expired"
                        value={s.expired}
                        color="var(--accent-error)"
                        active={filter === 'expired'}
                        onClick={() => toggle('expired')}
                    />
                    <Tile
                        label="Under 7 days"
                        value={s.critical}
                        color="var(--accent-error)"
                        active={filter === 'critical'}
                        onClick={() => toggle('critical')}
                    />
                    <Tile
                        label="Under 30 days"
                        value={s.warning}
                        color="var(--accent-warning)"
                        active={filter === 'warning'}
                        onClick={() => toggle('warning')}
                    />
                    <Tile
                        label="Healthy"
                        value={s.ok}
                        color="var(--accent-success)"
                        active={filter === 'ok'}
                        onClick={() => toggle('ok')}
                    />
                </div>
            )}

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="search-box" style={{ flex: 1, minWidth: 220 }}>
                    <Search size={14} />
                    <input
                        type="text"
                        placeholder="Filter by name, issuer or DNS name…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
                <button
                    className={`btn btn-sm ${filter === 'expiring' ? 'btn-primary' : ''}`}
                    onClick={() => toggle('expiring')}
                >
                    Needs attention
                </button>
                <button className="btn btn-sm" onClick={() => void refetch()} disabled={isFetching}>
                    <RefreshCw size={14} className={isFetching ? 'spin' : ''} /> Refresh
                </button>
            </div>

            {error && <div style={{ color: 'var(--accent-error)' }}>{apiErrorMessage(error)}</div>}
            {data && !data.certManager && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    cert-manager Certificates were not found; showing kubernetes.io/tls secrets only.
                </div>
            )}
            {visible.length === 0 && !isFetching && (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
                    No certificates match.
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visible.map((c) => (
                    <div
                        key={`${c.source}/${c.namespace}/${c.name}`}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(200px, 1fr) minmax(200px, 1.4fr) 150px',
                            gap: 14,
                            alignItems: 'center',
                            padding: '12px 16px',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderLeft: `3px solid ${STATUS_COLOR[c.status] || 'var(--border-color)'}`,
                            borderRadius: 8,
                            fontSize: '0.82rem',
                        }}
                    >
                        <div>
                            <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.name}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                {c.namespace} ·{' '}
                                {c.source === 'cert-manager' ? 'cert-manager Certificate' : 'TLS secret'}
                                {c.ready === false && (
                                    <span style={{ color: 'var(--accent-error)' }} title={c.readyMessage}>
                                        {' '}
                                        · not ready
                                    </span>
                                )}
                            </div>
                        </div>
                        <div style={{ color: 'var(--text-muted)', wordBreak: 'break-word' }}>
                            {c.error ? (
                                c.error
                            ) : (
                                <>
                                    <div>{(c.dnsNames || []).slice(0, 4).join(', ') || c.subject}</div>
                                    {c.issuer && <div style={{ fontSize: '0.75rem' }}>Issuer: {c.issuer}</div>}
                                </>
                            )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, color: STATUS_COLOR[c.status] }}>{daysLabel(c)}</div>
                            {c.notAfter && (
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                    {new Date(c.notAfter).toLocaleDateString()}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
