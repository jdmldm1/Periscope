const { execFile, spawn } = require('child_process');

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

/**
 * Run an external command WITHOUT a shell.
 *
 * Using execFile (rather than exec) means `file` is executed directly and every
 * entry in `args` is passed as a single argv element. User-controlled values can
 * therefore never be interpreted as shell syntax (no `;`, `|`, `$()`, backticks,
 * globbing, redirects, etc.), which is what closes the command-injection holes
 * that string-interpolated `exec()` calls used to have.
 *
 * @param {string} file       Executable to run (e.g. 'kubectl', 'helm', 'zarf').
 * @param {string[]} args     Argument vector. Each element is passed verbatim.
 * @param {object} [opts]     execFile options (maxBuffer, env, timeout, cwd...).
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function run(file, args = [], opts = {}) {
    return new Promise((resolve, reject) => {
        execFile(file, args, { maxBuffer: DEFAULT_MAX_BUFFER, ...opts }, (error, stdout, stderr) => {
            if (error) {
                // Surface stderr/stdout on the error so callers can report useful messages.
                error.stderr = stderr;
                error.stdout = stdout;
                if (!error.message && stderr) error.message = stderr;
                return reject(error);
            }
            resolve({ stdout: stdout || '', stderr: stderr || '' });
        });
    });
}

/**
 * Run a command and JSON.parse its stdout.
 */
async function runJson(file, args = [], opts = {}) {
    const { stdout } = await run(file, args, opts);
    return JSON.parse(stdout);
}

/**
 * Spawn a long-running / streaming process WITHOUT a shell. Thin wrapper so call
 * sites never pass `shell: true` (which would re-introduce injection by
 * concatenating args into a shell string).
 */
function spawnSafe(file, args = [], opts = {}) {
    return spawn(file, args, { ...opts, shell: false });
}

module.exports = { run, runJson, spawnSafe, DEFAULT_MAX_BUFFER };
