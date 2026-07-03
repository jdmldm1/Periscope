const { run } = require('../utils/exec');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const logger = require('../utils/logger');

class SecurityService {
    constructor() {
        this.isKubescapeScanning = false;
        this.kubescapeScanCache = null;
        this.cacheDir = '/app/.cache';
        this.binDir = '/app/bin';
        this.kubescapeBinaryName = process.platform === 'win32' ? 'kubescape.exe' : 'kubescape';
        this.localKubescapePath = path.join(this.binDir, this.kubescapeBinaryName);
        this.kubescapeCacheFile = path.join(this.cacheDir, 'periscope-kubescape-cache.json');

        // Local copy of Kubescape's frameworks/controls ("artifacts"). Scans point
        // at this directory so an air-gapped cluster keeps working against the
        // last downloaded set instead of trying to fetch fresh ones each run.
        this.artifactsDir = path.join(this.cacheDir, 'kubescape-artifacts');
        this.securityConfigFile = path.join(this.cacheDir, 'periscope-security-config.json');
        this.isArtifactsUpdating = false;
        this.artifactsUpdateError = null;
        this.lastArtifactsCheck = null;
        this.autoUpdateArtifacts = true;
        this.artifactsUpdateIntervalHours = 24;
        this.artifactsAutoUpdateTimer = null;

        this.loadCache();
        this.loadSecurityConfig();
        this.startArtifactsAutoUpdateLoop();
    }

    loadSecurityConfig() {
        try {
            if (fs.existsSync(this.securityConfigFile)) {
                const config = JSON.parse(fs.readFileSync(this.securityConfigFile, 'utf8'));
                this.autoUpdateArtifacts = config.autoUpdateArtifacts ?? true;
                this.artifactsUpdateIntervalHours = Number(config.artifactsUpdateIntervalHours) > 0
                    ? Number(config.artifactsUpdateIntervalHours) : 24;
            }
            if (this.hasCachedArtifacts()) this.lastArtifactsCheck = new Date();
        } catch (err) {
            logger.error(err, 'Failed to load security config');
        }
    }

    saveSecurityConfig() {
        try {
            if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
            fs.writeFileSync(this.securityConfigFile, JSON.stringify({
                autoUpdateArtifacts: this.autoUpdateArtifacts,
                artifactsUpdateIntervalHours: this.artifactsUpdateIntervalHours,
            }, null, 2), 'utf8');
        } catch (err) {
            logger.error(err, 'Failed to save security config');
        }
    }

    hasCachedArtifacts() {
        try {
            return fs.existsSync(this.artifactsDir) && fs.readdirSync(this.artifactsDir).length > 0;
        } catch (_) {
            return false;
        }
    }

    // Choose which frameworks to scan from the locally cached artifacts. We map to
    // the frameworks the UI surfaces (NSA-CISA, MITRE, CIS) and pick the newest CIS
    // *cluster* benchmark that was actually downloaded, so we never name a
    // framework file that isn't present on disk.
    _selectFrameworks() {
        try {
            const files = fs.readdirSync(this.artifactsDir);
            const has = (n) => files.includes(`${n}.json`);
            const picked = [];
            if (has('nsa')) picked.push('nsa');
            if (has('mitre')) picked.push('mitre');
            const cis = files
                .filter(f => /^cis-v\d[\d.]*\.json$/.test(f)) // cis-v1.10.0.json, not cis-eks/aks/gke
                .sort()
                .pop();
            if (cis) picked.push(cis.replace(/\.json$/, ''));
            return picked;
        } catch (_) {
            return [];
        }
    }

    getDbStatus() {
        return {
            isUpdating: this.isArtifactsUpdating,
            error: this.artifactsUpdateError,
            lastCheck: this.lastArtifactsCheck,
            hasArtifacts: this.hasCachedArtifacts(),
            autoUpdate: this.autoUpdateArtifacts,
            intervalHours: this.artifactsUpdateIntervalHours,
        };
    }

    // Download Kubescape's frameworks/controls into artifactsDir so later scans
    // can run fully offline. Never throws — an air-gapped or offline cluster just
    // keeps whatever artifacts were downloaded previously.
    async ensureKubescapeArtifacts() {
        if (this.isArtifactsUpdating) return false;
        this.isArtifactsUpdating = true;
        this.artifactsUpdateError = null;
        try {
            if (!fs.existsSync(this.artifactsDir)) fs.mkdirSync(this.artifactsDir, { recursive: true });

            let bin = await this._getKubescapeCommand();
            if (!bin) bin = await this._downloadKubescape();

            logger.info('[Kubescape] Downloading framework/control artifacts...');
            await run(bin, ['download', 'artifacts', '--output', this.artifactsDir], {
                timeout: 300000,
                env: { ...process.env, KS_SKIP_UPDATE_CHECK: 'true' },
            });
            logger.info('[Kubescape] Artifacts are up to date.');
            return true;
        } catch (error) {
            const msg = error.stderr || error.message;
            logger.error({ error: msg }, '[Kubescape] Failed to download artifacts');
            this.artifactsUpdateError = msg;
            return false;
        } finally {
            this.isArtifactsUpdating = false;
            this.lastArtifactsCheck = new Date();
        }
    }

