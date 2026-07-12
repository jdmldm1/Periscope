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

function handlePodTerminal(ws, namespace, pod, container) {
    const stdinStream = new stream.PassThrough();
    const stdoutStream = new stream.Writable({
        write(chunk, enc, cb) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(chunk);
            }
            cb();
        }
    });

    const execInstance = new k8s.Exec(k8sService.kc);
    const shellCmd = [
        '/bin/sh',
        '-c',
        'export TERM=xterm-256color; if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi'
    ];

    execInstance.exec(
        namespace,
        pod,
        container || undefined,
        shellCmd,
        stdoutStream,
        stdoutStream,
        stdinStream,
        true,
        (status) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        }
    )
    .then((conn) => {
        ws.on('message', (msg) => {
            try {
                const parsed = JSON.parse(msg.toString());
                if (parsed.type === 'resize' && conn?.resize) {
                    return conn.resize(parsed.cols, parsed.rows);
                }
            } catch (e) {}

            stdinStream.write(msg);
        });

        ws.on('close', () => {
            stdinStream.end();
        });
    })
    .catch(err => {
        safeClose(ws, 4001, err.message);
    });
}

module.exports = { handlePodTerminal };
