const { execFile, spawn } = require('child_process');

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;



function run(file, args = [], opts = {}) {
    return new Promise((resolve, reject) => {
        execFile(file, args, { maxBuffer: DEFAULT_MAX_BUFFER, ...opts }, (error, stdout, stderr) => {
            if (error) {

                error.stderr = stderr;
                error.stdout = stdout;
                if (!error.message && stderr) error.message = stderr;
                return reject(error);
            }
            resolve({ stdout: stdout || '', stderr: stderr || '' });
        });
    });
}



async function runJson(file, args = [], opts = {}) {
    const { stdout } = await run(file, args, opts);
    return JSON.parse(stdout);
}



function spawnSafe(file, args = [], opts = {}) {
    return spawn(file, args, { ...opts, shell: false });
}

module.exports = { run, runJson, spawnSafe, DEFAULT_MAX_BUFFER };