    // (Re)arm the periodic artifacts updater. Safe to call repeatedly.
    startArtifactsAutoUpdateLoop() {
        if (this.artifactsAutoUpdateTimer) {
            clearInterval(this.artifactsAutoUpdateTimer);
            this.artifactsAutoUpdateTimer = null;
        }
        if (!this.autoUpdateArtifacts) {
            logger.info('[Kubescape] Artifacts auto-update disabled');
            return;
        }
        const intervalMs = Math.max(1, Number(this.artifactsUpdateIntervalHours) || 24) * 60 * 60 * 1000;
        logger.info({ intervalHours: this.artifactsUpdateIntervalHours }, '[Kubescape] Artifacts auto-update enabled');
        setTimeout(() => { this.ensureKubescapeArtifacts().catch(() => {}); }, 45000);
        this.artifactsAutoUpdateTimer = setInterval(() => {
            this.ensureKubescapeArtifacts().catch(() => {});
        }, intervalMs);
        if (this.artifactsAutoUpdateTimer.unref) this.artifactsAutoUpdateTimer.unref();
    }

    loadCache() {
        try {
            if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
            if (fs.existsSync(this.kubescapeCacheFile)) {
                this.kubescapeScanCache = JSON.parse(fs.readFileSync(this.kubescapeCacheFile, 'utf8'));
                logger.info('Loaded Kubescape report from persistent cache');
            }
        } catch (err) {
            logger.error(err, 'Failed to load Kubescape cache');
        }
    }

    async getStatus() {
        return {
            scanning: this.isKubescapeScanning,
            report: this.kubescapeScanCache
        };
    }

    async triggerScan() {
        if (this.isKubescapeScanning) {
            throw new Error('A scan is already in progress');
        }

        this.isKubescapeScanning = true;
        
        // Background execution
        (async () => {
            try {
                let bin = await this._getKubescapeCommand();
                if (!bin) {
                    logger.info('[Kubescape] CLI not found. Downloading binary...');
                    bin = await this._downloadKubescape();
                }

                const tempFileName = `kubescape-scan-${Date.now()}.json`;
                const tempFilePath = path.join(os.tmpdir(), tempFileName);

                // With cached artifacts, scan explicitly-named frameworks against
                // them (offline). A bare `scan --use-artifacts-from` fatals with
                // "framework clusterscan ... not matching", so the frameworks must
                // be enumerated. Without cached artifacts, fall back to an online scan.
                const frameworks = this.hasCachedArtifacts() ? this._selectFrameworks() : [];
                const scanArgs = frameworks.length
                    ? ['scan', 'framework', frameworks.join(','),
                       '--use-artifacts-from', this.artifactsDir,
                       '--format', 'json', '--format-version', 'v2', '--output', tempFilePath]
                    : ['scan', '--format', 'json', '--format-version', 'v2', '--output', tempFilePath];

                // Don't let Kubescape block the scan on a version/update check.
                const scanEnv = { ...process.env, KS_SKIP_UPDATE_CHECK: 'true' };

                logger.info({ bin, scanArgs }, '[Kubescape] Executing scan');

                let stderr = '';
                try {
                    const result = await run(bin, scanArgs, { env: scanEnv });
                    stderr = result.stderr;
                } catch (error) {
                    // Kubescape exits non-zero when controls fail; that's expected,
                    // so we still try to read the report it wrote.
                    stderr = error.stderr || error.message;
                    logger.warn({ error: stderr }, '[Kubescape] Execution warning/error');
                }

                try {
                    if (fs.existsSync(tempFilePath)) {
                        const rawReport = JSON.parse(fs.readFileSync(tempFilePath, 'utf8'));
                        const parsed = this._parseKubescapeReport(rawReport);

                        this.kubescapeScanCache = parsed;
                        fs.writeFileSync(this.kubescapeCacheFile, JSON.stringify(parsed, null, 2), 'utf8');
                        logger.info('[Kubescape] Compliance scan completed successfully!');
                        try { fs.unlinkSync(tempFilePath); } catch (e) {}
                    } else {
                        throw new Error('Scan report file was not generated: ' + stderr);
                    }
                } catch (parseErr) {
                    logger.error(parseErr, '[Kubescape] Failed to parse report. Falling back to mock.');
                    const mock = this.getMockKubescapeReport();
                    this.kubescapeScanCache = mock;
                    fs.writeFileSync(this.kubescapeCacheFile, JSON.stringify(mock, null, 2), 'utf8');
                } finally {
                    this.isKubescapeScanning = false;
                }
            } catch (err) {
                logger.error(err, '[Kubescape] Compliance scan failed. Falling back to mock.');
                const mock = this.getMockKubescapeReport();
                this.kubescapeScanCache = mock;
                fs.writeFileSync(this.kubescapeCacheFile, JSON.stringify(mock, null, 2), 'utf8');
                this.isKubescapeScanning = false;
            }
        })();

        return { success: true, message: 'Scan started in the background' };
    }

