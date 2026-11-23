import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search } from 'lucide-react';
import axios from 'axios';
import { apiErrorMessage } from '../../utils/format';

const api = axios.create({ baseURL: '/api' });

interface Subject {
    kind: string;
    name: string;
    namespace?: string;
    bindings: number;
    clusterAdmin: boolean;
    wildcard: boolean;
    clusterWide: boolean;
}
interface Rule {
    apiGroups?: string[];
    resources?: string[];
    verbs?: string[];
    resourceNames?: string[];
    nonResourceURLs?: string[];
}
interface Grant {
    binding: { name: string; kind: string };
    role: { kind: string; name: string; found: boolean };
    scope: string;
    rules: Rule[];
    clusterAdmin: boolean;
    wildcard: boolean;
}

const VERBS = ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete', 'deletecollection', '*'];

const subjectKey = (s: Subject) => `${s.kind}/${s.namespace || ''}/${s.name}`;

const Badge = ({ text, color }: { text: string; color: string }) => (
    <span
        style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color,
            border: `1px solid ${color}`,
            borderRadius: 4,
            padding: '1px 6px',
        }}
    >
        {text}
    </span>
);

const SubjectDetail = ({ subject }: { subject: Subject }) => {
    const { data, isFetching, error } = useQuery({
        queryKey: ['rbac-subject', subjectKey(subject)],
        queryFn: async () =>
            (
                await api.get<{ grants: Grant[] }>('/rbac/subject', {
                    params: { kind: subject.kind, name: subject.name, namespace: subject.namespace },
                })
            ).data.grants,
    });
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                {subject.kind}: {subject.namespace ? `${subject.namespace}/` : ''}
                {subject.name}
            </div>
            {isFetching && <div className="loader-sm" style={{ width: 14, height: 14, borderWidth: 2 }} />}
            {error && <div style={{ color: 'var(--accent-error)' }}>{apiErrorMessage(error)}</div>}
            {(data || []).map((g, i) => (
                <div
                    key={`${g.binding.name}-${i}`}
                    style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 8,
                        padding: '10px 14px',
                        fontSize: '0.8rem',
                    }}
                >
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                            {g.role.kind}/{g.role.name}
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>
                            via {g.binding.kind} {g.binding.name} ·{' '}
                            {g.scope === 'cluster' ? 'cluster-wide' : `namespace ${g.scope}`}
                        </span>
                        {g.clusterAdmin && <Badge text="cluster-admin" color="var(--accent-error)" />}
                        {g.wildcard && !g.clusterAdmin && <Badge text="wildcard" color="var(--accent-warning)" />}
                        {!g.role.found && <Badge text="role missing" color="var(--text-muted)" />}
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {g.rules.map((r, j) => (
                            <div
                                key={j}
                                style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: 'var(--text-muted)' }}
                            >
                                <span style={{ color: 'var(--text-main)' }}>{(r.verbs || []).join(', ')}</span>
                                {' on '}
                                {(r.resources || r.nonResourceURLs || []).join(', ') || '–'}
                                {r.apiGroups &&
                                    r.apiGroups.length > 0 &&
                                    ` [${r.apiGroups.map((a) => a || 'core').join(', ')}]`}
                                {r.resourceNames &&
                                    r.resourceNames.length > 0 &&
                                    ` (names: ${r.resourceNames.join(', ')})`}
                            </div>
                        ))}
                        {g.rules.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No rules.</div>}
                    </div>
                </div>
            ))}
        </div>
    );
};

