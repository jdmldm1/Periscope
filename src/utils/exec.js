const { execFile, spawn } = require('child_process');
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
function run(file, args = [], opts = {}) {
    return new Promise((resolve, reject) => {
        execFile(file, args, { maxBuffer: DEFAULT_MAX_BUFFER, ...opts }, (error, stdout, stderr) => {
            if (error) {
                error.stderr = stderr;
                error.stdout = stdout;
                if (!error.message && stderr)
                    error.message = stderr;
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
// Like run(), but writes `input` to the child's stdin (keeps secrets out of argv and `ps`).
function runWithStdin(file, args, input, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = execFile(file, args, { maxBuffer: DEFAULT_MAX_BUFFER, ...opts }, (error, stdout, stderr) => {
            if (error) {
                error.stderr = stderr;
                error.stdout = stdout;
                return reject(error);
            }
            resolve({ stdout: stdout || '', stderr: stderr || '' });
        });
        child.stdin.end(input);
    });
}
function spawnSafe(file, args = [], opts = {}) {
    return spawn(file, args, { ...opts, shell: false });
}
module.exports = { run, runJson, runWithStdin, spawnSafe, DEFAULT_MAX_BUFFER };
