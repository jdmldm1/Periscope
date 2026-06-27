import { X } from 'lucide-react';

export interface HelmDeployForm {
  releaseName: string;
  repo: string;
  chartName: string;
  version: string;
  namespace: string;
  valuesYaml: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  form: HelmDeployForm;
  setForm: (form: HelmDeployForm) => void;
  onSubmit: (e: React.FormEvent) => void;
}

// "Deploy Helm Chart" dialog opened from the header. The form state is owned by
// App because the same values back the custom-install flow in HelmManagerView.
export function DeployHelmModal({ isOpen, onClose, form, setForm, onSubmit }: Props) {
  if (!isOpen) return null;

  const inputStyle = { background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '8px 12px' };
  const labelStyle = { fontSize: '0.8rem', color: 'var(--text-muted)' };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <div className="modal-title">Deploy Helm Chart</div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 0' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <label style={labelStyle}>Release Name</label>
              <input
                type="text"
                placeholder="e.g. my-release"
                className="exec-input"
                style={inputStyle}
                value={form.releaseName}
                onChange={e => setForm({ ...form, releaseName: e.target.value })}
                required
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <label style={labelStyle}>Namespace</label>
              <input
                type="text"
                placeholder="e.g. default"
                className="exec-input"
                style={inputStyle}
                value={form.namespace}
                onChange={e => setForm({ ...form, namespace: e.target.value })}
                required
              />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Chart Name / Local Path / Repository URL</label>
            <input
              type="text"
              placeholder="e.g. bitnami/nginx or ./charts/periscope"
              className="exec-input"
              style={inputStyle}
              value={form.chartName}
              onChange={e => setForm({ ...form, chartName: e.target.value })}
              required
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Custom values.yaml (Optional)</label>
            <textarea
              placeholder="replicaCount: 2&#10;service:&#10;  type: ClusterIP"
              className="editor-textarea"
              style={{ minHeight: '120px', fontSize: '0.85rem', fontFamily: 'monospace', padding: '10px' }}
              value={form.valuesYaml}
              onChange={e => setForm({ ...form, valuesYaml: e.target.value })}
              spellCheck={false}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Deploy</button>
          </div>
        </form>
      </div>
    </div>
  );
}