const SubjectList = ({
    subjects,
    selected,
    onSelect,
}: {
    subjects: Subject[];
    selected: Subject | null;
    onSelect: (s: Subject) => void;
}) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '65vh', overflowY: 'auto' }}>
        {subjects.slice(0, 500).map((s) => {
            const isSel = selected !== null && subjectKey(selected) === subjectKey(s);
            return (
                <div
                    key={subjectKey(s)}
                    onClick={() => onSelect(s)}
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderRadius: 6,
                        background: isSel ? 'rgba(59,130,246,0.15)' : 'var(--bg-card)',
                        border: `1px solid ${isSel ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                        fontSize: '0.8rem',
                    }}
                >
                    <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                            {s.kind === 'ServiceAccount' ? `sa ${s.namespace}/` : `${s.kind.toLowerCase()} `}
                        </span>
                        {s.name}
                    </span>
                    <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {s.clusterAdmin && <Badge text="admin" color="var(--accent-error)" />}
                        {s.wildcard && !s.clusterAdmin && <Badge text="wildcard" color="var(--accent-warning)" />}
                        <span style={{ color: 'var(--text-muted)' }}>{s.bindings}</span>
                    </span>
                </div>
            );
        })}
    </div>
);

export const RbacExplorerView = ({ selectedNs }: { selectedNs: string }) => {
    const [mode, setMode] = useState<'subjects' | 'whocan'>('subjects');
    const [query, setQuery] = useState('');
    const [kindFilter, setKindFilter] = useState('all');
    const [onlyRisky, setOnlyRisky] = useState(false);
    const [selected, setSelected] = useState<Subject | null>(null);
    const [verb, setVerb] = useState('get');
    const [resource, setResource] = useState('secrets');
    const [apiGroup, setApiGroup] = useState('');
    const [submitted, setSubmitted] = useState<{ verb: string; resource: string; apiGroup: string } | null>(null);

    const subjectsQuery = useQuery({
        queryKey: ['rbac-subjects'],
        queryFn: async () => (await api.get<{ subjects: Subject[] }>('/rbac/subjects')).data.subjects,
    });

    const whoCanQuery = useQuery({
        queryKey: ['rbac-whocan', submitted, selectedNs],
        enabled: submitted !== null,
        queryFn: async () =>
            (
                await api.get<{ subjects: Subject[] }>('/rbac/whocan', {
                    params: { ...submitted, namespace: selectedNs === 'all' ? undefined : selectedNs },
                })
            ).data.subjects,
    });

    const q = query.trim().toLowerCase();
    const subjects = (subjectsQuery.data || []).filter(
        (s) =>
            (kindFilter === 'all' || s.kind === kindFilter) &&
            (!onlyRisky || s.clusterAdmin || s.wildcard) &&
            (!q || `${s.name} ${s.namespace || ''}`.toLowerCase().includes(q)),
    );

    const list = mode === 'subjects' ? subjects : whoCanQuery.data || [];
    const loading = mode === 'subjects' ? subjectsQuery.isFetching : whoCanQuery.isFetching;
    const error = mode === 'subjects' ? subjectsQuery.error : whoCanQuery.error;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button
                        className={`btn btn-sm ${mode === 'subjects' ? 'btn-primary' : ''}`}
                        onClick={() => setMode('subjects')}
                    >
                        Subjects
                    </button>
                    <button
                        className={`btn btn-sm ${mode === 'whocan' ? 'btn-primary' : ''}`}
                        onClick={() => setMode('whocan')}
                    >
                        Who can…?
                    </button>
                </div>
                {mode === 'subjects' ? (
                    <>
                        <div className="search-box" style={{ flex: 1, minWidth: 200 }}>
                            <Search size={14} />
                            <input
                                type="text"
                                placeholder="Filter subjects…"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                        <select
                            className="select-ns"
                            value={kindFilter}
                            onChange={(e) => setKindFilter(e.target.value)}
                        >
                            <option value="all">All kinds</option>
                            <option value="User">Users</option>
                            <option value="Group">Groups</option>
                            <option value="ServiceAccount">Service accounts</option>
                        </select>
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.8rem' }}>
                            <input
                                type="checkbox"
                                checked={onlyRisky}
                                onChange={(e) => setOnlyRisky(e.target.checked)}
                            />
                            Admin / wildcard only
                        </label>
                    </>
                ) : (
                    <form
                        style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}
                        onSubmit={(e) => {
                            e.preventDefault();
                            setSubmitted({ verb, resource: resource.trim(), apiGroup: apiGroup.trim() });
                            setSelected(null);
                        }}
                    >
                        <select className="select-ns" value={verb} onChange={(e) => setVerb(e.target.value)}>
                            {VERBS.map((v) => (
                                <option key={v} value={v}>
                                    {v}
                                </option>
                            ))}
                        </select>
                        <input
                            className="select-ns"
                            style={{ padding: '6px 10px', minWidth: 160 }}
                            placeholder="resource (pods, secrets, pods/exec)"
                            value={resource}
                            onChange={(e) => setResource(e.target.value)}
                        />
                        <input
                            className="select-ns"
                            style={{ padding: '6px 10px', minWidth: 120 }}
                            placeholder="apiGroup (blank = core)"
                            value={apiGroup}
                            onChange={(e) => setApiGroup(e.target.value)}
                        />
                        <button className="btn btn-primary btn-sm" type="submit" disabled={!resource.trim()}>
                            Evaluate
                        </button>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            {selectedNs === 'all' ? 'Any namespace' : `Namespace ${selectedNs} and cluster-wide`}
                        </span>
                    </form>
                )}
                <button
                    className="btn btn-sm"
                    onClick={() => void (mode === 'subjects' ? subjectsQuery.refetch() : whoCanQuery.refetch())}
                    disabled={loading}
                >
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                </button>
            </div>

            {error && <div style={{ color: 'var(--accent-error)' }}>{apiErrorMessage(error)}</div>}
            {mode === 'whocan' && !submitted && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Pick a verb and resource to list every subject whose bound roles allow it. Results come from
                    RoleBindings and ClusterRoleBindings only; they do not include other authorizers.
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 1.4fr)', gap: 16 }}>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 6 }}>
                        {list.length} subject{list.length === 1 ? '' : 's'}
                    </div>
                    <SubjectList subjects={list} selected={selected} onSelect={setSelected} />
                </div>
                <div>
                    {selected ? (
                        <SubjectDetail key={subjectKey(selected)} subject={selected} />
                    ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Select a subject to see its bindings and effective rules.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
