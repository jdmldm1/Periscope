import React from 'react';
import Editor from '@monaco-editor/react';
import { X, FileText, Terminal, Radio, Activity, SlidersHorizontal, Key, Copy, Save, ArrowDown, RefreshCw, Search, Microscope, FolderOpen } from 'lucide-react';
import { SecretDecoderPanel } from './SecretDecoderPanel';
import { PodFilesExplorer } from './PodFilesExplorer';
import { InteractiveTerminal } from './InteractiveTerminal';
import { PvcExplorerView } from './PvcExplorerView';

interface ModalManagerProps {
  modal: any;
  setModal: (m: any) => void;
  modalData: any;
  setModalData: (d: any) => void;
  yamlEdit: string;
  setYamlEdit: (y: string) => void;
  isEditingYaml: boolean;
  setIsEditingYaml: (e: boolean) => void;
  copyToClipboard: () => void;
  downloadYaml: () => void;
  downloadLogs: () => void;
  logSearch: string;
  setLogSearch: (s: string) => void;
  selectedContainer: string;
  setSelectedContainer: (c: string) => void;
  getPodContainers: () => string[];
  isStreamingLogs: boolean;
  setIsStreamingLogs: (s: boolean) => void;
  scrollToBottomLogs: () => void;
  fetchModalData: (type: string) => void;
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
  handleDownloadPodFile: (name: string, isDir?: boolean) => void;
  handleDeletePodFile: (name: string, isDir: boolean) => void;
  saveYaml: () => void;
  helmValuesEdit: string;
  setHelmValuesEdit: (v: string) => void;
  isSavingHelmValues: boolean;
  handleHelmUpgradeFromModal: () => void;
  handleRollback: (ns: string, name: string, rev: number) => void;
  handleInspectRevisionValues: (ns: string, name: string, rev: number) => void;
  selectedRevisionValues: any;
  setSelectedRevisionValues: (v: any) => void;
  isLoadingRevisionValues: boolean;
  renderDiffView: () => React.ReactNode;
}

