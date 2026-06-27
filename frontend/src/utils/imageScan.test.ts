import { describe, it, expect } from 'vitest';
import {
  getFilteredVulnerabilities,
  getFilteredPackages,
  getRemediationList,
  getFilteredRemediations,
  type ScanFilters,
} from './imageScan';

const match = (id: string, severity: string, name: string, version: string, fixVersions: string[] = []) => ({
  vulnerability: { id, severity, fix: { versions: fixVersions } },
  artifact: { name, version },
});

const results: Record<string, any> = {
  'img-a:1': {
    status: 'success',
    vulnerabilities: {
      matches: [
        match('CVE-1', 'Critical', 'openssl', '1.0', ['1.1']),
        match('CVE-2', 'Low', 'curl', '7.0'),
      ],
    },
    sbom: { artifacts: [{ name: 'openssl', version: '1.0', type: 'deb', licenses: ['MIT'] }] },
  },
  'img-b:2': {
    status: 'success',
    vulnerabilities: {
      matches: [match('CVE-3', 'High', 'bash', '5.0', ['5.1'])],
    },
    sbom: { artifacts: [{ name: 'bash', version: '5.0', type: 'apk', licenses: [{ value: 'GPL' }] }] },
  },
  'img-c:3': {
    status: 'failed', // must be ignored everywhere
    vulnerabilities: { matches: [match('CVE-X', 'Critical', 'nope', '0')] },
    sbom: { artifacts: [{ name: 'nope', version: '0' }] },
  },
};

const filters = (over: Partial<ScanFilters> = {}): ScanFilters => ({ image: 'all', severity: 'all', search: '', ...over });

describe('getFilteredVulnerabilities', () => {
  it('returns matches from successful scans, tagged with their image', () => {
    const vulns = getFilteredVulnerabilities(results, filters());
    expect(vulns.map(v => v.vulnerability.id).sort()).toEqual(['CVE-1', 'CVE-2', 'CVE-3']);
    expect(vulns.find(v => v.vulnerability.id === 'CVE-1').imageRef).toBe('img-a:1');
  });

  it('excludes failed scans', () => {
    const ids = getFilteredVulnerabilities(results, filters()).map(v => v.vulnerability.id);
    expect(ids).not.toContain('CVE-X');
  });

  it('honors the image filter', () => {
    const vulns = getFilteredVulnerabilities(results, filters({ image: 'img-b:2' }));
    expect(vulns.map(v => v.vulnerability.id)).toEqual(['CVE-3']);
  });

  it('honors the severity filter', () => {
    const vulns = getFilteredVulnerabilities(results, filters({ severity: 'critical' }));
    expect(vulns.map(v => v.vulnerability.id)).toEqual(['CVE-1']);
  });

  it('honors the search query', () => {
    const vulns = getFilteredVulnerabilities(results, filters({ search: 'curl' }));
    expect(vulns.map(v => v.vulnerability.id)).toEqual(['CVE-2']);
  });
});

describe('getFilteredPackages', () => {
  it('returns SBOM artifacts from successful scans only', () => {
    const pkgs = getFilteredPackages(results, filters());
    expect(pkgs.map(p => p.name).sort()).toEqual(['bash', 'openssl']);
  });

  it('searches across name, type, and licenses (including object licenses)', () => {
    expect(getFilteredPackages(results, filters({ search: 'gpl' })).map(p => p.name)).toEqual(['bash']);
    expect(getFilteredPackages(results, filters({ search: 'deb' })).map(p => p.name)).toEqual(['openssl']);
  });
});

describe('getRemediationList', () => {
  it('includes only fixable vulnerabilities, sorted by highest severity first', () => {
    const list = getRemediationList(results, 'all');
    // openssl (Critical) before bash (High); curl has no fix and is excluded.
    expect(list.map(r => r.packageName)).toEqual(['openssl', 'bash']);
    expect(list.find(r => r.packageName === 'openssl')!.fixedVersions).toEqual(['1.1']);
  });

  it('filters by search query in getFilteredRemediations', () => {
    expect(getFilteredRemediations(results, filters({ search: 'bash' })).map(r => r.packageName)).toEqual(['bash']);
  });
});
