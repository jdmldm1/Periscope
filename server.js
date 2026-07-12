const logger = require('./src/utils/logger');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');

const k8sService = require('./src/services/k8sService');
const { authMiddleware, wsAuthCheck } = require('./src/middleware/auth');
const { createRateLimiter } = require('./src/middleware/rateLimiter');
const { decompressGrypeDatabase } = require('./src/utils/grypeDbHelper');
const { routeWebSocketConnection } = require('./src/websocket/wsRouter');

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
const authRoutes = require('./src/routes/authRoutes');
const orasRoutes = require('./src/routes/orasRoutes');
const networkRoutes = require('./src/routes/networkRoutes');

const app = express();
app.use(compression());

const corsOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

if (corsOrigins.length) {
    app.use(cors({
        origin: corsOrigins.includes('*') ? true : corsOrigins
    }));
}

app.use(express.json());
app.use('/api', authMiddleware);

const destructiveLimiter = createRateLimiter({
    windowMs: 60000,
    maxRequests: 30
});

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

app.use('/api', (req, res, next) => {
    if (MUTATING_METHODS.has(req.method)) {
        return destructiveLimiter(req, res, next);
    }
    next();
});

app.use('/api', (req, res, next) => {
    if (MUTATING_METHODS.has(req.method)) {
        logger.warn({
            audit: true,
            method: req.method,
            url: req.url.split('?')[0],
            ip: req.ip
        }, 'Mutating API request');
    }
    next();
});

decompressGrypeDatabase();

app.use((req, res, next) => {
    if (!req.url.includes('/metrics')) {
        const safeUrl = req.url.replace(/([?&]token=)[^&]*/gi, '$1[redacted]');
        logger.info({ method: req.method, url: safeUrl }, 'Incoming request');
    }
    next();
});

app.get('/healthz', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/readyz', async (req, res) => {
    try {
        await k8sService.core.listNamespace({ limit: 1 });
        res.json({ status: 'ready' });
    } catch (err) {
        logger.warn({ error: err.message }, 'Readiness check failed: cannot reach Kubernetes API');
        res.status(503).json({
            status: 'not-ready',
            error: 'Kubernetes API unreachable'
        });
    }
});

app.use('/api/kube', kubeRoutes);
app.use('/api', kubeRoutesV2);
app.use('/api/resource', kubeRoutes);
app.use('/api/helm', helmRoutes);
app.use('/api/zarf', zarfRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/zarf/scanner', scannerRoutes);
app.use('/api/zarf/grype', scannerRoutes);
app.use('/api/zarf/sbom', scannerRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/portforward', forwardRoutes);
app.use('/api/metrics', metricRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/autoscale', autoscaleRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/cronjob', cronJobRoutes);
app.use('/api/network', networkRoutes.router);
app.use('/api', authRoutes);
app.use('/api', orasRoutes);

app.use(express.static(path.join(__dirname, 'frontend/dist')));

app.get('/*path', (req, res) => {
    if (req.url.startsWith('/api')) {
        return res.status(404).json({ error: 'Not Found' });
    }

    const distPath = path.join(__dirname, 'frontend/dist/index.html');

    if (fs.existsSync(distPath)) {
        res.sendFile(distPath);
    } else {
        res.status(404).send('Frontend not built');
    }
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const WEBSOCKET_PATHS = [
    '/api/terminal/ws',
    '/api/logs/ws',
    '/api/cluster-terminal/ws',
    '/api/k9s/ws',
    '/api/network/sniff/ws',
    '/api/resources/ws'
];

server.on('upgrade', (request, socket, head) => {
    const urlObj = new URL(request.url, `http://${request.headers.host}`);
    const pathname = urlObj.pathname;

    if (WEBSOCKET_PATHS.includes(pathname)) {
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
    routeWebSocketConnection(ws, request);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server started');
});
