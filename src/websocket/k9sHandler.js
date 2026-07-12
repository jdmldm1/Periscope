const WebSocket = require('ws');
const logger = require('../utils/logger');

function terminalEnv() {
    const env = { ...process.env, TERM: 'xterm-256color' };
    const kc = require('./kubeconfigHelper').inClusterKubeconfigPath();
    if (kc) env.KUBECONFIG = kc;
    return env;
}

function handleK9s(ws) {
    logger.info('Establishing k9s session');
    const { spawn } = require('child_process');
    const env = terminalEnv();
    const shell = spawn('script', ['-q', '-c', '/bin/sh', '/dev/null'], { env });

    const k9sCmd = env.KUBECONFIG
        ? 'exec zarf tools k9s --context in-cluster -A'
        : 'exec zarf tools k9s -A';

    let started = false;

    shell.stdout.on('data', (data) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    });

    shell.stderr.on('data', (data) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    });

    ws.on('message', (msg) => {
        try {
            const parsed = JSON.parse(msg.toString());
            if (parsed && parsed.type === 'resize') {
                const cols = parseInt(parsed.cols, 10);
                const rows = parseInt(parsed.rows, 10);

                if (!started && shell.stdin.writable && cols > 0 && rows > 0) {
                    started = true;
                    shell.stdin.write(`stty rows ${rows} cols ${cols} 2>/dev/null; clear; ${k9sCmd}\r`);
                }
                return;
            }
        } catch (e) {}

        if (shell.stdin.writable) {
            shell.stdin.write(msg);
        }
    });

    shell.on('exit', () => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
    });

    ws.on('close', () => {
        shell.kill('SIGKILL');
    });
}

module.exports = { handleK9s };
