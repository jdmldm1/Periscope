import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import axios from 'axios';
import { apiErrorMessage } from '../../utils/format';

const api = axios.create({ baseURL: '/api' });

interface Field {
    path: string;
    type: string;
    required: boolean;
    description: string;
    enum?: string[];
}
interface CrdVersion {
    name: string;
    served: boolean;
    storage: boolean;
    deprecated: boolean;
    printerColumns: { name: string; type: string; jsonPath: string }[];
    fields: Field[];
}
interface CrdSchema {
    name: string;
    group: string;
    scope: string;
    kind: string;
    plural: string;
    versions: CrdVersion[];
}

export const CrdSchemaPanel = ({ name }: { name: string }) => {
    const [versionName, setVersionName] = useState<string | null>(null);
    const [query, setQuery] = useState('');

    const { data, isFetching, error } = useQuery({
        queryKey: ['crd-schema', name],
        queryFn: async () => (await api.get<CrdSchema>(`/kube/crd/${encodeURIComponent(name)}/schema`)).data,
    });

    if (error) return <div style={{ color: 'var(--accent-error)' }}>{apiErrorMessage(error)}</div>;
    if (!data) {
        return isFetching ? (
            <div className="loader-container">
                <div className="loader"></div>
            </div>
        ) : null;
    }

    const version =
        data.versions.find((v) => v.name === versionName) || data.versions.find((v) => v.storage) || data.versions[0];
    const q = query.trim().toLowerCase();
    const fields = (version?.fields || []).filter(
        (f) => !q || f.path.toLowerCase().includes(q) || f.description.toLowerCase().includes(q),
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-main)' }}>{data.kind}</strong> · {data.group} · {data.scope}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {data.versions.map((v) => (
                    <button
                        key={v.name}
                        className={`btn btn-sm ${v.name === version?.name ? 'btn-primary' : ''}`}
                        onClick={() => setVersionName(v.name)}
                    >
                        {v.name}
                        {v.storage ? ' (storage)' : ''}
                        {v.deprecated ? ' (deprecated)' : ''}
                        {!v.served ? ' (not served)' : ''}
                    </button>
                ))}
                <div className="search-box" style={{ flex: 1, minWidth: 180 }}>
                    <Search size={14} />
                    <input
                        type="text"
                        placeholder="Filter fields…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
            </div>
            {version && version.printerColumns.length > 0 && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Printer columns: {version.printerColumns.map((c) => c.name).join(', ')}
                </div>
            )}
            {fields.length === 0 && (
                <div style={{ color: 'var(--text-muted)' }}>
                    {version?.fields.length ? 'No fields match.' : 'This version does not publish a structural schema.'}
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {fields.slice(0, 1000).map((f) => (
                    <div
                        key={f.path}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(180px, 1.2fr) 110px 1.6fr',
                            gap: 10,
                            padding: '5px 8px',
                            fontSize: '0.78rem',
                            borderBottom: '1px solid var(--border-color)',
                        }}
                    >
                        <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {f.path}
                            {f.required && <span style={{ color: 'var(--accent-error)' }}> *</span>}
                        </span>
                        <span style={{ color: 'var(--accent-cyan)' }}>{f.type}</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                            {f.description}
                            {f.enum && ` (one of: ${f.enum.join(', ')})`}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
