import { useState, useCallback, useEffect, Fragment } from 'react';
import { FolderOpen, File, Trash2, Eye, HardDrive, RefreshCw, X, ChevronRight, Copy, ArrowLeft } from 'lucide-react';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
}

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes === 0) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString();
  } catch { return dateStr; }
};

interface PvcExplorerViewProps {
  initialNamespace?: string;
  setInitialNamespace?: (ns: string) => void;
  initialPvcName?: string;
  setInitialPvcName?: (name: string) => void;
}

export const PvcExplorerView = ({
  initialNamespace = '',
  setInitialNamespace,
  initialPvcName = '',
  setInitialPvcName
}: PvcExplorerViewProps) => {
  const [namespace, setNamespace] = useState(initialNamespace);
  const [pvcName, setPvcName] = useState(initialPvcName);
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [error, setError] = useState('');

  // File viewer
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  // Cleanup
  const [isCleaning, setIsCleaning] = useState(false);

  const browse = useCallback(async (path: string = '/', ns: string = namespace, pvc: string = pvcName) => {
    if (!ns || !pvc) {
      setError('Namespace and PVC Name are required');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/volumes/${ns}/${pvc}/browse`, { params: { path } });
      const mapped: FileEntry[] = (Array.isArray(data) ? data : []).map((item: any) => ({
        name: item.name,
        type: item.isDir ? 'directory' : 'file',
        size: item.size,
        modified: item.mtime
      }));
      setFiles(mapped);
      setCurrentPath(path);
      setIsBrowsing(true);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, [namespace, pvcName]);

  useEffect(() => {
    if (initialNamespace && initialPvcName) {
      setNamespace(initialNamespace);
      setPvcName(initialPvcName);
      browse('/', initialNamespace, initialPvcName);

      // Clear the parent prefilled state
      if (setInitialNamespace) setInitialNamespace('');
      if (setInitialPvcName) setInitialPvcName('');
    }
  }, [initialNamespace, initialPvcName, setInitialNamespace, setInitialPvcName, browse]);

  const navigateTo = useCallback((folderName: string) => {
    const newPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
    browse(newPath);
  }, [currentPath, browse]);

  const navigateUp = useCallback(() => {
    if (currentPath === '/') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    browse(parts.length === 0 ? '/' : '/' + parts.join('/'));
  }, [currentPath, browse]);

  const viewFile = useCallback(async (fileName: string) => {
    const filePath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;
    setViewingFile(filePath);
    setIsLoadingFile(true);
    setFileContent('');
    try {
      const { data } = await api.get(`/volumes/${namespace}/${pvcName}/view`, { params: { path: filePath } });
      setFileContent(data.content || '');
    } catch (err: any) {
      setFileContent(`Error: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsLoadingFile(false);
    }
  }, [namespace, pvcName, currentPath]);

  const deleteFile = useCallback(async (fileName: string) => {
    const filePath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`;
    if (!confirm(`Delete "${fileName}"? This action cannot be undone.`)) return;
    try {
      await api.delete(`/volumes/${namespace}/${pvcName}/delete`, { params: { path: filePath } });
      browse(currentPath);
    } catch (err: any) {
      alert('Failed to delete: ' + (err.response?.data?.error || err.message));
    }
  }, [namespace, pvcName, currentPath, browse]);

  const handleCleanup = useCallback(async () => {
    if (!confirm('This will delete the transient browser pod. Continue?')) return;
    setIsCleaning(true);
    try {
      await api.post(`/volumes/${namespace}/${pvcName}/cleanup`);
      setFiles([]);
      setIsBrowsing(false);
      setCurrentPath('/');
    } catch (err: any) {
      alert('Cleanup failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsCleaning(false);
    }
  }, [namespace, pvcName]);

  const copyContent = useCallback(() => {
    navigator.clipboard.writeText(fileContent);
  }, [fileContent]);

  // Breadcrumb segments
  const pathSegments = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean);

  return (
    <div style={{ padding: '0 4px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <HardDrive size={20} style={{ color: 'var(--accent-cyan)' }} />
        <div>
          <span style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>PVC File Explorer</span>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0' }}>
            Browse PersistentVolumeClaim contents using a transient helper pod
          </p>
        </div>
      </div>

      {/* Connection Panel */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-color)',
        borderRadius: 12, padding: 20, marginBottom: 20,
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>
              Namespace
            </label>
            <input
              type="text"
              placeholder="e.g., default"
              value={namespace}
              onChange={e => setNamespace(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px',
                background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500 }}>
              PVC Name
            </label>
            <input
              type="text"
              placeholder="e.g., data-postgres-0"
              value={pvcName}
              onChange={e => setPvcName(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px',
                background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.85rem',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={() => browse('/')}
              disabled={isLoading || !namespace || !pvcName}
              style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
            >
              {isLoading && !isBrowsing ? <RefreshCw size={14} className="spin" /> : <FolderOpen size={14} />}
              Browse
            </button>
            {isBrowsing && (
              <button
                className="btn"
                onClick={handleCleanup}
                disabled={isCleaning}
                style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-error)', whiteSpace: 'nowrap' }}
              >
                {isCleaning ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
                Cleanup Pod
              </button>
            )}
          </div>
        </div>

        {error && (
          <div style={{
            marginTop: 14, padding: '10px 14px', background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6,
            color: '#ef4444', fontSize: '0.85rem',
          }}>
            {error}
          </div>
        )}
      </div>

      {/* File Browser */}
      {isBrowsing && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 12, overflow: 'hidden',
        }}>
          {/* Breadcrumb */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '12px 18px',
            borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)',
            flexWrap: 'wrap',
          }}>
            {currentPath !== '/' && (
              <button className="btn btn-sm btn-icon" onClick={navigateUp} title="Go up" style={{ marginRight: 6 }}>
                <ArrowLeft size={14} />
              </button>
            )}
            <span
              style={{ color: 'var(--accent-blue)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
              onClick={() => browse('/')}
            >
              /
            </span>
            {pathSegments.map((seg, i) => (
              <Fragment key={i}>
                <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
                <span
                  style={{
                    color: i === pathSegments.length - 1 ? 'var(--text-primary)' : 'var(--accent-blue)',
                    cursor: i === pathSegments.length - 1 ? 'default' : 'pointer',
                    fontSize: '0.85rem', fontWeight: i === pathSegments.length - 1 ? 600 : 400,
                  }}
                  onClick={() => {
                    if (i < pathSegments.length - 1) {
                      browse('/' + pathSegments.slice(0, i + 1).join('/'));
                    }
                  }}
                >
                  {seg}
                </span>
              </Fragment>
            ))}
          </div>

          {/* File Table */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '50px 20px' }}>
              <div className="loader-sm" style={{ width: 28, height: 28, borderWidth: 3, margin: '0 auto 12px' }} />
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {!isBrowsing ? 'Initializing browser pod...' : 'Loading files...'}
              </div>
            </div>
          ) : files.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px' }}>
              <FolderOpen size={36} style={{ color: 'var(--text-muted)', opacity: 0.4, marginBottom: 12 }} />
              <div style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Empty directory</div>
            </div>
          ) : (
            <table className="crd-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Name</th>
                  <th style={{ width: 100 }}>Size</th>
                  <th style={{ width: 180 }}>Modified</th>
                  <th style={{ width: 90, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files
                  .sort((a, b) => {
                    if (a.type === 'directory' && b.type !== 'directory') return -1;
                    if (a.type !== 'directory' && b.type === 'directory') return 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map(file => (
                    <tr
                      key={file.name}
                      style={{ cursor: file.type === 'directory' ? 'pointer' : 'default' }}
                      onClick={() => file.type === 'directory' && navigateTo(file.name)}
                    >
                      <td style={{ textAlign: 'center' }}>
                        {file.type === 'directory'
                          ? <FolderOpen size={16} style={{ color: '#f59e0b' }} />
                          : <File size={16} style={{ color: 'var(--text-muted)' }} />
                        }
                      </td>
                      <td>
                        <span style={{
                          fontFamily: 'monospace', fontSize: '0.85rem',
                          color: file.type === 'directory' ? '#f59e0b' : 'var(--text-primary)',
                          fontWeight: file.type === 'directory' ? 500 : 400,
                        }}>
                          {file.name}{file.type === 'directory' ? '/' : ''}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        {file.type === 'file' ? formatBytes(file.size) : '—'}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        {formatDate(file.modified)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {file.type === 'file' && (
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-sm btn-icon"
                              onClick={e => { e.stopPropagation(); viewFile(file.name); }}
                              title="View"
                            >
                              <Eye size={13} />
                            </button>
                            <button
                              className="btn btn-sm btn-icon"
                              onClick={e => { e.stopPropagation(); deleteFile(file.name); }}
                              title="Delete"
                              style={{ color: 'var(--accent-error)' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Not Browsing State */}
      {!isBrowsing && !error && (
        <div style={{
          textAlign: 'center', padding: '80px 20px',
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 12,
        }}>
          <HardDrive size={48} style={{ color: 'var(--text-muted)', opacity: 0.4, marginBottom: 16 }} />
          <div style={{ fontSize: '1.1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Select a PVC to Browse</div>
          <div style={{ color: 'var(--text-muted)', marginTop: 8, maxWidth: 440, margin: '8px auto 0' }}>
            Enter a namespace and PVC name above, then click "Browse" to initialize a transient helper pod and explore the volume contents.
          </div>
        </div>
      )}

      {/* File Viewer Modal */}
      {viewingFile && (
        <div className="modal-overlay" onClick={() => setViewingFile(null)}>
          <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: 800 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                {viewingFile}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" onClick={copyContent} title="Copy">
                  <Copy size={14} />
                </button>
                <button className="btn btn-icon" onClick={() => setViewingFile(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>
            {isLoadingFile ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div className="loader-sm" style={{ width: 24, height: 24, borderWidth: 2, margin: '0 auto 12px' }} />
                <div style={{ color: 'var(--text-muted)' }}>Loading file content...</div>
              </div>
            ) : (
              <pre style={{
                background: 'var(--bg-main)', border: '1px solid var(--border-color)',
                borderRadius: 8, padding: 16, margin: '16px 0 0',
                maxHeight: 500, overflow: 'auto', fontSize: '0.82rem',
                fontFamily: 'monospace', color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.6,
              }}>
                {fileContent || '(empty file)'}
              </pre>
            )}
          </div>
        </div>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
