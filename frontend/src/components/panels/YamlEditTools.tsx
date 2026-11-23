import { useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { CheckCircle2, GitCompare, X } from 'lucide-react';
import axios from 'axios';
import { apiErrorMessage } from '../../utils/format';

const api = axios.create({ baseURL: '/api' });

interface Props {
    kind: string;
    namespace: string | undefined;
    name: string;
    yaml: string;
}

const resourceUrl = (kind: string, namespace: string | undefined, name: string) =>
    `/kube/resource/${encodeURIComponent(kind)}/${encodeURIComponent(namespace || 'undefined')}/${encodeURIComponent(name)}`;

export const YamlEditTools = ({ kind, namespace, name, yaml }: Props) => {
    const [busy, setBusy] = useState<'dry-run' | 'diff' | null>(null);
    const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
    const [live, setLive] = useState<string | null>(null);

    const dryRun = async () => {
        setBusy('dry-run');
        setResult(null);
        try {
            const { data } = await api.post<{ valid: boolean; message: string }>(
                `${resourceUrl(kind, namespace, name)}/dry-run`,
                { yaml },
            );
            setResult({ ok: data.valid, text: data.message || (data.valid ? 'Valid' : 'Invalid') });
        } catch (err) {
            setResult({ ok: false, text: apiErrorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    const showDiff = async () => {
        setBusy('diff');
        setResult(null);
        try {
            const { data } = await api.get<string>(`${resourceUrl(kind, namespace, name)}/yaml`, {
                responseType: 'text',
                transformResponse: (r: string) => r,
            });
            setLive(data);
        } catch (err) {
            setResult({ ok: false, text: apiErrorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    return (
        <>
            {result && (
                <span
                    style={{
                        marginRight: 'auto',
                        alignSelf: 'center',
                        fontSize: '0.8rem',
                        maxWidth: '60%',
                        whiteSpace: 'pre-wrap',
                        color: result.ok ? 'var(--accent-success)' : 'var(--accent-error)',
                    }}
                >
                    {result.ok && <CheckCircle2 size={12} style={{ marginRight: 4 }} />}
                    {result.text}
                </span>
            )}
            <button
                className="btn"
                onClick={() => void showDiff()}
                disabled={busy !== null}
                title="Compare your edits with the live object"
            >
                <GitCompare size={14} /> {busy === 'diff' ? 'Loading…' : 'Diff vs live'}
            </button>
            <button
                className="btn"
                onClick={() => void dryRun()}
                disabled={busy !== null}
                title="Validate against the API server without applying"
            >
                <CheckCircle2 size={14} /> {busy === 'dry-run' ? 'Validating…' : 'Validate'}
            </button>
            {live !== null && (
                <div className="modal-overlay" style={{ zIndex: 3000 }} onClick={() => setLive(null)}>
                    <div
                        className="modal-content animate-fade-in"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            maxWidth: '90vw',
                            width: '90vw',
                            height: '80vh',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        <div className="modal-header">
                            <div className="modal-title">
                                Live ← → Your edits · {kind}/{name}
                            </div>
                            <button className="btn btn-icon" onClick={() => setLive(null)}>
                                <X size={18} />
                            </button>
                        </div>
                        <div style={{ flex: 1, minHeight: 0 }}>
                            <DiffEditor
                                height="100%"
                                language="yaml"
                                theme="vs-dark"
                                original={live}
                                modified={yaml}
                                options={{
                                    readOnly: true,
                                    renderSideBySide: true,
                                    minimap: { enabled: false },
                                    automaticLayout: true,
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
