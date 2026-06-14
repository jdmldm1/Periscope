const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const zarfService = require('./zarfService');

class ScannerService {
    constructor() {
        this.isGrypeDbUpdating = false;
        this.grypeDbUpdateError = null;
        this.lastGrypeDbCheck = null;
        this.sbomScanCache = new Map();
        this.vulnsScanCache = new Map();
        this.cacheDir = '/app/.cache';
        this.enableAutoScan = true;
        this.currentlyScanningImage = null;
        this.isBackgroundScanning = false;
        this.currentlyScanning = new Set();
        
        this.initializeCache();
        this.loadScannerConfig();
        
        // Start background scanner
        setTimeout(() => this.backgroundScanLoop(), 10000);
    }

    initializeCache() {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
            
            const sbomFile = path.join(this.cacheDir, 'periscope-sbom-cache.json');
            if (fs.existsSync(sbomFile)) {
                const data = JSON.parse(fs.readFileSync(sbomFile, 'utf8'));
                Object.entries(data).forEach(([k, v]) => this.sbomScanCache.set(k, v));
                logger.info({ count: this.sbomScanCache.size }, 'Loaded SBOM scans from persistent cache');
            }

            const vulnsFile = path.join(this.cacheDir, 'periscope-vulns-cache.json');
            if (fs.existsSync(vulnsFile)) {
                const data = JSON.parse(fs.readFileSync(vulnsFile, 'utf8'));
                Object.entries(data).forEach(([k, v]) => this.vulnsScanCache.set(k, v));
                logger.info({ count: this.vulnsScanCache.size }, 'Loaded vulnerability scans from persistent cache');
            }

            if (fs.existsSync(path.join(this.cacheDir, 'grype'))) {
                this.lastGrypeDbCheck = new Date();
            }
        } catch (err) {
            logger.error(err, 'Failed to initialize scanner cache');
        }
    }

    saveSbomCache() {
        try {
            const file = path.join(this.cacheDir, 'periscope-sbom-cache.json');
            const data = Object.fromEntries(this.sbomScanCache.entries());
            fs.writeFileSync(file, JSON.stringify(data, null, 2));
        } catch (err) {
            logger.error(err, 'Failed to save SBOM cache');
        }
    }

    saveVulnsCache() {
        try {
            const file = path.join(this.cacheDir, 'periscope-vulns-cache.json');
            const data = Object.fromEntries(this.vulnsScanCache.entries());
            fs.writeFileSync(file, JSON.stringify(data, null, 2));
        } catch (err) {
            logger.error(err, 'Failed to save vulnerability cache');
        }
    }

    loadScannerConfig() {
        try {
            const file = path.join(this.cacheDir, 'periscope-scanner-config.json');
            if (fs.existsSync(file)) {
                const config = JSON.parse(fs.readFileSync(file, 'utf8'));
                this.enableAutoScan = config.enableAutoScan ?? true;
            }
        } catch (err) {
            logger.error(err, 'Failed to load scanner config');
        }
    }

    saveScannerConfig() {
        try {
            const file = path.join(this.cacheDir, 'periscope-scanner-config.json');
            fs.writeFileSync(file, JSON.stringify({ enableAutoScan: this.enableAutoScan }, null, 2));
        } catch (err) {
            logger.error(err, 'Failed to save scanner config');
        }
    }

    clearImageCache(imageRef) {
        this.sbomScanCache.delete(imageRef);
        this.vulnsScanCache.delete(imageRef);
        this.saveSbomCache();
        this.saveVulnsCache();
    }

    async ensureGrypeDb() {
        if (this.isGrypeDbUpdating) return;

        this.isGrypeDbUpdating = true;
        this.grypeDbUpdateError = null;

        logger.info('Checking/Updating Grype Vulnerability Database...');
        return new Promise((resolve) => {
            const execOptions = {
                timeout: 300000,
                env: {
                    ...process.env,
                    GRYPE_DB_CACHE_DIR: path.join(this.cacheDir, 'grype')
                }
            };
            exec('grype db update', execOptions, (error, stdout, stderr) => {
                this.isGrypeDbUpdating = false;
                this.lastGrypeDbCheck = new Date();

                if (error) {
                    logger.error({ error: stderr || error.message }, 'Failed to update Grype DB');
                    this.grypeDbUpdateError = stderr || error.message;
                    resolve(false);
                } else {
                    logger.info('Grype Vulnerability Database is up to date.');
                    resolve(true);
                }
            });
        });
    }

    getDbStatus() {
        return {
            isUpdating: this.isGrypeDbUpdating,
            error: this.grypeDbUpdateError,
            lastCheck: this.lastGrypeDbCheck,
        };
    }

    async performSbomScan(imageRef) {
        this.currentlyScanning.add(imageRef);
        try {
            return await new Promise((resolve, reject) => {
                let targetRef = imageRef;
                const isLocalRegistry = targetRef.includes('127.0.0.1:31999') || 
                                        targetRef.includes('localhost:31999') || 
                                        targetRef.includes('zarf-docker-registry.zarf.svc.cluster.local:5000');
                
                targetRef = targetRef
                    .replace('127.0.0.1:31999', 'zarf-docker-registry.zarf.svc.cluster.local:5000')
                    .replace('localhost:31999', 'zarf-docker-registry.zarf.svc.cluster.local:5000');

                const runScan = () => {
                    exec(`zarf tools sbom scan "${targetRef}" -o json`, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                        if (error) {
                            const failRes = { error: error.message || stderr, failed: true };
                            this.sbomScanCache.set(imageRef, failRes);
                            this.saveSbomCache();
                            return reject(new Error(error.message || stderr));
                        }
                        try {
                            const parsed = JSON.parse(stdout);
                            this.sbomScanCache.set(imageRef, parsed);
                            this.saveSbomCache();
                            resolve(parsed);
                        } catch (parseErr) {
                            const failRes = { error: 'Failed to parse SBOM JSON: ' + parseErr.message, failed: true };
                            this.sbomScanCache.set(imageRef, failRes);
                            this.saveSbomCache();
                            reject(new Error('Failed to parse SBOM JSON: ' + parseErr.message));
                        }
                    });
                };

                if (isLocalRegistry) {
                    zarfService._ensureRegistryLogin(runScan, (err) => {
                        const failRes = { error: 'Local registry authentication failed: ' + err.message, failed: true };
                        this.sbomScanCache.set(imageRef, failRes);
                        this.saveSbomCache();
                        reject(new Error('Local registry authentication failed: ' + err.message));
                    });
                } else {
                    runScan();
                }
            });
        } finally {
            this.currentlyScanning.delete(imageRef);
        }
    }

    async performVulnsScan(imageRef) {
        this.currentlyScanning.add(imageRef);
        try {
            return await new Promise((resolve, reject) => {
                let targetRef = imageRef;
                const isLocalRegistry = targetRef.includes('127.0.0.1:31999') || 
                                        targetRef.includes('localhost:31999') || 
                                        targetRef.includes('zarf-docker-registry.zarf.svc.cluster.local:5000');
                
                targetRef = targetRef
                    .replace('127.0.0.1:31999', 'zarf-docker-registry.zarf.svc.cluster.local:5000')
                    .replace('localhost:31999', 'zarf-docker-registry.zarf.svc.cluster.local:5000');

                const execOptions = {
                    maxBuffer: 25 * 1024 * 1024,
                    env: {
                        ...process.env,
                        GRYPE_DB_AUTO_UPDATE: 'true',
                        GRYPE_DB_CACHE_DIR: path.join(this.cacheDir, 'grype'),
                        GRYPE_CHECK_FOR_APP_UPDATE: 'false',
                        GRYPE_REGISTRY_INSECURE_USE_HTTP: 'true',
                        GRYPE_REGISTRY_INSECURE_SKIP_TLS_VERIFY: 'true'
                    }
                };

                const runScan = () => {
                    let scanRef = targetRef;
                    if (!scanRef.startsWith('registry:')) {
                        scanRef = `registry:${scanRef}`;
                    }

                    const child = exec(`grype "${scanRef}" -o json`, execOptions, (error, stdout, stderr) => {
                        if (error) {
                            const failRes = { error: error.message || stderr, failed: true };
                            this.vulnsScanCache.set(imageRef, failRes);
                            this.saveVulnsCache();
                            return reject(new Error(error.message || stderr));
                        }
                        try {
                            const parsed = JSON.parse(stdout);
                            this.vulnsScanCache.set(imageRef, parsed);
                            this.saveVulnsCache();
                            resolve(parsed);
                        } catch (parseErr) {
                            const failRes = { error: 'Failed to parse Vulnerability JSON: ' + parseErr.message, failed: true };
                            this.vulnsScanCache.set(imageRef, failRes);
                            this.saveVulnsCache();
                            reject(new Error('Failed to parse Vulnerability JSON: ' + parseErr.message));
                        }
                    });

                    setTimeout(() => child.kill('SIGTERM'), 300000);
                };

                if (isLocalRegistry) {
                    zarfService._ensureRegistryLogin(runScan, (err) => {
                        const failRes = { error: 'Local registry authentication failed: ' + err.message, failed: true };
                        this.vulnsScanCache.set(imageRef, failRes);
                        this.saveVulnsCache();
                        reject(new Error('Local registry authentication failed: ' + err.message));
                    });
                } else {
                    runScan();
                }
            });
        } finally {
            this.currentlyScanning.delete(imageRef);
        }
    }

    async backgroundScanLoop() {
        if (!this.enableAutoScan) {
            setTimeout(() => this.backgroundScanLoop(), 15000);
            return;
        }
        if (this.isBackgroundScanning) return;
        this.isBackgroundScanning = true;
        try {
            const images = await this.getRunningImages();
            
            const nextImage = images.find(img => {
                return (!this.sbomScanCache.has(img) || !this.vulnsScanCache.has(img)) && !this.currentlyScanning.has(img);
            });
            
            if (nextImage) {
                this.currentlyScanningImage = nextImage;
                logger.info({ image: nextImage }, 'Starting background scan');
                
                if (!this.sbomScanCache.has(nextImage)) {
                    try {
                        await this.performSbomScan(nextImage);
                    } catch (e) {
                        logger.error({ image: nextImage, error: e.message }, 'Background SBOM scan failed');
                    }
                }
                
                if (!this.vulnsScanCache.has(nextImage)) {
                    try {
                        await this.performVulnsScan(nextImage);
                    } catch (e) {
                        logger.error({ image: nextImage, error: e.message }, 'Background vulnerability scan failed');
                    }
                }
                
                logger.info({ image: nextImage }, 'Finished background scan');
            }
        } catch (err) {
            logger.error(err, 'Error during background scan loop');
        } finally {
            this.currentlyScanningImage = null;
            this.isBackgroundScanning = false;
            setTimeout(() => this.backgroundScanLoop(), 15000);
        }
    }

    async getRunningImages() {
        const k8sService = require('./k8sService');
        try {
            const pods = await k8sService.core.listPodForAllNamespaces();
            const images = new Set();
            pods.items.forEach(pod => {
                if (pod.spec && pod.spec.containers) {
                    pod.spec.containers.forEach(c => images.add(c.image));
                }
                if (pod.spec && pod.spec.initContainers) {
                    pod.spec.initContainers.forEach(c => images.add(c.image));
                }
            });
            return Array.from(images);
        } catch (err) {
            logger.error(err, 'Failed to fetch running images from cluster');
            return [];
        }
    }

    async getAllScans() {
        const results = {};
        
        // 1. Get currently running images in cluster
        const runningImagesList = await this.getRunningImages();
        const runningImagesSet = new Set(runningImagesList);
        
        // 2. Automatically clean up scans for images not running in the cluster
        let cacheChanged = false;
        
        for (const img of this.sbomScanCache.keys()) {
            if (!runningImagesSet.has(img)) {
                this.sbomScanCache.delete(img);
                cacheChanged = true;
            }
        }
        for (const img of this.vulnsScanCache.keys()) {
            if (!runningImagesSet.has(img)) {
                this.vulnsScanCache.delete(img);
                cacheChanged = true;
            }
        }
        
        if (cacheChanged) {
            this.saveSbomCache();
            this.saveVulnsCache();
        }
        
        // 3. Return results only for currently running images, plus any that are currently scanning
        const allImages = new Set([
            ...runningImagesList,
            ...this.currentlyScanning
        ]);
        
        allImages.forEach(img => {
            const sbom = this.sbomScanCache.get(img);
            const vulns = this.vulnsScanCache.get(img);
            
            const sbomFailed = sbom && (sbom.failed || sbom.error);
            const vulnsFailed = vulns && (vulns.failed || vulns.error);
            
            results[img] = {
                sbom: sbomFailed ? null : sbom,
                vulnerabilities: vulnsFailed ? null : vulns,
                status: (sbom && vulns && !sbomFailed && !vulnsFailed) ? 'success' : 
                        (sbomFailed || vulnsFailed) ? 'failed' : 
                        (this.currentlyScanning.has(img) || this.currentlyScanningImage === img) ? 'scanning' : 'notScanned',
                error: (sbomFailed ? (sbom.error || 'SBOM scan failed. ') : '') + 
                       (vulnsFailed ? (vulns.error || 'Vulnerabilities scan failed.') : '')
            };
        });
        
        return results;
    }
}

module.exports = new ScannerService();
