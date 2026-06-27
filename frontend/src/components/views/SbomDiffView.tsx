import React, { useState } from 'react';
import { ArrowRight, Plus, Minus, AlertTriangle, CheckCircle, Search } from 'lucide-react';

interface SbomDiffViewProps {
  runningImages: string[];
  runningImagesScanResults: Record<string, { sbom: any; vulnerabilities: any; status: 'pending' | 'scanning' | 'success' | 'failed' | 'notScanned'; error?: string }>;
}

interface PackageDiff {
  name: string;
  type: string;
  status: 'added' | 'removed' | 'changed';
  versionA?: string;
  versionB?: string;
}

interface VulnDiff {
  id: string;
  severity: string;
  packageName: string;
  status: 'new' | 'resolved';
}

export const SbomDiffView: React.FC<SbomDiffViewProps> = ({
  runningImages,
  runningImagesScanResults,
}) => {
  // Select which images to compare
  const successfulImages = runningImages.filter(
    (img) => runningImagesScanResults[img]?.status === 'success'
  );

  const [imageA, setImageA] = useState<string>(successfulImages[0] || '');
  const [imageB, setImageB] = useState<string>(successfulImages[1] || successfulImages[0] || '');
  const [diffSearchQuery, setDiffSearchQuery] = useState<string>('');
  const [diffFilterType, setDiffFilterType] = useState<'all' | 'added' | 'removed' | 'changed' | 'cves'>('all');

  const scanA = runningImagesScanResults[imageA];
  const scanB = runningImagesScanResults[imageB];

  // Helper to get packages as map name -> version
  const getPackagesMap = (scan: any) => {
    const map = new Map<string, { version: string; type: string }>();
    if (scan?.sbom?.artifacts) {
      scan.sbom.artifacts.forEach((art: any) => {
        if (art.name) {
          map.set(art.name, {
            version: art.version || '',
            type: art.type || 'unknown',
          });
        }
      });
    }
    return map;
  };

  // Helper to get CVEs as map ID -> info
  const getVulnsMap = (scan: any) => {
    const map = new Map<string, { severity: string; packageName: string }>();
    if (scan?.vulnerabilities?.matches) {
      scan.vulnerabilities.matches.forEach((m: any) => {
        const id = m.vulnerability?.id;
        if (id) {
          map.set(id, {
            severity: m.vulnerability?.severity || 'Unknown',
            packageName: m.artifact?.name || 'unknown',
          });
        }
      });
    }
    return map;
  };

  // Perform diff computation
  const pkgsA = getPackagesMap(scanA);
  const pkgsB = getPackagesMap(scanB);
  const vulnsA = getVulnsMap(scanA);
  const vulnsB = getVulnsMap(scanB);

  const packageDiffs: PackageDiff[] = [];
  const vulnDiffs: VulnDiff[] = [];

  // 1. Compute Package Diff
  // Added or Changed (in B, but not in A or different version)
  pkgsB.forEach((infoB, name) => {
    const infoA = pkgsA.get(name);
    if (!infoA) {
      packageDiffs.push({
        name,
        type: infoB.type,
        status: 'added',
        versionB: infoB.version,
      });
    } else if (infoA.version !== infoB.version) {
      packageDiffs.push({
        name,
        type: infoB.type,
        status: 'changed',
        versionA: infoA.version,
        versionB: infoB.version,
      });
    }
  });

  // Removed (in A, but not in B)
  pkgsA.forEach((infoA, name) => {
    if (!pkgsB.has(name)) {
      packageDiffs.push({
        name,
        type: infoA.type,
        status: 'removed',
        versionA: infoA.version,
      });
    }
  });

  // 2. Compute Vuln Diff
  // New CVEs (in B, but not in A)
  vulnsB.forEach((infoB, id) => {
    if (!vulnsA.has(id)) {
      vulnDiffs.push({
        id,
        severity: infoB.severity,
        packageName: infoB.packageName,
        status: 'new',
      });
    }
  });

  // Resolved CVEs (in A, but not in B)
  vulnsA.forEach((infoA, id) => {
    if (!vulnsB.has(id)) {
      vulnDiffs.push({
        id,
        severity: infoA.severity,
        packageName: infoA.packageName,
        status: 'resolved',
      });
    }
  });

  // Filter package and vuln diffs based on search and tab selections
  const filteredPackages = packageDiffs.filter((p) => {
    if (diffFilterType !== 'all' && diffFilterType !== 'cves' && p.status !== diffFilterType) {
      return false;
    }
    if (diffSearchQuery.trim()) {
      const q = diffSearchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.versionA || '').toLowerCase().includes(q) ||
        (p.versionB || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredVulns = vulnDiffs.filter((v) => {
    if (diffFilterType !== 'all' && diffFilterType !== 'cves') {
      return false;
    }
    if (diffSearchQuery.trim()) {
      const q = diffSearchQuery.toLowerCase();
      return (
        v.id.toLowerCase().includes(q) ||
        v.packageName.toLowerCase().includes(q) ||
        v.severity.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const addedCount = packageDiffs.filter((p) => p.status === 'added').length;
  const removedCount = packageDiffs.filter((p) => p.status === 'removed').length;
  const changedCount = packageDiffs.filter((p) => p.status === 'changed').length;
  const newCvesCount = vulnDiffs.filter((v) => v.status === 'new').length;
  const resolvedCvesCount = vulnDiffs.filter((v) => v.status === 'resolved').length;

  const cleanedA = imageA.replace(/^zarf-docker-registry\.zarf\.svc\.cluster\.local:5000\//, '').replace(/^127\.0\.0\.1:31999\//, '');
  const cleanedB = imageB.replace(/^zarf-docker-registry\.zarf\.svc\.cluster\.local:5000\//, '').replace(/^127\.0\.0\.1:31999\//, '');

  if (successfulImages.length < 1) {
    return (
      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        No successful image scans available to compare. Scan at least one container image first.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Selector Row */}
      <div 
        style={{ 
          background: 'var(--bg-card)', 
          border: '1px solid var(--border-color)', 
          borderRadius: 8, 
          padding: '16px 20px', 
          display: 'flex', 
          flexDirection: 'column',
          gap: 16 
        }}
      >
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 10 }}>
          Comparing base image <strong style={{ color: 'var(--accent-blue)' }}>{cleanedA || 'N/A'}</strong> with target image <strong style={{ color: 'var(--accent-blue)' }}>{cleanedB || 'N/A'}</strong>
        </div>
        
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            flexWrap: 'wrap', 
            gap: 16,
            width: '100%'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 280 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>IMAGE A (BASE)</span>
            <select
              value={imageA}
              onChange={(e) => setImageA(e.target.value)}
              className="select-ns"
              style={{ width: '100%', padding: '6px 12px' }}
            >
              {successfulImages.map((img) => (
                <option key={img} value={img}>
                  {img.replace(/^zarf-docker-registry\.zarf\.svc\.cluster\.local:5000\//, '').replace(/^127\.0\.0\.1:31999\//, '')}
                </option>
              ))}
            </select>
          </div>

          <ArrowRight size={20} style={{ color: 'var(--text-muted)', marginTop: 18 }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>IMAGE B (TARGET)</span>
            <select
              value={imageB}
              onChange={(e) => setImageB(e.target.value)}
              className="select-ns"
              style={{ width: '100%', padding: '6px 12px' }}
            >
              {successfulImages.map((img) => (
                <option key={img} value={img}>
                  {img.replace(/^zarf-docker-registry\.zarf\.svc\.cluster\.local:5000\//, '').replace(/^127\.0\.0\.1:31999\//, '')}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', borderLeft: '1px solid var(--border-color)', paddingLeft: 20, minWidth: '160px' }}>
          <div>Packages A: <strong>{scanA?.sbom?.artifacts?.length || 0}</strong></div>
          <div>Packages B: <strong>{scanB?.sbom?.artifacts?.length || 0}</strong></div>
          <div style={{ marginTop: 4 }}>CVEs A: <strong>{scanA?.vulnerabilities?.matches?.length || 0}</strong></div>
          <div>CVEs B: <strong>{scanB?.vulnerabilities?.matches?.length || 0}</strong></div>
        </div>
      </div>
    </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <div style={{ background: 'rgba(16, 185, 129, 0.03)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-success)' }}>+{addedCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Packages Added</div>
        </div>
        <div style={{ background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-error)' }}>-{removedCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Packages Removed</div>
        </div>
        <div style={{ background: 'rgba(96, 165, 250, 0.03)', border: '1px solid rgba(96, 165, 250, 0.15)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-blue)' }}>{changedCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Packages Upgraded</div>
        </div>
        <div style={{ background: 'rgba(245, 158, 11, 0.03)', border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-warning)' }}>{newCvesCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>New CVEs</div>
        </div>
        <div style={{ background: 'rgba(16, 185, 129, 0.03)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-success)' }}>{resolvedCvesCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>Resolved CVEs</div>
        </div>
      </div>

      {/* Filter Options */}
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          background: 'rgba(0,0,0,0.1)', 
          borderRadius: 6, 
          padding: 12, 
          flexWrap: 'wrap', 
          gap: 12 
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="search-box" style={{ width: 220, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search diff results..."
              value={diffSearchQuery}
              onChange={(e) => setDiffSearchQuery(e.target.value)}
              style={{ 
                padding: '6px 10px 6px 30px', 
                background: 'var(--bg-main)', 
                border: '1px solid var(--border-color)', 
                borderRadius: 4, 
                width: '100%', 
                color: 'var(--text-main)',
                fontSize: '0.85rem' 
              }}
            />
          </div>

          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', borderRadius: 4, padding: 2 }}>
            {(['all', 'added', 'removed', 'changed', 'cves'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setDiffFilterType(t)}
                style={{
                  padding: '4px 10px',
                  background: diffFilterType === t ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: 'none',
                  color: diffFilterType === t ? '#fff' : 'var(--text-muted)',
                  fontWeight: diffFilterType === t ? 600 : 400,
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  textTransform: 'capitalize',
                }}
              >
                {t === 'cves' ? 'CVE Changes' : t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Showing <strong>{filteredPackages.length + (diffFilterType === 'all' || diffFilterType === 'cves' ? filteredVulns.length : 0)}</strong> delta entries
        </div>
      </div>

      {/* Main Differences Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Vulnerability Deltas (CVEs) */}
        {(diffFilterType === 'all' || diffFilterType === 'cves') && filteredVulns.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-main)', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              🛡️ Vulnerability Delta ({filteredVulns.length})
            </h4>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.15)' }}>
                    <th style={{ padding: '10px 14px' }}>Vulnerability ID</th>
                    <th style={{ padding: '10px 14px' }}>Package</th>
                    <th style={{ padding: '10px 14px' }}>Severity</th>
                    <th style={{ padding: '10px 14px' }}>Delta Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVulns.map((v, idx) => {
                    const isNew = v.status === 'new';
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <a 
                            href={`https://osv.dev/vulnerability/${v.id}`} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}
                          >
                            {v.id}
                          </a>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 500 }}>{v.packageName}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ 
                            fontSize: '0.7rem', 
                            fontWeight: 700, 
                            color: v.severity === 'Critical' ? '#ef4444' : v.severity === 'High' ? '#f59e0b' : '#60a5fa', 
                            background: v.severity === 'Critical' ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)', 
                            borderRadius: 4,
                            padding: '2px 6px'
                          }}>
                            {v.severity}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {isNew ? (
                            <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                              <AlertTriangle size={14} /> Introduced in target image
                            </span>
                          ) : (
                            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                              <CheckCircle size={14} /> Resolved in target image
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Package Deltas */}
        {diffFilterType !== 'cves' && filteredPackages.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-main)', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              📦 Package Dependency Deltas ({filteredPackages.length})
            </h4>
            <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.15)' }}>
                    <th style={{ padding: '10px 14px' }}>Package Name</th>
                    <th style={{ padding: '10px 14px' }}>Type</th>
                    <th style={{ padding: '10px 14px' }}>Base Version (A)</th>
                    <th style={{ padding: '10px 14px' }}>Target Version (B)</th>
                    <th style={{ padding: '10px 14px' }}>Delta Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPackages.map((p, idx) => {
                    const isAdded = p.status === 'added';
                    const isRemoved = p.status === 'removed';
                    
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>{p.name}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.03)', padding: '2px 6px', borderRadius: 4 }}>
                            {p.type}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          {p.versionA || '-'}
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)' }}>
                          {p.versionB || '-'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {isAdded ? (
                            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                              <Plus size={14} /> Added
                            </span>
                          ) : isRemoved ? (
                            <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                              <Minus size={14} /> Removed
                            </span>
                          ) : (
                            <span style={{ color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                              <ArrowRight size={14} /> Changed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty States */}
        {filteredPackages.length === 0 && filteredVulns.length === 0 && (
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            No differences found matching your current search/filter.
          </div>
        )}
      </div>
    </div>
  );
};
