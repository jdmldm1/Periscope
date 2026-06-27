import { useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// Quick "deploy by path / OCI reference" dialog opened from the header. Owns its
// own form state since nothing outside the modal reads it.
export function DeployZarfModal({ isOpen, onClose }: Props) {
  const [packagePath, setPackagePath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!packagePath) return alert('Package Path is required');
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/zarf/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packagePath }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Zarf package deployed successfully');
        onClose();
        setPackagePath('');
      } else {
        alert('Failed to deploy package: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <div className="modal-title">Deploy Zarf Package</div>
          <button className="btn btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Local Zarf Package Path / OCI Reference</label>
            <input
              type="text"
              placeholder="e.g. zarf-package-periscope-amd64-1.0.0.tar.zst"
              className="exec-input"
              style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '8px 12px' }}
              value={packagePath}
              onChange={e => setPackagePath(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
            <button type="button" className="btn" onClick={onClose} disabled={isSubmitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Deploying...' : 'Deploy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
