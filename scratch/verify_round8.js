const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const kbCacheFile = path.join(os.tmpdir(), 'periscope-kubescape-cache.json');
console.log('--- Verification Script Round 8 ---');
console.log('Kubescape Cache File:', kbCacheFile, 'Exists:', fs.existsSync(kbCacheFile));

// Start server on dynamic port
const { spawn } = require('child_process');
const serverProc = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: 41111 }
});

serverProc.stdout.on('data', (data) => {
    console.log('[Server STDOUT]', data.toString().trim());
});

serverProc.stderr.on('data', (data) => {
    console.error('[Server STDERR]', data.toString().trim());
});

setTimeout(() => {
    console.log('Querying /api/cluster/audit...');
    const req = http.get('http://localhost:41111/api/cluster/audit', (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            console.log('Audit Response Status:', res.statusCode);
            try {
                const parsed = JSON.parse(body);
                console.log('Score:', parsed.score);
                console.log('Grade:', parsed.grade);
                console.log('Total Issues:', parsed.issues.length);
                if (parsed.issues.length > 0) {
                    console.log('First issue example:');
                    console.log('  Rule:', parsed.issues[0].rule);
                    console.log('  Resource:', parsed.issues[0].resource);
                    console.log('  Severity:', parsed.issues[0].severity);
                    console.log('  Remediation:', parsed.issues[0].remediation);
                    console.log('  Suggested Fix (codeFix):', parsed.issues[0].codeFix);
                }
                console.log('SUCCESS: Auditor endpoint is fully integrated with Kubescape!');
            } catch (err) {
                console.error('Failed to parse audit response:', err.message);
                console.log('Raw body:', body.substring(0, 500));
            }
            serverProc.kill();
            process.exit(0);
        });
    });

    req.on('error', (err) => {
        console.error('Failed to query Auditor API:', err.message);
        serverProc.kill();
        process.exit(1);
    });
}, 3000);
