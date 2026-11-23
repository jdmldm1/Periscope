import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Info, RefreshCw, Search } from 'lucide-react';
import axios from 'axios';
import { useAppContext, type ResourceKind } from '../../contexts/AppContext';
import { KIND_TO_TAB, formatAge } from '../../utils/format';

const api = axios.create({ baseURL: '/api' });

interface K8sEvent {
    metadata: { name: string; namespace?: string; creationTimestamp?: string };
    type?: string;
    reason?: string;
    message?: string;
    count?: number;
    lastTimestamp?: string;
    eventTime?: string;
    firstTimestamp?: string;
    series?: { count?: number; lastObservedTime?: string };
    involvedObject?: { kind?: string; name?: string; namespace?: string };
}

interface EventRow {
    key: string;
    type: string;
    reason: string;
    message: string;
    kind: string;
    name: string;
    namespace: string;
    count: number;
    lastSeen: string | undefined;
}

type TypeFilter = 'all' | 'Warning' | 'Normal';

const lastSeenOf = (e: K8sEvent) =>
    e.series?.lastObservedTime || e.lastTimestamp || e.eventTime || e.metadata.creationTimestamp;

const toRows = (events: K8sEvent[], grouped: boolean): EventRow[] => {
    const rows = new Map<string, EventRow>();
    for (const e of events) {
        const kind = e.involvedObject?.kind || '';
        const name = e.involvedObject?.name || '';
        const namespace = e.involvedObject?.namespace || e.metadata.namespace || '';
        const reason = e.reason || '';
        const message = e.message || '';
        const key = grouped
            ? `${namespace}|${kind}|${name}|${reason}|${message}`
            : `${e.metadata.namespace}/${e.metadata.name}`;
        const lastSeen = lastSeenOf(e);
        const count = e.series?.count || e.count || 1;
        const existing = rows.get(key);
        if (existing) {
            existing.count += count;
            if ((lastSeen || '') > (existing.lastSeen || '')) existing.lastSeen = lastSeen;
        } else {
            rows.set(key, { key, type: e.type || 'Normal', reason, message, kind, name, namespace, count, lastSeen });
        }
    }
    return [...rows.values()].sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''));
};

export const EventsView = ({ selectedNs }: { selectedNs: string }) => {
    const { setActiveTab, setSelectedNs, setSearch } = useAppContext();
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
    const [query, setQuery] = useState('');
    const [grouped, setGrouped] = useState(true);

    const { data, isFetching, refetch, error } = useQuery({
        queryKey: ['events-view', selectedNs],
        queryFn: async () => {
            const { data } = await api.get<K8sEvent[]>('/kube/resource/events', { params: { namespace: selectedNs } });
            return data;
        },
        refetchInterval: 10000,
    });

    const rows = useMemo(() => toRows(data || [], grouped), [data, grouped]);
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return rows.filter(
            (r) =>
                (typeFilter === 'all' || r.type === typeFilter) &&
                (!q || `${r.reason} ${r.message} ${r.kind} ${r.name} ${r.namespace}`.toLowerCase().includes(q)),
        );
    }, [rows, typeFilter, query]);

    const warnings = rows.filter((r) => r.type === 'Warning').length;

    const openObject = (row: EventRow) => {
        const tab = KIND_TO_TAB[row.kind];
        if (!tab) return;
        if (row.namespace && tab !== 'nodes' && tab !== 'namespaces') setSelectedNs(row.namespace);
        setSearch(row.name);
        setActiveTab(tab as ResourceKind);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="search-box" style={{ flex: 1, minWidth: 220 }}>
                    <Search size={14} />
                    <input
                        type="text"
                        placeholder="Filter by reason, message, object or namespace…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    {(['all', 'Warning', 'Normal'] as const).map((t) => (
                        <button
                            key={t}
                            className={`btn btn-sm ${typeFilter === t ? 'btn-primary' : ''}`}
                            onClick={() => setTypeFilter(t)}
                        >
                            {t === 'all' ? 'All' : t === 'Warning' ? `Warnings (${warnings})` : 'Normal'}
                        </button>
                    ))}
                </div>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem' }}>
                    <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
                    Group repeats
                </label>
                <button className="btn btn-sm" onClick={() => void refetch()} disabled={isFetching}>
                    <RefreshCw size={14} className={isFetching ? 'spin' : ''} /> Refresh
                </button>
            </div>

            {error && <div style={{ color: 'var(--accent-error)' }}>Failed to load events.</div>}

            {filtered.length === 0 && !isFetching && (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>No matching events.</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {filtered.slice(0, 500).map((r) => {
                    const warn = r.type === 'Warning';
                    const navigable = !!KIND_TO_TAB[r.kind];
                    return (
                        <div
                            key={r.key}
                            onClick={() => openObject(r)}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '24px 150px minmax(180px, 280px) 1fr 70px 50px',
                                gap: 12,
                                alignItems: 'start',
                                padding: '10px 14px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderLeft: `3px solid ${warn ? 'var(--accent-warning)' : 'var(--accent-blue)'}`,
                                borderRadius: 8,
                                cursor: navigable ? 'pointer' : 'default',
                                fontSize: '0.82rem',
                            }}
                        >
                            {warn ? (
                                <AlertTriangle size={16} style={{ color: 'var(--accent-warning)' }} />
                            ) : (
                                <Info size={16} style={{ color: 'var(--accent-blue)' }} />
                            )}
                            <span style={{ fontWeight: 600 }}>{r.reason}</span>
                            <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                {r.kind}/{r.name}
                                {r.namespace && <span style={{ color: 'var(--text-muted)' }}> · {r.namespace}</span>}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>{r.message}</span>
                            <span style={{ color: 'var(--text-muted)' }} title={r.lastSeen}>
                                {formatAge(r.lastSeen)}
                            </span>
                            <span title="Occurrences">{r.count > 1 ? `×${r.count}` : ''}</span>
                        </div>
                    );
                })}
            </div>
            {filtered.length > 500 && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Showing the 500 most recent of {filtered.length} events. Narrow the filter to see more.
                </div>
            )}
        </div>
    );
};
