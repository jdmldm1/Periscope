import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import axios from 'axios';
import { apiErrorMessage, formatAge } from '../../utils/format';

const api = axios.create({ baseURL: '/api' });

interface Revision {
    revision: number;
    name: string;
    createdAt?: string;
    changeCause: string | null;
    images: string[];
    replicas: number;
    readyReplicas: number;
    current: boolean;
}

export const RolloutHistoryPanel = ({ namespace, name }: { namespace: string; name: string }) => {
    const queryClient = useQueryClient();
    const [busy, setBusy] = useState<number | null>(null);
    const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
    const queryKey = ['rollout-history', namespace, name];

    const { data, isFetching, error } = useQuery({
        queryKey,
        queryFn: async () =>
            (
                await api.get<{ revisions: Revision[] }>(
                    `/kube/resource/deployments/${namespace}/${name}/rollout-history`,
                )
            ).data.revisions,
        refetchInterval: 8000,
    });

    const rollback = async (rev: Revision) => {
        if (!window.confirm(`Roll back ${name} to revision ${rev.revision}?\n\n${rev.images.join('\n')}`)) return;
        setBusy(rev.revision);
        setNotice(null);
        try {
            const res = await api.post<{ message: string }>(
                `/kube/resource/deployments/${namespace}/${name}/rollback`,
                { revision: rev.revision },
            );
            setNotice({ ok: true, text: res.data.message || 'Rollback started' });
            await queryClient.invalidateQueries({ queryKey });
        } catch (err) {
            setNotice({ ok: false, text: apiErrorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {notice && (
                <div
                    style={{ color: notice.ok ? 'var(--accent-success)' : 'var(--accent-error)', fontSize: '0.85rem' }}
                >
                    {notice.text}
                </div>
            )}
            {error && <div style={{ color: 'var(--accent-error)' }}>{apiErrorMessage(error)}</div>}
            {isFetching && !data && <div className="loader-sm" style={{ width: 14, height: 14, borderWidth: 2 }} />}
            {data && data.length === 0 && (
                <div style={{ color: 'var(--text-muted)' }}>
                    No revisions recorded. The deployment may have revisionHistoryLimit set to 0.
                </div>
            )}
            {(data || []).map((r) => (
                <div
                    key={r.name}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '70px 1fr auto',
                        gap: 12,
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: 'var(--bg-card)',
                        border: `1px solid ${r.current ? 'var(--accent-success)' : 'var(--border-color)'}`,
                        borderRadius: 8,
                        fontSize: '0.82rem',
                    }}
                >
                    <div style={{ fontWeight: 700 }}>
                        #{r.revision}
                        {r.current && (
                            <div
                                style={{
                                    color: 'var(--accent-success)',
                                    fontSize: '0.65rem',
                                    textTransform: 'uppercase',
                                }}
                            >
                                current
                            </div>
                        )}
                    </div>
                    <div>
                        {r.images.map((img) => (
                            <div key={img} style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                {img}
                            </div>
                        ))}
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 2 }}>
                            {formatAge(r.createdAt)} ago · {r.readyReplicas}/{r.replicas} ready
                            {r.changeCause && ` · ${r.changeCause}`}
                        </div>
                    </div>
                    <button
                        className="btn btn-sm"
                        disabled={r.current || busy !== null}
                        onClick={() => void rollback(r)}
                        title={r.current ? 'This is the running revision' : `Roll back to revision ${r.revision}`}
                    >
                        <RotateCcw size={12} /> {busy === r.revision ? 'Rolling back…' : 'Roll back'}
                    </button>
                </div>
            ))}
        </div>
    );
};
