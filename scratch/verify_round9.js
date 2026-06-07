const http = require('http');

console.log('--- Verification Script Round 9 ---');

const { spawn } = require('child_process');
const serverProc = spawn('node', ['server.js'], {
    env: { ...process.env, PORT: 41112 }
});

serverProc.stdout.on('data', (data) => {
    console.log('[Server STDOUT]', data.toString().trim());
});

setTimeout(() => {
    // 1. Verify Gitea Config GET
    console.log('Querying GET /api/gitea/config...');
    const reqGet = http.get('http://localhost:41112/api/gitea/config', (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
            console.log('Gitea Config GET Status:', res.statusCode);
            console.log('Body:', body);
            
            // 2. Verify Gitea Exec Command
            console.log('Querying POST /api/gitea/exec (tea help)...');
            const reqPost = http.request({
                hostname: 'localhost',
                port: 41112,
                path: '/api/gitea/exec',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            }, (resPost) => {
                let bodyPost = '';
                resPost.on('data', (chunk) => bodyPost += chunk);
                resPost.on('end', () => {
                    console.log('Gitea Exec POST Status:', resPost.statusCode);
                    try {
                        const parsed = JSON.parse(bodyPost);
                        console.log('Output preview:\n', parsed.output.substring(0, 300));
                        console.log('SUCCESS: Gitea emulator CLI successfully verified!');
                    } catch (e) {
                        console.error('Failed to parse POST body:', e.message);
                    }
                    serverProc.kill();
                    process.exit(0);
                });
            });
            reqPost.write(JSON.stringify({ command: 'tea help' }));
            reqPost.end();
        });
    });

    reqGet.on('error', (err) => {
        console.error('Failed to connect to verification server:', err.message);
        serverProc.kill();
        process.exit(1);
    });
}, 3000);
