const WebSocket = require('ws');
const { handleClusterTerminal } = require('./clusterTerminalHandler');
const { handleK9s } = require('./k9sHandler');
const { handleNetworkSniff } = require('./networkSniffHandler');
const { handlePodTerminal } = require('./podTerminalHandler');
const { handlePodLogs } = require('./podLogsHandler');
const watchService = require('../services/watchService');

function routeWebSocketConnection(ws, request) {
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
        handleClusterTerminal(ws);
        return;
    }

    if (pathname === '/api/k9s/ws') {
        handleK9s(ws);
        return;
    }

    if (pathname === '/api/network/sniff/ws') {
        handleNetworkSniff(ws, params);
        return;
    }

    if (!pod) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.close(4000, 'Pod required');
            } catch (e) {}
        }
        return;
    }

    if (pathname === '/api/terminal/ws') {
        handlePodTerminal(ws, namespace, pod, container);
        return;
    }

    if (pathname === '/api/logs/ws') {
        handlePodLogs(ws, namespace, pod, container);
        return;
    }
}

module.exports = { routeWebSocketConnection };