export const ModalManager: React.FC<ModalManagerProps> = ({
  modal, setModal, modalData, setModalData, yamlEdit, setYamlEdit, isEditingYaml, setIsEditingYaml,
  copyToClipboard, downloadYaml, downloadLogs, logSearch, setLogSearch,
  selectedContainer, setSelectedContainer, getPodContainers, isStreamingLogs, setIsStreamingLogs,
  scrollToBottomLogs, fetchModalData, currentDirPath, setCurrentDirPath, isListingFiles,
  podFiles, podFileUploadProgress, podFileUploadName, handleUploadPodFile, handleCreatePodFolder,
  fetchPodFilesList, handleEditPodFile, handleDownloadPodFile, handleDeletePodFile,
  saveYaml, isSavingHelmValues, handleHelmUpgradeFromModal,
  handleRollback, handleInspectRevisionValues, selectedRevisionValues, setSelectedRevisionValues,
  isLoadingRevisionValues, renderDiffView
}) => {
  if (!modal) return null;

  const tabs = modal.kind === 'pods' ? ['diagnose', 'yaml', 'logs', 'events', 'files', 'terminal'] : 
               modal.kind === 'helm' ? ['values', 'history', 'events'] : ['yaml', 'events'];
  
  if (modal.kind === 'secrets' || modal.type === 'decoded') {
    if (!tabs.includes('decoded')) tabs.push('decoded');
  }
  if (modal.type === 'pvc-files' || modal.kind === 'persistentvolumeclaims') {
    if (!tabs.includes('pvc-files')) tabs.push('pvc-files');
  }
  if (modal.type === 'portforward') tabs.push('portforward');

  const colorizeLogs = (logs: any, searchQ: string) => {
    if (!logs) return <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: 20 }}>No logs available for this container.</div>;
    if (typeof logs !== 'string') {
      if (logs.error) {
        return <div style={{ color: 'var(--accent-error)', padding: 20 }}>{logs.error}</div>;
      }
      return <pre style={{ color: 'var(--text-main)', padding: 20, whiteSpace: 'pre-wrap' }}>{JSON.stringify(logs, null, 2)}</pre>;
    }
    const lines = logs.split('\n');
    return lines.map((line, i) => {
      let color = 'inherit';
      if (line.toLowerCase().includes('error') || line.toLowerCase().includes('fail')) color = '#ef4444';
      else if (line.toLowerCase().includes('warn')) color = '#f59e0b';
      else if (line.toLowerCase().includes('info')) color = '#60a5fa';

      if (searchQ && !line.toLowerCase().includes(searchQ.toLowerCase())) return null;

      return (
        <div key={i} style={{ color, whiteSpace: 'pre-wrap', marginBottom: 2, fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--text-muted)', marginRight: 10, userSelect: 'none', fontSize: '0.7rem' }}>{i + 1}</span>
          {line}
        </div>
      );
    });
  };

  return (
    <div className="modal-overlay" onClick={() => { setModal(null); setModalData(null); setSelectedRevisionValues(null); }}>
      <div className={`modal-content animate-scale-in ${modal.type === 'logs' || modal.type === 'terminal' || modal.type === 'files' || modal.type === 'pvc-files' ? 'modal-lg' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="modal-title">
              {modal.kind.charAt(0).toUpperCase() + modal.kind.slice(1).replace(/s$/, '')}: {modal.name}
            </div>
            <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
              {modal.namespace}
            </span>
          </div>
          <button className="btn btn-icon" onClick={() => { setModal(null); setModalData(null); setSelectedRevisionValues(null); }}><X size={18}/></button>
        </div>

        <div className="modal-tabs">
          {tabs.map(t => (
            <div 
              key={t} 
              className={`modal-tab ${modal.type === t ? 'active' : ''}`} 
              onClick={() => {
                if (modal.type !== t) {
                  setModal({ ...modal, type: t });
                }
              }}
            >
              {t === 'diagnose' && <Microscope size={14}/>}
              {t === 'yaml' && <FileText size={14}/>}
              {t === 'logs' && <Activity size={14}/>}
              {t === 'events' && <Radio size={14}/>}
              {t === 'files' && <FileText size={14}/>}
              {t === 'pvc-files' && <FolderOpen size={14}/>}
              {t === 'terminal' && <Terminal size={14}/>}
              {t === 'history' && <RefreshCw size={14}/>}
              {t === 'values' && <SlidersHorizontal size={14}/>}
              {t === 'decoded' && <Key size={14}/>}
              <span>
                {t === 'terminal' ? 'Console' : t === 'portforward' ? 'Port Forward' : t === 'events' && modal.kind === 'helm' ? 'Status' : t === 'values' ? 'Values' : t === 'decoded' ? 'Decoded Data' : t === 'pvc-files' ? 'Browse Volume' : t === 'diagnose' ? 'Diagnose' : t.charAt(0).toUpperCase() + t.slice(1)}
              </span>
            </div>
          ))}
        </div>

        <div className="modal-body">
          {modal.type === 'decoded' ? (
            modalData === null ? (
              <div className="loader-container"><div className="loader"></div></div>
            ) : (
              <SecretDecoderPanel secretJson={modalData} />
            )
          ) : modal.type === 'pvc-files' ? (
            <PvcExplorerView
              isModal={true}
              initialNamespace={modal.namespace}
              initialPvcName={modal.name}
            />
          ) : modal.type === 'files' ? (
            <PodFilesExplorer
              modal={modal}
              currentDirPath={currentDirPath}
              setCurrentDirPath={setCurrentDirPath}
              isListingFiles={isListingFiles}
              podFiles={podFiles}
              podFileUploadProgress={podFileUploadProgress}
              podFileUploadName={podFileUploadName}
              handleUploadPodFile={handleUploadPodFile}
              handleCreatePodFolder={handleCreatePodFolder}
              fetchPodFilesList={fetchPodFilesList}
              handleEditPodFile={handleEditPodFile}
              handleDownloadPodFile={handleDownloadPodFile}
              handleDeletePodFile={handleDeletePodFile}
            />
          ) : modal.type === 'terminal' ? (
             <div className="exec-terminal" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', height: '100%' }}>
               <div style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
                 <div style={{ fontSize: '0.85rem' }}>
                   # Live Interactive Shell inside container <strong>'{selectedContainer || getPodContainers()[0] || ''}'</strong>
                 </div>
                 {getPodContainers().length > 1 && (
                   <select
                     className="select-ns"
                     style={{ fontSize: '0.8rem', padding: '4px 8px', height: 'auto', background: 'var(--bg-main)' }}
                     value={selectedContainer}
                     onChange={e => setSelectedContainer(e.target.value)}
                   >
                     {getPodContainers().map(c => <option key={c} value={c}>{c}</option>)}
                   </select>
                 )}
               </div>
               <div style={{ flex: 1, minHeight: 400 }}>
                <InteractiveTerminal
                  namespace={modal.namespace}
                  podName={modal.name}
                  containerName={selectedContainer || getPodContainers()[0] || ''}
                />
               </div>
             </div>
          ) : modalData === null ? (
            <div className="loader-container"><div className="loader"></div></div>
          ) : modal.type === 'yaml' || (modal.type === 'values' && modal.kind === 'helm') ? (
            <div className="editor-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 0 10px 0', borderBottom: '1px solid #222', marginBottom: 10, gap: 8 }}>
                <button className="btn" onClick={copyToClipboard} title="Copy YAML to clipboard"><Copy size={14}/> Copy</button>
                <button className="btn" onClick={downloadYaml} title="Download Spec"><Save size={14}/> Download</button>
                {modal.kind !== 'helm' && (
                  <>
                    <button className={`btn ${!isEditingYaml ? 'btn-primary' : ''}`} onClick={() => setIsEditingYaml(false)}>Preview</button>
                    <button className={`btn ${isEditingYaml ? 'btn-primary' : ''}`} onClick={() => setIsEditingYaml(true)}>Edit</button>
                  </>
                )}
              </div>
              <div style={{ flex: 1, minHeight: 400, border: '1px solid var(--border-color)', borderRadius: 4, overflow: 'hidden' }}>
                <Editor
                  height="100%"
                  language="yaml"
                  theme="vs-dark"
                  value={yamlEdit}
                  onChange={(val) => setYamlEdit(val || '')}
                  options={{
                    readOnly: !isEditingYaml,
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: 'monospace',
                    automaticLayout: true,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    tabSize: 2,
                  }}
                />
              </div>
              {isEditingYaml && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <button className="btn btn-primary" onClick={saveYaml}><Save size={16}/> Save & Apply</button>
                </div>
              )}
              {modal.kind === 'helm' && modal.type === 'values' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                   <button className="btn btn-primary" onClick={handleHelmUpgradeFromModal} disabled={isSavingHelmValues}>
                    <Save size={16}/> {isSavingHelmValues ? 'Upgrading...' : 'Save & Upgrade'}
                  </button>
                </div>
              )}
            </div>
          ) : modal.type === 'logs' ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10 }}>
                <div className="search-box" style={{ flex: 1 }}>
                  <Search size={14} />
                  <input type="text" placeholder="Filter logs..." value={logSearch} onChange={e => setLogSearch(e.target.value)} />
                </div>
                {getPodContainers().length > 1 && (
                  <select
                    className="select-ns"
                    style={{ fontSize: '0.8rem', padding: '4px 8px', height: 'auto', background: 'var(--bg-main)' }}
                    value={selectedContainer}
                    onChange={e => setSelectedContainer(e.target.value)}
                  >
                    {getPodContainers().map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <button className={`btn ${isStreamingLogs ? 'btn-primary' : ''}`} onClick={() => setIsStreamingLogs(!isStreamingLogs)}>
                  {isStreamingLogs ? 'Stop Follow' : 'Follow'}
                </button>
                <button className="btn" onClick={scrollToBottomLogs}><ArrowDown size={14}/> Bottom</button>
                <button className="btn" onClick={downloadLogs}><Save size={14}/> Download</button>
                <button className="btn" onClick={() => fetchModalData('logs')}><RefreshCw size={14}/> Refresh</button>
              </div>
              <div className="terminal-container" style={{ flex: 1, overflowY: 'auto' }}>
                {colorizeLogs(modalData, logSearch)}
              </div>
            </div>
          ) : modal.type === 'events' ? (
             modal.kind === 'helm' ? (
               <pre className="editor-textarea" style={{ overflowY: 'auto', userSelect: 'text', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                 {typeof modalData === 'string' ? modalData : JSON.stringify(modalData, null, 2)}
               </pre>
             ) : (
               <div className="events-container">
                 {!Array.isArray(modalData) || modalData.length === 0 ? (
                   <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No events found for this resource.</div>
                 ) : (
                   modalData.map((ev: any, idx: number) => (
                     <div key={ev.metadata?.uid || idx} className="event-row" style={{ borderBottom: '1px solid var(--border-color)', padding: '10px 0' }}>
                       <div className="event-meta" style={{ display: 'flex', gap: 10, fontSize: '0.75rem', marginBottom: 4 }}>
                         <span className={`badge ${ev.type === 'Warning' ? 'badge-error' : 'badge-running'}`} style={{ textTransform: 'uppercase', fontSize: '0.65rem' }}>{ev.type}</span>
                         <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{ev.reason}</span>
                         <span style={{ color: 'var(--text-muted)' }}>{ev.lastTimestamp ? new Date(ev.lastTimestamp).toLocaleString() : 'Recently'}</span>
                       </div>
                       <div className="event-message" style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{ev.message}</div>
                     </div>
                   ))
                 )}
               </div>
             )
          ) : modal.type === 'history' ? (
             selectedRevisionValues ? (
               <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, overflow: 'hidden', height: '100%' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <button className="btn btn-sm" onClick={() => setSelectedRevisionValues(null)}>← Back to History</button>
                   <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Comparing Revision #{selectedRevisionValues.revision} with Deployed Values</span>
                 </div>
                 {renderDiffView()}
               </div>
             ) : (
               <div className="history-container" style={{ overflowY: 'auto', maxHeight: '400px', padding: 16 }}>
                 {!Array.isArray(modalData) || modalData.length === 0 ? (
                   <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No history found for this release.</div>
                 ) : (
                   <table className="crd-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                     <thead>
                       <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                         <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Revision</th>
                         <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Updated</th>
                         <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Status</th>
                         <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Chart</th>
                         <th style={{ padding: '8px 12px', color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
                       </tr>
                     </thead>
                     <tbody>
                       {modalData.map((rev: any) => (
                         <tr key={rev.revision} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                           <td style={{ padding: '8px 12px' }}>#{rev.revision}</td>
                           <td style={{ padding: '8px 12px', fontSize: '0.8rem' }}>{rev.updated}</td>
                           <td style={{ padding: '8px 12px' }}>
                             <span className={`badge ${rev.status === 'deployed' ? 'badge-running' : ''}`} style={{ fontSize: '0.7rem' }}>{rev.status}</span>
                           </td>
                           <td style={{ padding: '8px 12px', fontSize: '0.8rem' }}>{rev.chart}</td>
                           <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                             <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                               <button className="btn btn-sm" onClick={() => handleInspectRevisionValues(modal.namespace, modal.name, rev.revision)} disabled={isLoadingRevisionValues}>Diff</button>
                               <button className="btn btn-sm" onClick={() => handleRollback(modal.namespace, modal.name, rev.revision)}>Rollback</button>
                             </div>
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 )}
               </div>
             )
           ) : modal.type === 'diagnose' ? (
            modalData === null ? (
              <div className="loader-container"><div className="loader"></div></div>
            ) : modalData.error ? (
              <div style={{ color: 'var(--accent-error)', padding: 20 }}>{modalData.error}</div>
            ) : (
              <div className="diagnostics-panel" style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%', overflowY: 'auto', paddingRight: 10 }}>
                {/* Health Status Card */}
                <div 
                  style={{ 
                    padding: 16, 
                    borderRadius: 8, 
                    background: modalData.status === 'Healthy' ? 'rgba(16, 185, 129, 0.05)' : modalData.status === 'Warning' ? 'rgba(245, 158, 11, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                    border: modalData.status === 'Healthy' ? '1px solid rgba(16, 185, 129, 0.2)' : modalData.status === 'Warning' ? '1px solid rgba(245, 158, 11, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span 
                      style={{ 
                        fontSize: '1.2rem', 
                        color: modalData.status === 'Healthy' ? 'var(--accent-success)' : modalData.status === 'Warning' ? 'var(--accent-warning)' : 'var(--accent-error)' 
                      }}
                    >
                      {modalData.status === 'Healthy' ? '🩺' : modalData.status === 'Warning' ? '⚠️' : '🚨'}
                    </span>
                    <strong 
                      style={{ 
                        color: modalData.status === 'Healthy' ? 'var(--accent-success)' : modalData.status === 'Warning' ? 'var(--accent-warning)' : 'var(--accent-error)',
                        fontSize: '1.1rem' 
                      }}
                    >
                      Smart Doctor: {modalData.status}
                    </strong>
                  </div>
                  <div style={{ color: 'var(--text-main)', fontSize: '0.9rem', lineHeight: 1.4 }}>
                    {modalData.summary}
                  </div>
                </div>

                {/* Findings & Recommendations */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Findings & Recommendations
                  </div>
                  {modalData.details && modalData.details.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {modalData.details.map((detail: string, idx: number) => (
                        <div 
                          key={idx} 
                          style={{ 
                            padding: '10px 14px', 
                            background: 'rgba(255, 255, 255, 0.02)', 
                            borderLeft: '3px solid var(--accent-green)', 
                            borderRadius: '0 4px 4px 0',
                            fontSize: '0.85rem',
                            color: 'var(--text-main)',
                            lineHeight: 1.4
                          }}
                        >
                          {detail}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                      No active anomalies detected. The system configuration and container states look good.
                    </div>
                  )}
                </div>

                {/* Related Events */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Recent Related Events
                  </div>
                  {!modalData.events || modalData.events.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                      No events registered for this pod recently.
                    </div>
                  ) : (
                    <div style={{ background: 'rgba(255,255,255,0.01)', borderRadius: 6, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                      <table className="crd-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                            <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Type</th>
                            <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Reason</th>
                            <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Message</th>
                            <th style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {modalData.events.map((ev: any, idx: number) => (
                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                              <td style={{ padding: '8px 12px' }}>
                                <span className={`badge ${ev.type === 'Warning' ? 'badge-error' : 'badge-running'}`} style={{ textTransform: 'uppercase', fontSize: '0.65rem' }}>
                                  {ev.type}
                                </span>
                              </td>
                              <td style={{ padding: '8px 12px', fontWeight: 600 }}>{ev.reason}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{ev.message}</td>
                              <td style={{ padding: '8px 12px' }}>{ev.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Log Excerpt */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Troubleshooting Logs (Last 50 Lines)
                  </div>
                  <pre 
                    className="terminal-container" 
                    style={{ 
                      flex: 'none', 
                      maxHeight: '300px', 
                      overflowY: 'auto', 
                      background: 'rgba(0,0,0,0.3)', 
                      padding: 12, 
                      borderRadius: 6,
                      fontSize: '0.8rem',
                      fontFamily: 'var(--font-mono)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      color: '#60a5fa',
                      border: '1px solid rgba(255,255,255,0.05)'
                    }}
                  >
                    {modalData.logTail || 'No troubleshooting logs available.'}
                  </pre>
                </div>
              </div>
            )
           ) : null}
        </div>
      </div>
    </div>
  );
};
