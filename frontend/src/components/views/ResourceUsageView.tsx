import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import axios from 'axios';
import { apiErrorMessage, formatBytes, formatCpu } from '../../utils/format';

const api = axios.create({ baseURL: '/api' });

interface Amounts {
    request: number;
    limit?: number;
    usage: number | null;
}
interface PodUsage {
    name: string;
    namespace: string;
    node: string | null;
    cpu: Amounts;
    memory: Amounts;
    hints: string[];
}
interface NodeAmounts {
    allocatable: number;
    request: number;
    usage: number | null;
}
interface NodeUsage {
    name: string;
    cpu: NodeAmounts;
    memory: NodeAmounts;
    pods: { count: number; allocatable: number };
}
interface UsageResponse {
    metricsAvailable: boolean;
    pods: PodUsage[];
    nodes: NodeUsage[];
}

type Metric = 'cpu' | 'memory';

// Utilisation of the pod's own budget: usage against its limit when set, otherwise its request.
const utilisation = (a: Amounts): number | null => {
    const budget = a.limit || a.request;
    if (a.usage === null || !budget) return null;
    return a.usage / budget;
};

const cellColor = (u: number | null): string => {
    if (u === null) return 'rgba(156,163,175,0.18)';
    if (u > 0.9) return 'var(--accent-error)';
    if (u > 0.7) return 'var(--accent-warning)';
    if (u > 0.4) return 'var(--accent-success)';
    if (u > 0.15) return 'rgba(16,185,129,0.55)';
    return 'rgba(59,130,246,0.55)';
};

const LEGEND: [string, string][] = [
    ['rgba(156,163,175,0.18)', 'no request/limit or no metrics'],
    ['rgba(59,130,246,0.55)', '< 15% (over-provisioned)'],
    ['rgba(16,185,129,0.55)', '15–40%'],
    ['var(--accent-success)', '40–70%'],
    ['var(--accent-warning)', '70–90%'],
    ['var(--accent-error)', '> 90% (near budget)'],
];

const fmt = (metric: Metric, v: number | null | undefined) => (metric === 'cpu' ? formatCpu(v) : formatBytes(v));

const NodeBar = ({ metric, a }: { metric: Metric; a: NodeAmounts }) => {
    const pct = (v: number | null) => (v === null || !a.allocatable ? 0 : Math.min(100, (v / a.allocatable) * 100));
    return (
        <div>
            <div style={{ position: 'relative', height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 5 }}>
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: `${pct(a.request)}%`,
                        background: 'rgba(59,130,246,0.45)',
                        borderRadius: 5,
                    }}
                    title={`Requested ${fmt(metric, a.request)}`}
                />
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: `${pct(a.usage)}%`,
                        background: 'var(--accent-success)',
                        borderRadius: 5,
                        height: 4,
                        top: 3,
                    }}
                    title={`Used ${fmt(metric, a.usage)}`}
                />
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
                used {fmt(metric, a.usage)} · requested {fmt(metric, a.request)} · allocatable{' '}
                {fmt(metric, a.allocatable)}
            </div>
        </div>
    );
};

