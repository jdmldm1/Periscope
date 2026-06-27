// Pure derivation and export helpers for the Image Scanner view. These turn the
// raw Grype/Syft scan results plus the active filters into the rows the UI
// renders, and into downloadable JSON/CSV reports. Kept out of the component so
// the view is just presentation and these can be reasoned about (and tested) on
// their own.

export interface ScanFilters {
  image: string;     // 'all' or a specific image ref
  severity: string;  // 'all' or a severity name
  search: string;
}

export interface RemediationItem {
  packageName: string;
  currentVersion: string;
  fixedVersions: string[];
  vulnerabilities: { id: string; severity: string }[];
  imageRef: string;
}

type ScanResults = Record<string, any>;

const SEVERITY_RANK: Record<string, number> = { critical: 5, high: 4, medium: 3, low: 2 };

function highestSeverity(vulns: { severity: string }[]): number {
  return vulns.reduce((max, v) => Math.max(max, SEVERITY_RANK[v.severity.toLowerCase()] ?? 1), 0);
}

// Iterate every successfully-scanned image (respecting the image filter),
// invoking `fn` with the image ref and its result.
function forEachScannedImage(results: ScanResults, imageFilter: string, fn: (imgRef: string, res: any) => void) {
  Object.keys(results).forEach(imgRef => {
    if (imageFilter !== 'all' && imageFilter !== imgRef) return;
    const res = results[imgRef];
    if (res && res.status === 'success') fn(imgRef, res);
  });
}

// Group fixable vulnerabilities by package, most-severe package first.
export function getRemediationList(results: ScanResults, imageFilter: string): RemediationItem[] {
  const map = new Map<string, RemediationItem>();

  forEachScannedImage(results, imageFilter, (imgRef, res) => {
    if (!res.vulnerabilities?.matches) return;
    res.vulnerabilities.matches.forEach((m: any) => {
      const vuln = m.vulnerability || {};
      const art = m.artifact || {};
      const fixVersions = vuln.fix?.versions || [];
      if (fixVersions.length === 0) return;

      const key = `${imgRef}::${art.name}::${art.version}`;
      if (!map.has(key)) {
        map.set(key, {
          packageName: art.name,
          currentVersion: art.version,
          fixedVersions: [...fixVersions],
          vulnerabilities: [],
          imageRef: imgRef,
        });
      }
      const item = map.get(key)!;
      if (!item.vulnerabilities.some(v => v.id === vuln.id)) {
        item.vulnerabilities.push({ id: vuln.id, severity: vuln.severity || 'Unknown' });
      }
      fixVersions.forEach((fv: string) => {
        if (!item.fixedVersions.includes(fv)) item.fixedVersions.push(fv);
      });
    });
  });

  return Array.from(map.values()).sort((a, b) => highestSeverity(b.vulnerabilities) - highestSeverity(a.vulnerabilities));
}

export function getFilteredRemediations(results: ScanResults, filters: ScanFilters): RemediationItem[] {
  const q = filters.search.trim().toLowerCase();
  const list = getRemediationList(results, filters.image);
  if (!q) return list;
  return list.filter(item =>
    item.packageName.toLowerCase().includes(q) ||
    item.currentVersion.toLowerCase().includes(q) ||
    item.vulnerabilities.some(v => v.id.toLowerCase().includes(q))
  );
}

export function getFilteredVulnerabilities(results: ScanResults, filters: ScanFilters): any[] {
  const list: any[] = [];
  forEachScannedImage(results, filters.image, (imgRef, res) => {
    if (!res.vulnerabilities?.matches) return;
    res.vulnerabilities.matches.forEach((m: any) => list.push({ ...m, imageRef: imgRef }));
  });

  const q = filters.search.trim().toLowerCase();
  return list.filter((m: any) => {
    const vuln = m.vulnerability || {};
    const art = m.artifact || {};
    const severity = vuln.severity || 'Unknown';
    const imageRef = m.imageRef || '';

    if (filters.severity !== 'all' && severity.toLowerCase() !== filters.severity.toLowerCase()) {
      return false;
    }
    if (!q) return true;
    return (
      (vuln.id || '').toLowerCase().includes(q) ||
      severity.toLowerCase().includes(q) ||
      (art.name || '').toLowerCase().includes(q) ||
      imageRef.toLowerCase().includes(q)
    );
  });
}

export function getFilteredPackages(results: ScanResults, filters: ScanFilters): any[] {
  const list: any[] = [];
  forEachScannedImage(results, filters.image, (imgRef, res) => {
    if (!res.sbom?.artifacts) return;
    res.sbom.artifacts.forEach((art: any) => list.push({ ...art, imageRef: imgRef }));
  });

  const q = filters.search.trim().toLowerCase();
  if (!q) return list;
  return list.filter((art: any) => {
    const licenses = Array.isArray(art.licenses)
      ? art.licenses.map((l: any) => (typeof l === 'string' ? l : l.value || '')).join(' ').toLowerCase()
      : '';
    return (
      (art.name || '').toLowerCase().includes(q) ||
      (art.version || '').toLowerCase().includes(q) ||
      (art.type || '').toLowerCase().includes(q) ||
      licenses.includes(q) ||
      (art.imageRef || '').toLowerCase().includes(q)
    );
  });
}

// --- Report exports -------------------------------------------------------

function triggerDownload(href: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.setAttribute('href', href);
  anchor.setAttribute('download', filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function reportName(prefix: string, imageFilter: string, ext: string): string {
  return `${prefix}-${imageFilter.replace(/[:/]/g, '-')}.${ext}`;
}

function downloadJson(data: unknown, filename: string) {
  const href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
  triggerDownload(href, filename);
}

function downloadCsv(headers: string[], rows: string[][], filename: string) {
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  triggerDownload(url, filename);
}

// Matches the original report formatting (a missing field renders literally,
// e.g. "undefined"), just centralized so the quoting lives in one place.
const csvCell = (val: unknown) => `"${val}"`;

export function exportVulnerabilitiesJson(results: ScanResults, filters: ScanFilters) {
  downloadJson(getFilteredVulnerabilities(results, filters), reportName('security-vulnerabilities-report', filters.image, 'json'));
}

export function exportVulnerabilitiesCsv(results: ScanResults, filters: ScanFilters) {
  const headers = ['Image', 'Vulnerability ID', 'Severity', 'Package', 'Installed Version', 'Fixed In'];
  const rows = getFilteredVulnerabilities(results, filters).map((m: any) => {
    const vuln = m.vulnerability || {};
    const art = m.artifact || {};
    return [m.imageRef, vuln.id, vuln.severity, art.name, art.version, vuln.fix?.versions?.join(', ') || 'Not Fixed'].map(csvCell);
  });
  downloadCsv(headers, rows, reportName('security-vulnerabilities-report', filters.image, 'csv'));
}

export function exportPackagesJson(results: ScanResults, filters: ScanFilters) {
  downloadJson(getFilteredPackages(results, filters), reportName('security-packages-report', filters.image, 'json'));
}

export function exportPackagesCsv(results: ScanResults, filters: ScanFilters) {
  const headers = ['Image', 'Package Name', 'Version', 'Type', 'Licenses', 'Language'];
  const rows = getFilteredPackages(results, filters).map((art: any) => {
    const licenses = Array.isArray(art.licenses)
      ? art.licenses.map((l: any) => (typeof l === 'string' ? l : l.value || '')).join(', ')
      : '';
    return [art.imageRef, art.name, art.version, art.type, licenses, art.language || 'N/A'].map(csvCell);
  });
  downloadCsv(headers, rows, reportName('security-packages-report', filters.image, 'csv'));
}
