const k8sService = require('./k8sService');
const logger = require('../utils/logger');
const { run } = require('../utils/exec');

class PvcService {
    async getHelperPodName(pvcName) {
        // Sanitize name for DNS compliance
        const sanitized = pvcName.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 40);
        return `periscope-pvc-browser-${sanitized}`;
    }

    async ensureHelperPod(namespace, pvcName) {
        const podName = await this.getHelperPodName(pvcName);
        try {
            // Check if pod exists
            const podRes = await k8sService.core.readNamespacedPod({ name: podName, namespace });
            const pod = podRes.body || podRes;
            if (pod.status?.phase === 'Running') {
                return podName;
            }
            if (pod.status?.phase === 'Failed' || pod.status?.phase === 'Succeeded') {
                // Delete and recreate
                await this.deleteHelperPod(namespace, pvcName);
            }
        } catch (err) {
            // Pod doesn't exist, create it
        }

        const podBody = {
            apiVersion: 'v1',
            kind: 'Pod',
            metadata: {
                name: podName,
                namespace,
                labels: {
                    app: 'periscope-pvc-browser',
                    pvc: pvcName
                }
            },
            spec: {
                containers: [{
                    name: 'browser',
                    image: 'alpine:latest',
                    command: ['sleep', '3600'],
                    volumeMounts: [{
                        name: 'vol',
                        mountPath: '/data'
                    }]
                }],
                volumes: [{
                    name: 'vol',
                    persistentVolumeClaim: {
                        claimName: pvcName
                    }
                }]
            }
        };

        logger.info({ podName, namespace, pvcName }, 'Creating transient helper pod for PVC browsing');
        await k8sService.core.createNamespacedPod({ namespace, body: podBody });

        // Wait up to 30 seconds for pod to enter Running state
        for (let i = 0; i < 60; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
                const podCheck = await k8sService.core.readNamespacedPod({ name: podName, namespace });
                const phase = podCheck.body?.status?.phase || podCheck.status?.phase;
                if (phase === 'Running') {
                    return podName;
                }
            } catch (err) {
                // Ignore checks errors
            }
        }
        throw new Error(`Timeout waiting for volume helper pod ${podName} to start running.`);
    }

    async deleteHelperPod(namespace, pvcName) {
        const podName = await this.getHelperPodName(pvcName);
        logger.info({ podName, namespace }, 'Deleting helper pod');
        try {
            await k8sService.core.deleteNamespacedPod({ name: podName, namespace });
            return true;
        } catch (err) {
            return false;
        }
    }

    async execCommand(namespace, pvcName, command) {
        const podName = await this.ensureHelperPod(namespace, pvcName);
        // namespace/podName are passed as argv elements (no server-side shell).
        // `command` is the script we want the throwaway helper pod's shell to
        // run; it executes inside that ephemeral alpine pod, never on the host.
        try {
            const { stdout, stderr } = await run('kubectl', [
                'exec', '-n', namespace, podName, '-c', 'browser', '--', 'sh', '-c', command
            ]);
            return { stdout, stderr };
        } catch (error) {
            if (error.stdout) {
                return { stdout: error.stdout, stderr: error.stderr };
            }
            throw new Error(error.stderr || error.message);
        }
    }

    async listFiles(namespace, pvcName, folderPath = '/') {
        const path = folderPath.startsWith('/') ? folderPath : `/${folderPath}`;
        // List details: name, size, type (dir/file), modified date
        const cmd = `find "/data${path}" -maxdepth 1 -exec stat -c "%n|%s|%F|%Y" {} + 2>/dev/null || true`;
        try {
            const { stdout } = await this.execCommand(namespace, pvcName, cmd);
            const lines = stdout.split('\n').filter(Boolean);
            const items = [];
            
            for (const line of lines) {
                const [fullPath, sizeStr, typeStr, modTimeStr] = line.split('|');
                if (!fullPath || fullPath === `/data${path}` || fullPath === `/data${path}/`) continue;
                
                const name = fullPath.substring(fullPath.lastIndexOf('/') + 1);
                const isDir = typeStr.toLowerCase().includes('directory');
                const size = parseInt(sizeStr, 10) || 0;
                const mtime = new Date(parseInt(modTimeStr, 10) * 1000).toISOString();
                
                items.push({ name, size, isDir, mtime });
            }
            return items.sort((a, b) => b.isDir - a.isDir || a.name.localeCompare(b.name));
        } catch (err) {
            logger.error({ namespace, pvcName, folderPath, error: err.message }, 'Failed to list PVC files');
            throw err;
        }
    }

    async viewFile(namespace, pvcName, filePath) {
        const path = filePath.startsWith('/') ? filePath : `/${filePath}`;
        try {
            const { stdout } = await this.execCommand(namespace, pvcName, `cat "/data${path}"`);
            return stdout;
        } catch (err) {
            logger.error({ namespace, pvcName, filePath, error: err.message }, 'Failed to view PVC file');
            throw err;
        }
    }

    async deleteFile(namespace, pvcName, filePath) {
        const path = filePath.startsWith('/') ? filePath : `/${filePath}`;
        try {
            await this.execCommand(namespace, pvcName, `rm -rf "/data${path}"`);
            return true;
        } catch (err) {
            logger.error({ namespace, pvcName, filePath, error: err.message }, 'Failed to delete PVC file/folder');
            throw err;
        }
    }
}

module.exports = new PvcService();