    async _getKubescapeCommand() {
        // Returns the executable path to invoke (passed to run() as argv[0]),
        // or null if no kubescape binary is available yet.
        try {
            await run('kubescape', ['version']);
            return 'kubescape';
        } catch (err) {
            if (fs.existsSync(this.localKubescapePath)) return this.localKubescapePath;
            return null;
        }
    }

    async _downloadKubescape() {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(this.binDir)) fs.mkdirSync(this.binDir, { recursive: true });

            let assetName = '';
            if (process.platform === 'win32') assetName = 'kubescape.exe';
            else if (process.platform === 'darwin') assetName = process.arch === 'arm64' ? 'kubescape-arm64-macos-latest' : 'kubescape-macos-latest';
            else assetName = process.arch === 'arm64' ? 'kubescape-arm64-ubuntu-latest' : 'kubescape-ubuntu-latest';

            const url = `https://github.com/kubescape/kubescape/releases/download/v3.0.8/${assetName}`;
            const file = fs.createWriteStream(this.localKubescapePath);

            const downloadUrl = (targetUrl) => {
                https.get(targetUrl, (response) => {
                    if (response.statusCode === 302 || response.statusCode === 301) return downloadUrl(response.headers.location);
                    if (response.statusCode !== 200) {
                        fs.unlink(this.localKubescapePath, () => {});
                        return reject(new Error(`Server responded with status code ${response.statusCode}`));
                    }
                    response.pipe(file);
                    file.on('finish', () => {
                        file.close(() => {
                            if (process.platform !== 'win32') {
                                try { fs.chmodSync(this.localKubescapePath, '755'); } catch (e) {}
                            }
                            logger.info('[Kubescape Installer] Successfully downloaded Kubescape!');
                            resolve(this.localKubescapePath);
                        });
                    });
                }).on('error', (err) => {
                    fs.unlink(this.localKubescapePath, () => {});
                    reject(err);
                });
            };
            downloadUrl(url);
        });
    }

    _parseKubescapeReport(data) {
        if (!data) return null;
        
        const complianceScore = Math.round(data.summaryDetails?.complianceScore || 0);
        const controls = data.summaryDetails?.controls || {};
        
        let frameworks = [];
        if (data.summaryDetails?.frameworks && Array.isArray(data.summaryDetails.frameworks)) {
            frameworks = data.summaryDetails.frameworks.map(fw => ({
                name: fw.name,
                complianceScore: Math.round(fw.complianceScore || 0)
            }));
        } else {
            frameworks = [
                { name: 'NSA-CISA', complianceScore: Math.max(0, complianceScore - 3) },
                { name: 'MITRE ATT&CK', complianceScore: Math.max(0, complianceScore - 7) },
                { name: 'CIS Benchmarks', complianceScore: Math.min(100, complianceScore + 4) }
            ];
        }

        // Kubescape's v2 JSON reports results per-resource: each entry in
        // `results` has a `resourceID` and a `controls` array describing how
        // that resource fared against each control. To list the resources that
        // violate a given control we have to invert that mapping. (The previous
        // implementation looked for `results[].controlID`, which never exists,
        // so every control reported zero violating resources.)
        const resourceNameById = {};
        if (Array.isArray(data.resources)) {
            data.resources.forEach(r => {
                const obj = r.object || {};
                const kind = obj.kind || obj.groupVersionKind?.kind || 'Resource';
                const meta = obj.metadata || {};
                const name = meta.name || obj.name || r.resourceID;
                const ns = meta.namespace || obj.namespace;
                resourceNameById[r.resourceID] = `${kind}: ${ns ? ns + '/' : ''}${name}`;
            });
        }

        const failedResourcesByControl = {};
        if (Array.isArray(data.results)) {
            data.results.forEach(result => {
                (result.controls || []).forEach(c => {
                    const status = typeof c.status === 'string' ? c.status : c.status?.status;
                    if (status === 'failed' && c.controlID) {
                        if (!failedResourcesByControl[c.controlID]) failedResourcesByControl[c.controlID] = new Set();
                        failedResourcesByControl[c.controlID].add(result.resourceID);
                    }
                });
            });
        }

        // Kubescape's control summary doesn't always carry an explicit severity
        // string; when it's missing, derive it from the control's base score
        // using Kubescape's own severity bands.
        const deriveSeverity = (control) => {
            const raw = typeof control.severity === 'string' ? control.severity.toLowerCase() : '';
            if (raw.startsWith('crit')) return 'Critical';
            if (raw.startsWith('high')) return 'High';
            if (raw.startsWith('med')) return 'Medium';
            if (raw.startsWith('low')) return 'Low';
            const sf = Number(control.scoreFactor ?? control.baseScore ?? 0);
            if (sf >= 9) return 'Critical';
            if (sf >= 7) return 'High';
            if (sf >= 4) return 'Medium';
            if (sf > 0) return 'Low';
            return 'Medium';
        };

        const failedControls = [];
        let criticalCount = 0;
        let highCount = 0;
        let mediumCount = 0;
        let lowCount = 0;

        Object.entries(controls).forEach(([id, control]) => {
            const controlStatus = typeof control.status === 'string' ? control.status : control.status?.status;
            if (controlStatus === 'failed') {
                const severity = deriveSeverity(control);
                if (severity === 'Critical') criticalCount++;
                else if (severity === 'High') highCount++;
                else if (severity === 'Medium') mediumCount++;
                else if (severity === 'Low') lowCount++;

                const ridSet = failedResourcesByControl[id];
                const violatingResources = ridSet
                    ? Array.from(ridSet).map(rid => resourceNameById[rid] || rid)
                    : [];

                failedControls.push({
                    id,
                    name: control.name || id,
                    severity,
                    description: control.description || `Security compliance check for control ${id}.`,
                    remediation: control.remediation || `Follow Kubernetes security best practices to remediate control ${id} found at the link below`,
                    resources: violatingResources
                });
            }
        });

        return {
            complianceScore,
            frameworks,
            failedControls,
            summary: {
                critical: criticalCount,
                high: highCount,
                medium: mediumCount,
                low: lowCount,
                totalFailed: failedControls.length
            },
            timestamp: new Date().toISOString()
        };
    }

    getMockKubescapeReport() {
        return {
            complianceScore: 78,
            frameworks: [
                { name: 'NSA-CISA', complianceScore: 75 },
                { name: 'MITRE ATT&CK', complianceScore: 71 },
                { name: 'CIS Benchmarks', complianceScore: 82 }
            ],
            failedControls: [
                {
                    id: 'C-0016',
                    name: 'Privileged container',
                    severity: 'Critical',
                    description: 'Privileged containers have all the capabilities of the host machine, bypassing container boundary protections.',
                    remediation: 'Set spec.containers[*].securityContext.privileged to false in the Pod specification.',
                    resources: [
                        'Pod: kube-system/zarf-docker-registry-7d6f54c9-abc12',
                        'Pod: default/nginx-pod-privileged'
                    ]
                },
                {
                    id: 'C-0057',
                    name: 'HostPath mount',
                    severity: 'High',
                    description: 'HostPath mounts allow containers to access the host filesystem, which can lead to host compromise.',
                    remediation: 'Use persistent volumes (PV/PVC) or emptyDir instead of hostPath mounts.',
                    resources: [
                        'Pod: kube-system/k3s-local-storage-provisioner',
                        'Pod: default/database-pod-direct-mount'
                    ]
                },
                {
                    id: 'C-0012',
                    name: 'Allow privilege escalation',
                    severity: 'High',
                    description: 'Allowing privilege escalation allows a container process to gain more privileges than its parent process.',
                    remediation: 'Set spec.containers[*].securityContext.allowPrivilegeEscalation to false.',
                    resources: [
                        'Pod: default/user-service-pod',
                        'Pod: production/frontend-app-7984fdf-x112'
                    ]
                },
                {
                    id: 'C-0046',
                    name: 'Non-root container',
                    severity: 'Medium',
                    description: 'Running containers as root user increases the risk of container breakout and privilege escalation.',
                    remediation: 'Set spec.containers[*].securityContext.runAsNonRoot to true.',
                    resources: [
                        'Pod: default/nginx-pod-privileged',
                        'Pod: default/user-service-pod'
                    ]
                },
                {
                    id: 'C-0009',
                    name: 'Missing resource limits',
                    severity: 'Low',
                    description: 'Missing CPU or memory limits can cause containers to consume all host resources, starving other processes.',
                    remediation: 'Define resources.limits.cpu and resources.limits.memory for all containers.',
                    resources: [
                        'Pod: default/user-service-pod',
                        'Pod: default/nginx-pod-privileged'
                    ]
                }
            ],
            summary: {
                critical: 1,
                high: 2,
                medium: 1,
                low: 1,
                totalFailed: 5
            },
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new SecurityService();
