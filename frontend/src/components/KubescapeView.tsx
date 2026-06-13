import React from 'react';
import { Shield, RefreshCw, Search } from 'lucide-react';

interface KubescapeViewProps {
  kubescapeReport: any;
  isScanningKubescape: boolean;
  triggerKubescapeScan: () => Promise<void>;
  kubescapeSearchQuery: string;
  setKubescapeSearchQuery: (query: string) => void;
  kubescapeSeverityFilter: string;
  setKubescapeSeverityFilter: (severity: string) => void;
  expandedControlId: string | null;
  setExpandedControlId: (id: string | null) => void;
}

export const KubescapeView: React.FC<KubescapeViewProps> = ({
  kubescapeReport,
  isScanningKubescape,
  triggerKubescapeScan,
  kubescapeSearchQuery,
  setKubescapeSearchQuery,
  kubescapeSeverityFilter,
  setKubescapeSeverityFilter,
  expandedControlId,
  setExpandedControlId,
}) => {
  const report = kubescapeReport;
  const isScanning = isScanningKubescape;

  const filteredControls = report ? report.failedControls.filter((c: any) => {
    const matchesSeverity = kubescapeSeverityFilter === 'all' || c.severity.toLowerCase() === kubescapeSeverityFilter.toLowerCase();
    const matchesSearch = !kubescapeSearchQuery || 
      c.name.toLowerCase().includes(kubescapeSearchQuery.toLowerCase()) || 
      c.id.toLowerCase().includes(kubescapeSearchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(kubescapeSearchQuery.toLowerCase());
    return matchesSeverity && matchesSearch;
  }) : [];

  return (
    <div className="kubescape-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '16px 20px', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={18} style={{ color: 'var(--accent-success)' }} /> Security Compliance Scan (Kubescape)
          </h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Scan cluster configurations against NSA-CISA, MITRE ATT&CK, and CIS Benchmarks.
          </div>
        </div>
        <button 
          className="btn btn-primary"
          onClick={triggerKubescapeScan}
          disabled={isScanning}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--accent-success)', color: '#000' }}
        >
          <RefreshCw size={16} className={isScanning ? 'spin' : ''} />
          {isScanning ? 'Scanning Cluster Compliance...' : 'Run Compliance Scan'}
        </button>
      </div>

      {isScanning && (
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="loader" style={{ margin: '0 auto 16px auto', width: 32, height: 32 }}></div>
          <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: 8 }}>Compliance scan in progress...</div>
          <div style={{ fontSize: '0.85rem' }}>Downloading local catalog definitions, compiling rules, and scanning RBAC & resource manifests. This may take up to 20 seconds.</div>
        </div>
      )}

      {!isScanning && !report && (
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 16 }}>No compliance report available. Click "Run Compliance Scan" to begin.</div>
          <button className="btn btn-primary" onClick={triggerKubescapeScan} style={{ margin: '0 auto', background: 'var(--accent-success)', color: '#000' }}>
            Run Compliance Scan
          </button>
        </div>
      )}

      {!isScanning && report && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {report.frameworks.map((fw: any) => {
              const score = fw.complianceScore;
              const scoreColor = score > 80 ? '#10b981' : score > 60 ? '#f59e0b' : '#ef4444';
              return (
                <div key={fw.name} style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>{fw.name} Compliance</h4>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fff' }}>{score}%</div>
                  </div>
                  <svg width="60" height="60" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#222"
                      strokeWidth="3.5"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke={scoreColor}
                      strokeWidth="3.5"
                      strokeDasharray={`${score}, 100`}
                      strokeLinecap="round"
                      style={{ transition: 'stroke-dasharray 0.8s ease' }}
                    />
                  </svg>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div style={{ background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444', lineHeight: 1.2 }}>{report.summary?.critical || 0}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>Critical Controls Failed</div>
            </div>
            <div style={{ background: 'rgba(245, 158, 11, 0.03)', border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b', lineHeight: 1.2 }}>{report.summary?.high || 0}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>High Controls Failed</div>
            </div>
            <div style={{ background: 'rgba(252, 211, 77, 0.03)', border: '1px solid rgba(252, 211, 77, 0.15)', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fbbf24', lineHeight: 1.2 }}>{report.summary?.medium || 0}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>Medium Controls Failed</div>
            </div>
            <div style={{ background: 'rgba(96, 165, 250, 0.03)', border: '1px solid rgba(96, 165, 250, 0.15)', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#60a5fa', lineHeight: 1.2 }}>{report.summary?.low || 0}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>Low Controls Failed</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.1)', borderRadius: 6, padding: 12, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="search-box" style={{ width: 250, position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  placeholder="Search controls, IDs, descriptions..."
                  value={kubescapeSearchQuery}
                  onChange={e => setKubescapeSearchQuery(e.target.value)}
                  style={{ padding: '6px 10px 6px 30px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, width: '100%', outline: 'none', color: 'var(--text-main)' }}
                />
              </div>

              <select
                value={kubescapeSeverityFilter}
                onChange={e => setKubescapeSeverityFilter(e.target.value)}
                style={{ padding: '6px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)', fontSize: '0.85rem', outline: 'none' }}
              >
                <option value="all">All Severities</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Showing <strong>{filteredControls.length}</strong> of {report.failedControls?.length || 0} failed checks
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredControls.length === 0 ? (
              <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                No failed compliance controls match current filters.
              </div>
            ) : (
              filteredControls.map((c: any) => {
                const isExpanded = expandedControlId === c.id;
                const sevColor = 
                  c.severity === 'Critical' ? '#ef4444' :
                  c.severity === 'High' ? '#f59e0b' :
                  c.severity === 'Medium' ? '#fbbf24' : '#60a5fa';
                
                return (
                  <div 
                    key={c.id} 
                    style={{ 
                      background: 'var(--bg-card)', 
                      border: `1px solid ${isExpanded ? sevColor : 'var(--border-color)'}`, 
                      borderRadius: 8, 
                      overflow: 'hidden',
                      transition: 'border-color 0.2s'
                    }}
                  >
                    <div 
                      onClick={() => setExpandedControlId(isExpanded ? null : c.id)}
                      style={{ 
                        padding: '14px 20px', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        cursor: 'pointer',
                        background: isExpanded ? 'rgba(255,255,255,0.02)' : 'none',
                        userSelect: 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{c.id}</span>
                        <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{c.name}</span>
                        <span 
                          style={{ 
                            fontSize: '0.7rem', 
                            fontWeight: 700, 
                            color: sevColor, 
                            background: `${sevColor}12`, 
                            border: `1px solid ${sevColor}22`,
                            borderRadius: 4, 
                            padding: '2px 8px' 
                          }}
                        >
                          {c.severity}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: '0.8rem', color: '#ef4444', background: 'rgba(239,68,68,0.08)', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>
                          {c.resources?.length || 0} violations
                        </span>
                        <span style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-muted)', fontSize: '0.8rem' }}>▼</span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '20px', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: 16, background: 'rgba(0,0,0,0.1)' }}>
                        <div>
                          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.5px', marginBottom: 4 }}>Control Description</div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.5 }}>{c.description}</div>
                        </div>

                        <div style={{ background: 'rgba(16, 185, 129, 0.03)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: 6, padding: '12px 16px' }}>
                          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#10b981', fontWeight: 600, letterSpacing: '0.5px', marginBottom: 4 }}>Remediation Recommendation</div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.5, fontFamily: 'var(--font-sans)' }}>{c.remediation}</div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.5px', marginBottom: 8 }}>Violating Cluster Resources</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 6, padding: 10 }}>
                            {c.resources && c.resources.length > 0 ? (
                              c.resources.map((res: string, rIdx: number) => (
                                <div key={rIdx} style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                                  {res}
                                </div>
                              ))
                            ) : (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No specific violating resources returned in this namespace. Check global cluster permissions.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
};
