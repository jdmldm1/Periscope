import React, { useState } from 'react';
import { Shield, RefreshCw, Search, Download } from 'lucide-react';
import { SbomDiffView } from './SbomDiffView';

interface ImageScannerViewProps {
  runningImages: string[];
  runningImagesScanResults: Record<string, { sbom: any; vulnerabilities: any; status: 'pending' | 'scanning' | 'success' | 'failed'; error?: string }>;
  isScanningAllRunningImages: boolean;
  scanSingleImage: (img: string) => Promise<void>;
  fetchRunningImagesAndScan: () => Promise<void>;
  enableAutoScan: boolean;
  handleToggleAutoScan: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
}

export const ImageScannerView: React.FC<ImageScannerViewProps> = ({
  runningImages,
  runningImagesScanResults,
  isScanningAllRunningImages,
  scanSingleImage,
  fetchRunningImagesAndScan,
  enableAutoScan,
  handleToggleAutoScan,
}) => {
  // Localized Filters
  const [selectedScanFilterImage, setSelectedScanFilterImage] = useState<string>('all');
  const [imageScannerActiveTab, setImageScannerActiveTab] = useState<'vulnerabilities' | 'packages' | 'remediation' | 'drift' | 'images'>('vulnerabilities');
  const [imageScanSearchQuery, setImageScanSearchQuery] = useState<string>('');
  const [imageScanSeverityFilter, setImageScanSeverityFilter] = useState<string>('all');

  interface RemediationItem {
    packageName: string;
    currentVersion: string;
    fixedVersions: string[];
    vulnerabilities: {
      id: string;
      severity: string;
    }[];
    imageRef: string;
  }

  const getHighestSeverity = (vulns: { id: string; severity: string }[]): number => {
    let maxVal = 0;
    vulns.forEach(v => {
      const s = v.severity.toLowerCase();
      let val = 1;
      if (s === 'critical') val = 5;
      else if (s === 'high') val = 4;
      else if (s === 'medium') val = 3;
      else if (s === 'low') val = 2;
      if (val > maxVal) maxVal = val;
    });
    return maxVal;
  };

  const getRemediationList = (): RemediationItem[] => {
    const map = new Map<string, RemediationItem>();

    Object.keys(runningImagesScanResults).forEach(imgRef => {
      if (selectedScanFilterImage !== 'all' && selectedScanFilterImage !== imgRef) return;
      const res = runningImagesScanResults[imgRef];
      if (res && res.status === 'success' && res.vulnerabilities && res.vulnerabilities.matches) {
        res.vulnerabilities.matches.forEach((m: any) => {
          const vuln = m.vulnerability || {};
          const art = m.artifact || {};
          const fixVersions = vuln.fix?.versions || [];

          if (fixVersions.length > 0) {
            const key = `${imgRef}::${art.name}::${art.version}`;
            if (!map.has(key)) {
              map.set(key, {
                packageName: art.name,
                currentVersion: art.version,
                fixedVersions: [...fixVersions],
                vulnerabilities: [],
                imageRef: imgRef
              });
            }
            const item = map.get(key)!;
            if (!item.vulnerabilities.some(v => v.id === vuln.id)) {
              item.vulnerabilities.push({
                id: vuln.id,
                severity: vuln.severity || 'Unknown'
              });
            }
            fixVersions.forEach((fv: string) => {
              if (!item.fixedVersions.includes(fv)) {
                item.fixedVersions.push(fv);
              }
            });
          }
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const aMax = getHighestSeverity(a.vulnerabilities);
      const bMax = getHighestSeverity(b.vulnerabilities);
      return bMax - aMax;
    });
  };

  const getFilteredRemediations = () => {
    const list = getRemediationList();
    return list.filter(item => {
      if (imageScanSearchQuery.trim()) {
        const q = imageScanSearchQuery.toLowerCase();
        return (
          item.packageName.toLowerCase().includes(q) ||
          item.currentVersion.toLowerCase().includes(q) ||
          item.vulnerabilities.some(v => v.id.toLowerCase().includes(q))
        );
      }
      return true;
    });
  };

  const getFilteredVulnerabilities = () => {
    const list: any[] = [];
    Object.keys(runningImagesScanResults).forEach(imgRef => {
      if (selectedScanFilterImage !== 'all' && selectedScanFilterImage !== imgRef) return;
      const res = runningImagesScanResults[imgRef];
      if (res && res.status === 'success' && res.vulnerabilities && res.vulnerabilities.matches) {
        res.vulnerabilities.matches.forEach((m: any) => {
          list.push({ ...m, imageRef: imgRef });
        });
      }
    });

    return list.filter((m: any) => {
      const vuln = m.vulnerability || {};
      const art = m.artifact || {};
      const severity = vuln.severity || 'Unknown';
      const imageRef = m.imageRef || '';

      if (imageScanSeverityFilter !== 'all' && severity.toLowerCase() !== imageScanSeverityFilter.toLowerCase()) {
        return false;
      }

      if (imageScanSearchQuery.trim()) {
        const q = imageScanSearchQuery.toLowerCase();
        return (
          (vuln.id || '').toLowerCase().includes(q) ||
          (severity || '').toLowerCase().includes(q) ||
          (art.name || '').toLowerCase().includes(q) ||
          (imageRef || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  };

  const getFilteredPackages = () => {
    const list: any[] = [];
    Object.keys(runningImagesScanResults).forEach(imgRef => {
      if (selectedScanFilterImage !== 'all' && selectedScanFilterImage !== imgRef) return;
      const res = runningImagesScanResults[imgRef];
      if (res && res.status === 'success' && res.sbom && res.sbom.artifacts) {
        res.sbom.artifacts.forEach((art: any) => {
          list.push({ ...art, imageRef: imgRef });
        });
      }
    });

    return list.filter((art: any) => {
      if (imageScanSearchQuery.trim()) {
        const q = imageScanSearchQuery.toLowerCase();
        const name = (art.name || '').toLowerCase();
        const ver = (art.version || '').toLowerCase();
        const type = (art.type || '').toLowerCase();
        const imageRef = (art.imageRef || '').toLowerCase();
        const licenses = Array.isArray(art.licenses)
          ? art.licenses.map((l: any) => typeof l === 'string' ? l : (l.value || '')).join(' ').toLowerCase()
          : '';
        return name.includes(q) || ver.includes(q) || type.includes(q) || licenses.includes(q) || imageRef.includes(q);
      }
      return true;
    });
  };

  const exportImageScannerVulnerabilitiesJson = () => {
    const data = getFilteredVulnerabilities();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `security-vulnerabilities-report-${selectedScanFilterImage.replace(/[:/]/g, '-')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const exportImageScannerVulnerabilitiesCsv = () => {
    const data = getFilteredVulnerabilities();
    const headers = ['Image', 'Vulnerability ID', 'Severity', 'Package', 'Installed Version', 'Fixed In'];
    const rows = data.map((m: any) => {
      const vuln = m.vulnerability || {};
      const art = m.artifact || {};
      const fixedIn = vuln.fix?.versions?.join(', ') || 'Not Fixed';
      return [
        `"${m.imageRef}"`,
        `"${vuln.id}"`,
        `"${vuln.severity}"`,
        `"${art.name}"`,
        `"${art.version}"`,
        `"${fixedIn}"`
      ];
    });
    const csvContent = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `security-vulnerabilities-report-${selectedScanFilterImage.replace(/[:/]/g, '-')}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const exportImageScannerPackagesJson = () => {
    const data = getFilteredPackages();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `security-packages-report-${selectedScanFilterImage.replace(/[:/]/g, '-')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const exportImageScannerPackagesCsv = () => {
    const data = getFilteredPackages();
    const headers = ['Image', 'Package Name', 'Version', 'Type', 'Licenses', 'Language'];
    const rows = data.map((art: any) => {
      const licenseStrs = Array.isArray(art.licenses)
        ? art.licenses.map((l: any) => typeof l === 'string' ? l : (l.value || ''))
        : [];
      return [
        `"${art.imageRef}"`,
        `"${art.name}"`,
        `"${art.version}"`,
        `"${art.type}"`,
        `"${licenseStrs.join(', ')}"`,
        `"${art.language || 'N/A'}"`
      ];
    });
    const csvContent = [headers.join(','), ...rows.map((r: any) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", url);
    downloadAnchor.setAttribute("download", `security-packages-report-${selectedScanFilterImage.replace(/[:/]/g, '-')}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const totalCount = runningImages.length;
  const scannedCount = Object.values(runningImagesScanResults).filter((r: any) => r.status === 'success').length;
  const scanningCount = Object.values(runningImagesScanResults).filter((r: any) => r.status === 'scanning').length;
  const failedCount = Object.values(runningImagesScanResults).filter((r: any) => r.status === 'failed').length;

  const filteredVulns = getFilteredVulnerabilities();
  const filteredPkgs = getFilteredPackages();

  const criticalCount = filteredVulns.filter((m: any) => (m.vulnerability?.severity || '').toLowerCase() === 'critical').length;
  const highCount = filteredVulns.filter((m: any) => (m.vulnerability?.severity || '').toLowerCase() === 'high').length;
  const mediumCount = filteredVulns.filter((m: any) => (m.vulnerability?.severity || '').toLowerCase() === 'medium').length;
  const lowCount = filteredVulns.filter((m: any) => (m.vulnerability?.severity || '').toLowerCase() === 'low').length;
  const negligibleCount = filteredVulns.filter((m: any) => (m.vulnerability?.severity || '').toLowerCase() === 'negligible').length;

  const renderTablePlaceholder = (tab: 'vulnerabilities' | 'packages') => {
    if (selectedScanFilterImage === 'all') {
      if (scannedCount === 0) {
        return (
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center' }}>
            <div style={{ color: 'var(--text-muted)', marginBottom: 16 }}>No container images have been scanned yet.</div>
            <button 
              className="btn btn-primary"
              onClick={fetchRunningImagesAndScan}
              disabled={isScanningAllRunningImages}
              style={{ margin: '0 auto' }}
            >
              <RefreshCw size={14} className={isScanningAllRunningImages ? 'spin' : ''} style={{ marginRight: 6 }} />
              {isScanningAllRunningImages ? 'Scanning All...' : 'Scan All Running Images'}
            </button>
          </div>
        );
      }
      return (
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          No {tab} found matching current filters.
        </div>
      );
    }

    const scan = runningImagesScanResults[selectedScanFilterImage];
    const cleanedImg = selectedScanFilterImage.replace(/^zarf-docker-registry\.zarf\.svc\.cluster\.local:5000\//, '').replace(/^127\.0\.0\.1:31999\//, '');

    if (!scan) {
      return (
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: 16 }}>
            Image <strong>{cleanedImg}</strong> has not been scanned yet.
          </div>
          <button 
            className="btn btn-primary"
            onClick={() => scanSingleImage(selectedScanFilterImage)}
            style={{ margin: '0 auto' }}
          >
            Scan Image
          </button>
        </div>
      );
    }

    if (scan.status === 'scanning') {
      return (
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div className="loader" style={{ margin: '0 auto 12px auto' }}></div>
          Scanning image <strong>{cleanedImg}</strong>...
        </div>
      );
    }

    if (scan.status === 'failed') {
      return (
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center' }}>
          <div style={{ color: '#ef4444', marginBottom: 8, fontWeight: 600 }}>Scan Failed</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16, maxWidth: '500px', margin: '0 auto 16px auto' }}>
            {scan.error || 'Unknown error occurred during scan.'}
          </div>
          <button 
            className="btn"
            onClick={() => scanSingleImage(selectedScanFilterImage)}
            style={{ margin: '0 auto', background: 'rgba(255,255,255,0.02)' }}
          >
            Retry Scan
          </button>
        </div>
      );
    }

    return (
      <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        No {tab} found for this container image.
      </div>
    );
  };

  return (
    <div className="image-scanner-view animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Control Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '16px 20px', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={18} style={{ color: 'var(--accent-blue)' }} /> Real-time Container Vulnerabilities
          </h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Images Scanned: <strong style={{ color: 'var(--text-main)' }}>{scannedCount}</strong> / {totalCount}
            {scanningCount > 0 && <span style={{ marginLeft: 10, color: 'var(--accent-cyan)' }}>({scanningCount} scanning...)</span>}
            {failedCount > 0 && <span style={{ marginLeft: 10, color: '#ef4444' }}>({failedCount} failed)</span>}
            <div style={{ width: '250px', height: '6px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '3px', marginTop: '6px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--accent-blue)', width: `${totalCount > 0 ? (scannedCount / totalCount) * 100 : 0}%`, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        </div>
        
        {/* Toggle switch for background auto scan */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
            <input 
              type="checkbox" 
              checked={enableAutoScan} 
              onChange={handleToggleAutoScan} 
              style={{ cursor: 'pointer', width: '15px', height: '15px' }}
            />
            <span>Auto-scan in background</span>
          </label>
          <button 
            className="btn btn-primary"
            onClick={fetchRunningImagesAndScan}
            disabled={isScanningAllRunningImages}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <RefreshCw size={16} className={isScanningAllRunningImages ? 'spin' : ''} />
            {isScanningAllRunningImages ? 'Scanning Cluster...' : 'Scan All Running Images'}
          </button>
        </div>
      </div>

      {/* Severity Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <div style={{ background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: 8, padding: '14px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444', lineHeight: 1.2 }}>{criticalCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>Critical</div>
        </div>
        <div style={{ background: 'rgba(245, 158, 11, 0.03)', border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: 8, padding: '14px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b', lineHeight: 1.2 }}>{highCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>High</div>
        </div>
        <div style={{ background: 'rgba(252, 211, 77, 0.03)', border: '1px solid rgba(252, 211, 77, 0.15)', borderRadius: 8, padding: '14px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fbbf24', lineHeight: 1.2 }}>{mediumCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>Medium</div>
        </div>
        <div style={{ background: 'rgba(96, 165, 250, 0.03)', border: '1px solid rgba(96, 165, 250, 0.15)', borderRadius: 8, padding: '14px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#60a5fa', lineHeight: 1.2 }}>{lowCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>Low</div>
        </div>
        <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 8, padding: '14px 16px', textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.2 }}>{negligibleCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, marginTop: 4 }}>Negligible</div>
        </div>
      </div>

      {/* Tab Selection */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: 16 }}>
        <button 
          className={`tab-btn ${imageScannerActiveTab === 'vulnerabilities' ? 'active' : ''}`}
          onClick={() => setImageScannerActiveTab('vulnerabilities')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: imageScannerActiveTab === 'vulnerabilities' ? '2px solid var(--accent-blue)' : '2px solid transparent',
            color: imageScannerActiveTab === 'vulnerabilities' ? 'var(--text-main)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem'
          }}
        >
          🛡️ Vulnerabilities ({filteredVulns.length})
        </button>
        <button 
          className={`tab-btn ${imageScannerActiveTab === 'packages' ? 'active' : ''}`}
          onClick={() => setImageScannerActiveTab('packages')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: imageScannerActiveTab === 'packages' ? '2px solid var(--accent-blue)' : '2px solid transparent',
            color: imageScannerActiveTab === 'packages' ? 'var(--text-main)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem'
          }}
        >
          📦 Packages ({filteredPkgs.length})
        </button>
        <button 
          className={`tab-btn ${imageScannerActiveTab === 'remediation' ? 'active' : ''}`}
          onClick={() => setImageScannerActiveTab('remediation')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: imageScannerActiveTab === 'remediation' ? '2px solid var(--accent-blue)' : '2px solid transparent',
            color: imageScannerActiveTab === 'remediation' ? 'var(--text-main)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem'
          }}
        >
          💡 Remediation Advisor ({getRemediationList().length})
        </button>
        <button 
          className={`tab-btn ${imageScannerActiveTab === 'drift' ? 'active' : ''}`}
          onClick={() => setImageScannerActiveTab('drift')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: imageScannerActiveTab === 'drift' ? '2px solid var(--accent-blue)' : '2px solid transparent',
            color: imageScannerActiveTab === 'drift' ? 'var(--text-main)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem'
          }}
        >
          🔄 SBOM Drift & Diff
        </button>
        <button 
          className={`tab-btn ${imageScannerActiveTab === 'images' ? 'active' : ''}`}
          onClick={() => setImageScannerActiveTab('images')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: imageScannerActiveTab === 'images' ? '2px solid var(--accent-blue)' : '2px solid transparent',
            color: imageScannerActiveTab === 'images' ? 'var(--text-main)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.9rem'
          }}
        >
          📷 Scanned Images ({totalCount})
        </button>
      </div>

      {/* Filter and Control Actions Bar (for data tabs) */}
      {imageScannerActiveTab !== 'images' && imageScannerActiveTab !== 'drift' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.1)', borderRadius: 6, padding: 12, flexWrap: 'wrap', gap: 10 }}>
          {/* Left filters */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-box" style={{ width: 220, position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder={
                  imageScannerActiveTab === 'vulnerabilities' 
                    ? "Search CVEs/packages..." 
                    : imageScannerActiveTab === 'remediation' 
                      ? "Search suggestions..." 
                      : "Search packages..."
                }
                value={imageScanSearchQuery}
                onChange={e => setImageScanSearchQuery(e.target.value)}
                style={{ padding: '6px 10px 6px 30px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, width: '100%', outline: 'none', color: 'var(--text-main)' }}
              />
            </div>

            {/* Image Filter */}
            <select
              value={selectedScanFilterImage}
              onChange={e => setSelectedScanFilterImage(e.target.value)}
              style={{ padding: '6px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)', fontSize: '0.85rem', outline: 'none' }}
            >
              <option value="all">All Images ({totalCount})</option>
              {runningImages.map(img => {
                const cleaned = img.replace(/^zarf-docker-registry\.zarf\.svc\.cluster\.local:5000\//, '').replace(/^127\.0\.0\.1:31999\//, '');
                return <option key={img} value={img}>{cleaned}</option>;
              })}
            </select>

            {/* Severity Filter (only for vulnerabilities tab) */}
            {imageScannerActiveTab === 'vulnerabilities' && (
              <select
                value={imageScanSeverityFilter}
                onChange={e => setImageScanSeverityFilter(e.target.value)}
                style={{ padding: '6px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: 4, color: 'var(--text-main)', fontSize: '0.85rem', outline: 'none' }}
              >
                <option value="all">All Severities</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
                <option value="Negligible">Negligible</option>
              </select>
            )}
          </div>

          {/* Right exports (only for vulnerabilities or packages) */}
          {(imageScannerActiveTab === 'vulnerabilities' || imageScannerActiveTab === 'packages') && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                className="btn btn-primary" 
                onClick={imageScannerActiveTab === 'vulnerabilities' ? exportImageScannerVulnerabilitiesCsv : exportImageScannerPackagesCsv}
                style={{ fontSize: '0.8rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Download size={14} /> Export CSV
              </button>
              <button 
                className="btn" 
                onClick={imageScannerActiveTab === 'vulnerabilities' ? exportImageScannerVulnerabilitiesJson : exportImageScannerPackagesJson}
                style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Download size={14} /> Export JSON
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab Contents Rendering */}
      {imageScannerActiveTab === 'vulnerabilities' && (
        filteredVulns.length === 0 ? (
          renderTablePlaceholder('vulnerabilities')
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 14px' }}>Source Image</th>
                  <th style={{ padding: '10px 14px' }}>Vulnerability</th>
                  <th style={{ padding: '10px 14px' }}>Severity</th>
                  <th style={{ padding: '10px 14px' }}>Package</th>
                  <th style={{ padding: '10px 14px' }}>Installed Version</th>
                  <th style={{ padding: '10px 14px' }}>Fixed In</th>
                </tr>
              </thead>
              <tbody>
                {filteredVulns.map((m: any, idx: number) => {
                  const vuln = m.vulnerability || {};
                  const art = m.artifact || {};
                  const severity = vuln.severity || 'Unknown';
                  const badgeColor = 
                    severity === 'Critical' ? '#ef4444' :
                    severity === 'High' ? '#f59e0b' :
                    severity === 'Medium' ? '#fbbf24' :
                    severity === 'Low' ? '#60a5fa' : 'var(--text-muted)';
                  
                  const badgeBg = 
                    severity === 'Critical' ? 'rgba(239, 68, 68, 0.08)' :
                    severity === 'High' ? 'rgba(245, 158, 11, 0.08)' :
                    severity === 'Medium' ? 'rgba(251, 191, 36, 0.08)' :
                    severity === 'Low' ? 'rgba(96, 165, 250, 0.08)' : 'rgba(255, 255, 255, 0.03)';
                  
                  const fixedIn = vuln.fix?.versions?.join(', ') || 'Not Fixed';
                  const cleanedImg = m.imageRef.replace(/^zarf-docker-registry\.zarf\.svc\.cluster\.local:5000\//, '').replace(/^127\.0\.0\.1:31999\//, '');

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.imageRef}>
                        {cleanedImg}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <a 
                          href={`https://nvd.nist.gov/vuln/detail/${vuln.id}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}
                        >
                          {vuln.id}
                        </a>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ 
                          fontSize: '0.7rem', 
                          fontWeight: 700, 
                          color: badgeColor, 
                          background: badgeBg, 
                          border: `1px solid ${badgeColor}22`,
                          borderRadius: 4,
                          padding: '2px 8px'
                        }}>
                          {severity}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600 }}>{art.name}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)' }}>{art.version}</td>
                      <td style={{ padding: '10px 14px', color: fixedIn === 'Not Fixed' ? 'var(--text-muted)' : '#10b981' }}>{fixedIn}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {imageScannerActiveTab === 'packages' && (
        filteredPkgs.length === 0 ? (
          renderTablePlaceholder('packages')
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 14px' }}>Source Image</th>
                  <th style={{ padding: '10px 14px' }}>Package Name</th>
                  <th style={{ padding: '10px 14px' }}>Version</th>
                  <th style={{ padding: '10px 14px' }}>Type</th>
                  <th style={{ padding: '10px 14px' }}>Licenses</th>
                  <th style={{ padding: '10px 14px' }}>Language</th>
                </tr>
              </thead>
              <tbody>
                {filteredPkgs.map((art: any, idx: number) => {
                  const licenseStrs = Array.isArray(art.licenses)
                    ? art.licenses.map((l: any) => typeof l === 'string' ? l : (l.value || ''))
                    : [];
                  const cleanedImg = art.imageRef.replace(/^zarf-docker-registry\.zarf\.svc\.cluster\.local:5000\//, '').replace(/^127\.0\.0\.1:31999\//, '');

                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={art.imageRef}>
                        {cleanedImg}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-main)' }}>{art.name}</td>
                      <td style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)' }}>{art.version}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <span className="badge badge-running" style={{ textTransform: 'none', padding: '2px 6px', background: 'rgba(255,255,255,0.03)' }}>
                          {art.type}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#ffd700' }}>
                        {licenseStrs.length > 0 ? licenseStrs.join(', ') : <span style={{ color: 'var(--text-muted)' }}>None</span>}
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{art.language || 'N/A'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {imageScannerActiveTab === 'remediation' && (
        getFilteredRemediations().length === 0 ? (
          <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            No remediation suggestions found matching current filters.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'rgba(57,255,20,0.03)', border: '1px solid rgba(57,255,20,0.15)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.2rem' }}>💡</span>
              <div>
                <strong>Offline CVE Remediation Advisor:</strong> Below are package upgrade recommendations extracted from the vulnerability database that will resolve detected CVEs.
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {getFilteredRemediations().map((item, idx) => {
                const maxSeverity = item.vulnerabilities.reduce((acc, v) => {
                  const s = v.severity.toLowerCase();
                  if (s === 'critical') return 'Critical';
                  if (s === 'high' && acc !== 'Critical') return 'High';
                  if (acc !== 'Critical' && acc !== 'High' && s === 'medium') return 'Medium';
                  return acc;
                }, 'Low');

                const severityColor = 
                  maxSeverity === 'Critical' ? '#ef4444' :
                  maxSeverity === 'High' ? '#f59e0b' :
                  maxSeverity === 'Medium' ? '#fbbf24' : '#60a5fa';

                const cleanedImg = item.imageRef.replace(/^zarf-docker-registry\.zarf\.svc\.cluster\.local:5000\//, '').replace(/^127\.0\.0\.1:31999\//, '');

                return (
                  <div 
                    key={idx} 
                    style={{ 
                      background: 'var(--bg-card)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: 8, 
                      padding: 16, 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: 12,
                      boxShadow: 'var(--shadow-card)',
                      transition: 'transform 0.2s, border-color 0.2s',
                      cursor: 'default'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = severityColor;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.transform = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ maxWidth: '75%' }}>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.packageName}
                        </h4>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.imageRef}>
                          in {cleanedImg}
                        </div>
                      </div>
                      <span style={{ 
                        fontSize: '0.65rem', 
                        fontWeight: 700, 
                        color: severityColor, 
                        background: `${severityColor}15`, 
                        border: `1px solid ${severityColor}33`,
                        borderRadius: 4,
                        padding: '2px 6px'
                      }}>
                        {maxSeverity} Max
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.15)', borderRadius: 6, padding: '8px 12px', fontSize: '0.8rem' }}>
                      <div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>CURRENT VERSION</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{item.currentVersion}</div>
                      </div>
                      <span style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>→</span>
                      <div>
                        <div style={{ color: '#10b981', fontSize: '0.7rem', fontWeight: 600 }}>UPGRADE TO</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#10b981' }}>{item.fixedVersions.join(', ')}</div>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>
                        Resolves {item.vulnerabilities.length} Vulnerabilit{item.vulnerabilities.length === 1 ? 'y' : 'ies'}:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: '80px', overflowY: 'auto' }}>
                        {item.vulnerabilities.map(v => (
                          <a 
                            key={v.id}
                            href={`https://nvd.nist.gov/vuln/detail/${v.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ 
                              fontSize: '0.7rem', 
                              color: 'var(--accent-cyan)', 
                              background: 'rgba(0,188,212,0.08)', 
                              border: '1px solid rgba(0,188,212,0.2)',
                              padding: '2px 6px',
                              borderRadius: 4,
                              textDecoration: 'none',
                              fontWeight: 500
                            }}
                          >
                            {v.id} ({v.severity[0]})
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {imageScannerActiveTab === 'drift' && (
        <SbomDiffView 
          runningImages={runningImages}
          runningImagesScanResults={runningImagesScanResults}
        />
      )}

      {imageScannerActiveTab === 'images' && (
        <div style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 16px' }}>Container Image Reference</th>
                <th style={{ padding: '12px 16px' }}>Scan Status</th>
                <th style={{ padding: '12px 16px' }}>Vulnerability Counts (C/H/M/L)</th>
                <th style={{ padding: '12px 16px' }}>Packages</th>
                <th style={{ padding: '12px 16px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {runningImages.map((img: string, idx: number) => {
                const scan = runningImagesScanResults[img];
                const cleanedName = img.replace(/^zarf-docker-registry\.zarf\.svc\.cluster\.local:5000\//, '').replace(/^127\.0\.0\.1:31999\//, '');
                
                let cCount = 0, hCount = 0, mCount = 0, lCount = 0;
                if (scan && scan.status === 'success' && scan.vulnerabilities && scan.vulnerabilities.matches) {
                  scan.vulnerabilities.matches.forEach((m: any) => {
                    const sev = (m.vulnerability?.severity || '').toLowerCase();
                    if (sev === 'critical') cCount++;
                    else if (sev === 'high') hCount++;
                    else if (sev === 'medium') mCount++;
                    else if (sev === 'low') lCount++;
                  });
                }

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontWeight: 600 }} title={img}>
                      {cleanedName}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {!scan ? (
                        <span style={{ color: 'var(--text-muted)' }}>Not Scanned</span>
                      ) : scan.status === 'scanning' ? (
                        <span style={{ color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <RefreshCw size={12} className="spin" /> Scanning...
                        </span>
                      ) : scan.status === 'success' ? (
                        <span style={{ color: '#10b981' }}>✓ Success</span>
                      ) : (
                        <span style={{ color: '#ef4444' }} title={scan.error || 'Unknown error'}>✗ Failed</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {scan && scan.status === 'success' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <span style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{cCount}</span>
                          <span style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{hCount}</span>
                          <span style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{mCount}</span>
                          <span style={{ background: 'rgba(96,165,250,0.1)', color: '#60a5fa', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{lCount}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {scan && scan.status === 'success' ? (
                        <span>{scan.sbom?.artifacts?.length || 0} packages</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <button
                        className="btn"
                        style={{ padding: '4px 8px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.02)' }}
                        onClick={() => scanSingleImage(img)}
                        disabled={scan?.status === 'scanning'}
                      >
                        {scan?.status === 'scanning' ? 'Scanning...' : scan ? 'Rescan' : 'Scan'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
