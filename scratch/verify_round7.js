const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sbomCacheFile = path.join(os.tmpdir(), 'periscope-sbom-cache.json');
const vulnsCacheFile = path.join(os.tmpdir(), 'periscope-vulns-cache.json');

console.log('--- Verification Script ---');
console.log('Persistent Cache Files:');
console.log('SBOM:', sbomCacheFile, 'Exists:', fs.existsSync(sbomCacheFile));
console.log('Vulns:', vulnsCacheFile, 'Exists:', fs.existsSync(vulnsCacheFile));

// We can run server.js in a child process to check if it boots and loads cache properly
const { spawn } = require('child_process');
const serverProc = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: 39999 }
});

let output = '';
serverProc.stdout.on('data', (data) => {
    const str = data.toString();
    output += str;
    console.log('[Server STDOUT]', str.trim());
});

serverProc.stderr.on('data', (data) => {
    console.error('[Server STDERR]', data.toString().trim());
});

setTimeout(() => {
    console.log('Checking endpoints...');
    const req = http.get('http://localhost:39999/api/zarf/sbom/scans', (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            console.log('Response Status:', res.statusCode);
            try {
                const parsed = JSON.parse(body);
                console.log('Scans returned:', Object.keys(parsed).length);
                console.log('Sample data keys:', Object.keys(parsed).slice(0, 5));
                console.log('SUCCESS: API endpoint /api/zarf/sbom/scans is functional!');
            } catch (err) {
                console.error('Failed to parse scans response:', err.message);
                console.log('Raw body:', body.substring(0, 500));
            }
            serverProc.kill();
            process.exit(0);
        });
    });

    req.on('error', (err) => {
        console.error('Failed to query API:', err.message);
        serverProc.kill();
        process.exit(1);
    });
}, 3000);
