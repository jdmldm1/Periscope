// Security overview: image vulnerability counts (from the running-image scans)
// and the Kubescape cluster-compliance summary. Both cards link into their
// respective full views.
export const SecuritySection: React.FC<{
  scanResults: Record<string, any>;
  kubescapeReport: any;
  onNavigate: (tab: string) => void;
}> = ({ scanResults, kubescapeReport, onNavigate }) => {
  let criticalVulns = 0, highVulns = 0, mediumVulns = 0, lowVulns = 0;
  Object.values(scanResults).forEach((res: any) => {
    if (res.status === 'success' && res.vulnerabilities && res.vulnerabilities.matches) {
      res.vulnerabilities.matches.forEach((m: any) => {
        const sev = (m.vulnerability?.severity || '').toLowerCase();
        if (sev === 'critical') criticalVulns++;
        else if (sev === 'high') highVulns++;
        else if (sev === 'medium') mediumVulns++;
        else if (sev === 'low') lowVulns++;
      });
    }
  });

  const complianceScore = kubescapeReport?.frameworks?.[0]?.complianceScore ?? null;
  const summary = kubescapeReport?.summary || {};
  const failedControls = (summary.critical || 0) + (summary.high || 0) + (summary.medium || 0) + (summary.low || 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ fontSize: '1.1rem', margin: 0, letterSpacing: 0.5 }}>SECURITY COMPLIANCE & SCANS</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <div
          className="dashboard-chart-card"
          style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
          onClick={() => onNavigate('image-scanner')}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'none'}
        >
          <div className="dashboard-chart-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
            IMAGE VULNERABILITIES
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-blue)' }}>VIEW SCANNER →</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 10 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>{criticalVulns}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Critical</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f59e0b' }}>{highVulns}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>High</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fbbf24' }}>{mediumVulns}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Medium</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#60a5fa' }}>{lowVulns}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Low</div>
            </div>
          </div>
        </div>

        <div
          className="dashboard-chart-card"
          style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
          onClick={() => onNavigate('kubescape')}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'none'}
        >
          <div className="dashboard-chart-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
            CLUSTER COMPLIANCE
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-success)' }}>VIEW REPORT →</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <div>
              {complianceScore !== null ? (
                <>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: complianceScore > 80 ? 'var(--accent-green)' : complianceScore > 50 ? 'var(--accent-warning)' : 'var(--accent-error)' }}>
                    {complianceScore}%
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>NSA-CISA SCORE</div>
                </>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No Scan Data</div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: failedControls > 0 ? '#ef4444' : 'var(--text-muted)' }}>{failedControls}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Failed Controls</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
