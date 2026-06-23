const logger = require('./src/utils/logger');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const http = require('http');
const fs = require('fs');
const stream = require('stream');
const WebSocket = require('ws');
const k8s = require('@kubernetes/client-node');

// Services
const k8sService = require('./src/services/k8sService');
const helmService = require('./src/services/helmService');
const zarfService = require('./src/services/zarfService');
const scannerService = require('./src/services/scannerService');
const securityService = require('./src/services/securityService');
const watchService = require('./src/services/watchService');
const { authMiddleware, wsAuthCheck } = require('./src/middleware/auth');
const { createRateLimiter } = require('./src/middleware/rateLimiter');

// Routes
const kubeRoutes = require('./src/routes/kubeRoutes');
const kubeRoutesV2 = require('./src/routes/kubeRoutesV2');
const helmRoutes = require('./src/routes/helmRoutes');
const zarfRoutes = require('./src/routes/zarfRoutes');
const taskRoutes = require('./src/routes/taskRoutes');
const scannerRoutes = require('./src/routes/scannerRoutes');
const securityRoutes = require('./src/routes/securityRoutes');
const forwardRoutes = require('./src/routes/forwardRoutes');
const metricRoutes = require('./src/routes/metricRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const autoscaleRoutes = require('./src/routes/autoscaleRoutes');
const backupRoutes = require('./src/routes/backupRoutes');
const cronJobRoutes = require('./src/routes/cronJobRoutes');

// Alerting Service Initializer
const alertService = require('./src/services/alertService');
alertService.startWatcher();

const app = express();
app.use(compression());
app.use(cors());
app.use(express.json());

// Authentication middleware for all API routes
app.use('/api', authMiddleware);

const destructiveLimiter = createRateLimiter({ windowMs: 60000, maxRequests: 30 });

(function decompressGrypeDb() {
    const dbBaseDir = '/app/.cache/grype';
    if (!fs.existsSync(dbBaseDir)) {
        return;
    }
    try {
        const schemas = fs.readdirSync(dbBaseDir);
        for (const schema of schemas) {
            const schemaDir = path.join(dbBaseDir, schema);
            if (fs.statSync(schemaDir).isDirectory()) {
                const files = fs.readdirSync(schemaDir);
                const compressedFile = files.find(f => f.endsWith('.db.zst'));
                if (compressedFile) {
                    const compressedPath = path.join(schemaDir, compressedFile);
                    const decompressedPath = path.join(schemaDir, 'vulnerability.db');
                    if (!fs.existsSync(decompressedPath)) {
                        const { exec } = require('child_process');
                        logger.info(`Found compressed Grype database in schema v${schema}. Decompressing in background...`);
                        exec(`zstd -d -f -q --rm "${compressedPath}" -o "${decompressedPath}"`, (err) => {
                            if (err) logger.error(`Failed to decompress Grype database for schema v${schema}:`, err);
                            else logger.info(`Successfully decompressed Grype database for schema v${schema}.`);
                        });
                    }
                }
            }
        }
    } catch (err) {
        logger.error('Error during initial Grype database check/decompression:', err);
    }
})();

// Request logging
app.use((req, res, next) => {
    if (!req.url.includes('/metrics')) {
        logger.info({ method: req.method, url: req.url }, 'Incoming request');
    }
    next();
});

// Health checks
app.get('/healthz', (req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (req, res) => res.json({ status: 'ready' }));

// API Routes (Matching old paths for compatibility)
app.use('/api/kube', kubeRoutes);
app.use('/api', kubeRoutesV2);
app.use('/api/resource', kubeRoutes); // Alias for LogsView/etc
app.use('/api/helm', helmRoutes);
app.use('/api/zarf', zarfRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/zarf/scanner', scannerRoutes);
app.use('/api/zarf/grype', scannerRoutes); // Legacy scanner path
app.use('/api/zarf/sbom', scannerRoutes); // Legacy scanner path
app.use('/api/security', securityRoutes);
app.use('/api/portforward', forwardRoutes);
app.use('/api/metrics', metricRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/autoscale', autoscaleRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/cronjob', cronJobRoutes);

// Static frontend
app.use(express.static(path.join(__dirname, 'frontend/dist')));
app.get('/*path', (req, res) => {
    if (req.url.startsWith('/api')) return res.status(404).json({ error: 'Not Found' });
    const distPath = path.join(__dirname, 'frontend/dist/index.html');
    if (fs.existsSync(distPath)) {
        res.sendFile(distPath);
    } else {
        res.status(404).send('Frontend not built');
    }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

function safeClose(ws, code, reason) {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
        let safeReason = reason || '';
        if (Buffer.byteLength(safeReason, 'utf8') > 123) {
            const buf = Buffer.from(safeReason, 'utf8');
            safeReason = buf.subarray(0, 120).toString('utf8');
            safeReason = safeReason.replace(/[\uFFFD]/g, '') + '...';
        }
        ws.close(code, safeReason);
    } catch (e) {
        logger.error(e, 'Error in safeClose');
        try { ws.close(code); } catch (_) {}
    }
}

server.on('upgrade', (request, socket, head) => {
    const urlObj = new URL(request.url, `http://${request.headers.host}`);
    const pathname = urlObj.pathname;
    
    if (['/api/terminal/ws', '/api/logs/ws', '/api/cluster-terminal/ws', '/api/network/sniff/ws', '/api/resources/ws'].includes(pathname)) {
        if (!wsAuthCheck(request)) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

wss.on('connection', (ws, request) => {
    const urlObj = new URL(request.url, `http://${request.headers.host}`);
    const pathname = urlObj.pathname;
    const params = urlObj.searchParams;
    
    const namespace = params.get('namespace') || 'default';
    const pod = params.get('pod');
    const container = params.get('container');

    if (pathname === '/api/resources/ws') {
        watchService.addClient(ws);
        return;
    }
    
    if (pathname === '/api/cluster-terminal/ws') {
        logger.info('Establishing cluster-level terminal session');
        const { spawn } = require('child_process');
        const shell = spawn('script', ['-q', '-c', '/bin/sh', '/dev/null'], {
            env: { ...process.env, TERM: 'xterm-256color' }
        });
        let sized = false;
        shell.stdout.on('data', (data) => ws.readyState === WebSocket.OPEN && ws.send(data));
        shell.stderr.on('data', (data) => ws.readyState === WebSocket.OPEN && ws.send(data));
        ws.on('message', (msg) => {
            // Resize messages are JSON control frames, not shell input — they
            // must not be written into the shell as literal text.
            try {
                const p = JSON.parse(msg.toString());
                if (p && p.type === 'resize') {
                    // The pty created by `script` can't be resized via ioctl
                    // without a native module, so set the size once via stty at
                    // the initial (empty) prompt. This is what lets TUIs like
                    // k9s draw at the right dimensions instead of flickering.
                    const cols = parseInt(p.cols, 10);
                    const rows = parseInt(p.rows, 10);
                    if (!sized && shell.stdin.writable && cols > 0 && rows > 0) {
                        sized = true;
                        shell.stdin.write(`stty rows ${rows} cols ${cols} 2>/dev/null; clear\r`);
                    }
                    return;
                }
            } catch (e) { /* not JSON — fall through and treat as shell input */ }
            if (shell.stdin.writable) shell.stdin.write(msg);
        });
        shell.on('exit', () => ws.readyState === WebSocket.OPEN && ws.close());
        ws.on('close', () => { shell.kill('SIGKILL'); });
        return;
    }

    if (pathname === '/api/network/sniff/ws') {
        logger.info('Establishing live network packet capture session');
        const { spawn } = require('child_process');
        let ipMap = {};
        const refreshIpMap = async () => {
            try {
                const [pods, svcs] = await Promise.all([
                    k8sService.core.listPodForAllNamespaces(),
                    k8sService.core.listServiceForAllNamespaces()
                ]);
                const newIpMap = {};
                pods.items.forEach(p => p.status?.podIP && (newIpMap[p.status.podIP] = { type: 'pod', name: p.metadata.name, namespace: p.metadata.namespace }));
                svcs.items.forEach(s => s.spec?.clusterIP && s.spec.clusterIP !== 'None' && (newIpMap[s.spec.clusterIP] = { type: 'service', name: s.metadata.name, namespace: s.metadata.namespace }));
                ipMap = newIpMap;
            } catch (err) { logger.error(err, 'Error refreshing IP lookup map'); }
        };
        refreshIpMap();
        const refreshInterval = setInterval(refreshIpMap, 15000);
        const tcpdump = spawn('tcpdump', ['-l', '-nn', '-i', 'any'], { env: { ...process.env } });
        let lineBuffer = '';
        tcpdump.stdout.on('data', (data) => {
            lineBuffer += data.toString('utf8');
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() || '';
            lines.forEach(line => {
                const match = line.match(/^(\d{2}:\d{2}:\d{2}\.\d+)\s+(?:.*\s+)?IP\s+([\d.]+)\.(\d+)\s+>\s+([\d.]+)\.(\d+):\s+(.*)/);
                if (match) {
                    const [_, timestamp, srcIp, srcPort, destIp, destPort, info] = match;
                    const packet = { timestamp, srcIp, srcPort: parseInt(srcPort), srcRes: ipMap[srcIp] || { type: 'external', name: srcIp }, destIp, destPort: parseInt(destPort), destRes: ipMap[destIp] || { type: 'external', name: destIp }, protocol: info.includes('UDP') ? 'UDP' : 'TCP', info: info.trim() };
                    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(packet));
                }
            });
        });
        ws.on('close', () => { clearInterval(refreshInterval); tcpdump.kill('SIGKILL'); });
        return;
    }
    
    if (!pod) return safeClose(ws, 4000, 'Pod required');
    
    if (pathname === '/api/terminal/ws') {
        const stdinStream = new stream.PassThrough();
        const stdoutStream = new stream.Writable({ write(chunk, enc, cb) { ws.readyState === WebSocket.OPEN && ws.send(chunk); cb(); } });
        const execInstance = new k8s.Exec(k8sService.kc);
        // Prefer bash for proper line editing and command history (up-arrow
        // recall), but fall back to sh on minimal images that lack it. TERM is
        // exported so curses-based TUIs and progress bars render correctly.
        const shellCmd = ['/bin/sh', '-c', 'export TERM=xterm-256color; if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi'];
        execInstance.exec(namespace, pod, container || undefined, shellCmd, stdoutStream, stdoutStream, stdinStream, true, (status) => {
            ws.readyState === WebSocket.OPEN && ws.close();
        }).then((conn) => {
            ws.on('message', (msg) => {
                try {
                    const p = JSON.parse(msg.toString());
                    if (p.type === 'resize' && conn?.resize) return conn.resize(p.cols, p.rows);
                } catch (e) {}
                stdinStream.write(msg);
            });
            ws.on('close', () => stdinStream.end());
        }).catch(err => safeClose(ws, 4001, err.message));
    } else if (pathname === '/api/logs/ws') {
        const logStream = new stream.PassThrough();
        logStream.on('data', (chunk) => ws.readyState === WebSocket.OPEN && ws.send(chunk.toString('utf8')));
        const k8sLog = new k8s.Log(k8sService.kc);
        k8sLog.log(namespace, pod, container || undefined, logStream, { follow: true, tailLines: 500 }, (err) => {
            ws.readyState === WebSocket.OPEN && ws.close();
        }).then((req) => {
            ws.on('close', () => req?.abort?.());
        }).catch(err => safeClose(ws, 4002, err.message));
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server started');
});