export const ResourceUsageView = ({ selectedNs }: { selectedNs: string }) => {
    const [metric, setMetric] = useState<Metric>('cpu');
    const [selected, setSelected] = useState<PodUsage | null>(null);

    const { data, isFetching, refetch, error } = useQuery({
        queryKey: ['usage', selectedNs],
        queryFn: async () =>
            (await api.get<UsageResponse>('/metrics/usage', { params: { namespace: selectedNs } })).data,
        refetchInterval: 15000,
    });

    const byNamespace = useMemo(() => {
        const groups = new Map<string, PodUsage[]>();
        for (const p of data?.pods || []) {
            const list = groups.get(p.namespace) || [];
            list.push(p);
            groups.set(p.namespace, list);
        }
        return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [data]);

    const hinted = useMemo(() => (data?.pods || []).filter((p) => p.hints.length > 0), [data]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button
                        className={`btn btn-sm ${metric === 'cpu' ? 'btn-primary' : ''}`}
                        onClick={() => setMetric('cpu')}
                    >
                        CPU
                    </button>
                    <button
                        className={`btn btn-sm ${metric === 'memory' ? 'btn-primary' : ''}`}
                        onClick={() => setMetric('memory')}
                    >
                        Memory
                    </button>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Each square is a running pod: usage as a share of its limit (or request when no limit is set).
                </span>
                <button
                    className="btn btn-sm"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => void refetch()}
                    disabled={isFetching}
                >
                    <RefreshCw size={14} className={isFetching ? 'spin' : ''} /> Refresh
                </button>
            </div>

            {error && <div style={{ color: 'var(--accent-error)' }}>{apiErrorMessage(error)}</div>}
            {data && !data.metricsAvailable && (
                <div style={{ color: 'var(--accent-warning)', fontSize: '0.85rem' }}>
                    metrics-server is not reachable, so usage is unavailable. Requests and limits are still shown.
                </div>
            )}

            <section>
                <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem' }}>Nodes</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10 }}>
                    {(data?.nodes || []).map((n) => (
                        <div
                            key={n.name}
                            style={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 10,
                                padding: '12px 14px',
                            }}
                        >
                            <div style={{ fontFamily: 'monospace', fontWeight: 600, marginBottom: 8 }}>
                                {n.name}
                                <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.75rem' }}>
                                    {' '}
                                    · {n.pods.count}/{n.pods.allocatable} pods
                                </span>
                            </div>
                            <NodeBar metric={metric} a={n[metric]} />
                        </div>
                    ))}
                </div>
            </section>

            <section>
                <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem' }}>Pods</h3>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
                    {LEGEND.map(([color, label]) => (
                        <span
                            key={label}
                            style={{
                                display: 'inline-flex',
                                gap: 6,
                                alignItems: 'center',
                                fontSize: '0.72rem',
                                color: 'var(--text-muted)',
                            }}
                        >
                            <span
                                style={{
                                    width: 12,
                                    height: 12,
                                    borderRadius: 3,
                                    background: color,
                                    display: 'inline-block',
                                }}
                            />
                            {label}
                        </span>
                    ))}
                </div>
                {byNamespace.map(([ns, pods]) => (
                    <div key={ns} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                            {ns} · {pods.length}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {pods.map((p) => {
                                const u = utilisation(p[metric]);
                                const isSel = selected?.name === p.name && selected.namespace === p.namespace;
                                return (
                                    <button
                                        key={p.name}
                                        onClick={() => setSelected(isSel ? null : p)}
                                        aria-label={`${p.name}: ${u === null ? 'no data' : Math.round(u * 100) + '%'}`}
                                        title={`${p.name}\n${fmt(metric, p[metric].usage)} used / ${fmt(metric, p[metric].request)} requested${
                                            p[metric].limit ? ` / ${fmt(metric, p[metric].limit)} limit` : ''
                                        }`}
                                        style={{
                                            width: 22,
                                            height: 22,
                                            borderRadius: 4,
                                            cursor: 'pointer',
                                            padding: 0,
                                            background: cellColor(u),
                                            border: isSel ? '2px solid #fff' : '1px solid rgba(255,255,255,0.08)',
                                        }}
                                    />
                                );
                            })}
                        </div>
                    </div>
                ))}
                {selected && (
                    <div
                        style={{
                            marginTop: 8,
                            padding: '12px 16px',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 8,
                            fontSize: '0.82rem',
                        }}
                    >
                        <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {selected.namespace}/{selected.name}
                        </div>
                        <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                            Node {selected.node || '–'} · CPU {formatCpu(selected.cpu.usage)} used /{' '}
                            {formatCpu(selected.cpu.request)} requested · Memory {formatBytes(selected.memory.usage)}{' '}
                            used / {formatBytes(selected.memory.request)} requested
                        </div>
                    </div>
                )}
            </section>

            <section>
                <h3 style={{ margin: '0 0 10px', fontSize: '0.95rem' }}>Right-sizing hints ({hinted.length})</h3>
                {hinted.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>No pods need attention.</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {hinted.slice(0, 200).map((p) => (
                        <div
                            key={`${p.namespace}/${p.name}`}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 12,
                                padding: '8px 12px',
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border-color)',
                                borderRadius: 8,
                                fontSize: '0.8rem',
                            }}
                        >
                            <span style={{ fontFamily: 'monospace' }}>
                                {p.namespace}/{p.name}
                            </span>
                            <span style={{ color: 'var(--accent-warning)' }}>{p.hints.join(' · ')}</span>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
};
