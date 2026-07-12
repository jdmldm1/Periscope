const WebSocket = require('ws');
const stream = require('stream');
const k8s = require('@kubernetes/client-node');
const k8sService = require('../services/k8sService');
const logger = require('../utils/logger');

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
        try {
            ws.close(code);
        } catch (_) {}
    }
}

function handlePodLogs(ws, namespace, pod, container) {
    const logStream = new stream.PassThrough();

    logStream.on('data', (chunk) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(chunk.toString('utf8'));
        }
    });

    const k8sLog = new k8s.Log(k8sService.kc);

    k8sLog.log(
        namespace,
        pod,
        container || undefined,
        logStream,
        { follow: true, tailLines: 500 },
        (err) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }
    )
    .then((req) => {
        ws.on('close', () => {
            if (req?.abort) {
                req.abort();
            }
        });
    })
    .catch(err => {
        safeClose(ws, 4002, err.message);
    });
}

module.exports = { handlePodLogs };
