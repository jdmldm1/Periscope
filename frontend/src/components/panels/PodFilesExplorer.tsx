import React from 'react';
import { RefreshCw } from 'lucide-react';

interface PodFilesExplorerProps {
  modal: any;
  currentDirPath: string;
  setCurrentDirPath: (path: string) => void;
  isListingFiles: boolean;
  podFiles: any[];
  podFileUploadProgress: number;
  podFileUploadName: string;
  handleUploadPodFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleCreatePodFolder: () => void;
  fetchPodFilesList: (path: string) => void;
  handleEditPodFile: (name: string) => void;
  handleDownloadPodFile: (name: string, isDir: boolean) => void;
  handleDeletePodFile: (name: string, isDir: boolean) => void;
}

export const PodFilesExplorer: React.FC<PodFilesExplorerProps> = ({
  modal,
  currentDirPath,
  isListingFiles,
  podFiles,
  podFileUploadProgress,
  podFileUploadName,
  handleUploadPodFile,
  handleCreatePodFolder,
  fetchPodFilesList,
  handleEditPodFile,
  handleDownloadPodFile,
  handleDeletePodFile,
}) => {
  if (!modal) return null;
  
  const handleNavigateUp = () => {
    if (currentDirPath === '/') return;
    const parts = currentDirPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = '/' + parts.join('/') + (parts.length > 0 ? '/' : '');
    fetchPodFilesList(parentPath);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Path:</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-main)', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, padding: '4px 8px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentDirPath}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input 
            type="file" 
            id="pod-file-upload-input" 
            style={{ display: 'none' }} 
            onChange={handleUploadPodFile} 
          />
          <button className="btn" onClick={() => document.getElementById('pod-file-upload-input')?.click()} disabled={podFileUploadProgress >= 0}>
            Upload File
          </button>
          <button className="btn" onClick={handleCreatePodFolder}>
            New Folder
          </button>
          <button className="btn btn-icon" onClick={() => fetchPodFilesList(currentDirPath)} disabled={isListingFiles}>
            <RefreshCw size={14} className={isListingFiles ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {podFileUploadProgress >= 0 && (
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>Uploading: {podFileUploadName}</span>
            <span>{podFileUploadProgress}%</span>
          </div>
          <div className="metric-bar-wrapper" style={{ margin: 0 }}>
            <div className="metric-bar-fill normal" style={{ width: `${podFileUploadProgress}%` }}></div>
          </div>
        </div>
      )}

      <div className="terminal-container" style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
        {isListingFiles ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div className="loader" style={{ margin: '0 auto 10px auto', width: 24, height: 24 }}></div>
            Reading directory contents...
          </div>
        ) : (
          <table className="crd-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.1)' }}>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>Name</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.75rem', width: 80 }}>Type</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.75rem', width: 100, textAlign: 'right' }}>Size</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.75rem', width: 140 }}>Modified</th>
                <th style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.75rem', width: 100, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentDirPath !== '/' && (
                <tr 
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.02)', cursor: 'pointer' }}
                  onClick={handleNavigateUp}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '6px 12px', fontWeight: 600, color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>📁 ..</span>
                  </td>
                  <td style={{ padding: '6px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Parent Dir</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.8rem' }}>--</td>
                  <td style={{ padding: '6px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>--</td>
                  <td style={{ padding: '6px 12px', textAlign: 'right' }}></td>
                </tr>
              )}

              {podFiles.length === 0 && currentDirPath === '/' ? (
                <tr>
                  <td colSpan={5} style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No files found.
                  </td>
                </tr>
              ) : (
                podFiles.map(file => (
                  <tr 
                    key={file.name} 
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td 
                      style={{ padding: '8px 12px', fontWeight: 500, cursor: file.isDir ? 'pointer' : 'default', color: file.isDir ? 'var(--accent-green)' : 'var(--text-main)' }}
                      onClick={() => {
                        if (file.isDir) {
                          fetchPodFilesList(currentDirPath + file.name + '/');
                        }
                      }}
                    >
                      {file.isDir ? `📁 ${file.name}` : `📄 ${file.name}`}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {file.isDir ? 'Folder' : file.isLink ? 'Symlink' : 'File'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontSize: '0.8rem' }}>
                      {file.isDir ? '--' : `${(file.size / 1024).toFixed(1)} KB`}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {file.date}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {!file.isDir && (
                          <button 
                            className="btn" 
                            style={{ padding: '2px 6px', fontSize: '0.7rem', color: 'var(--accent-cyan)' }} 
                            onClick={() => handleEditPodFile(file.name)}
                          >
                            Edit
                          </button>
                        )}
                        <button 
                          className="btn" 
                          style={{ padding: '2px 6px', fontSize: '0.7rem' }} 
                          onClick={() => handleDownloadPodFile(file.name, file.isDir)}
                        >
                          Download
                        </button>
                        <button 
                          className="btn btn-danger" 
                          style={{ padding: '2px 6px', fontSize: '0.7rem' }} 
                          onClick={() => handleDeletePodFile(file.name, file.isDir)}
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
