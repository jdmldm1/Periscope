import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, readdirSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMAGES = {
    gitleaks: 'zricethezav/gitleaks:v8.30.0',
    semgrep: 'semgrep/semgrep:1.151.0',
    hadolint: 'hadolint/hadolint:v2.15.1',
    shellcheck: 'koalaman/shellcheck:v0.11.0',
    actionlint: 'rhysd/actionlint:1.7.12',
    zizmor: 'ghcr.io/zizmorcore/zizmor:1.33.1',
    helm: 'alpine/helm:4.3.2',
    kubeconform: 'ghcr.io/yannh/kubeconform:v0.8.0',
    kubeLinter: 'stackrox/kube-linter:v0.8.3',
    helmUnittest: 'helmunittest/helm-unittest:4.3.0-1.2.1',
    powershell: 'mcr.microsoft.com/powershell:7.4-alpine-3.20',
};
const ZARF_VERSION = 'v0.83.0';
const PSSA_VERSION = '1.24.0';
const SEMGREP_PACKS = [
    'p/javascript',
    'p/typescript',
    'p/react',
    'p/nodejs',
    'p/expressjs',
    'p/secrets',
    'p/dockerfile',
    'p/github-actions',
];
const CHART = 'charts/periscope';
const CHART_VARIANTS = ['values-connected.yaml', 'values-airgap.yaml', 'values-airgap-lite.yaml'];
const ZARF_DEFINITIONS = ['zarf.yaml', 'zarf-airgap.yaml', 'zarf-airgap-lite.yaml'];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit
        ? hit
              .slice(name.length + 3)
              .split(',')
              .filter(Boolean)
        : null;
};
const CI = flag('ci') || process.env.CI === 'true';

const npx = (bin, ...rest) => ['npx', ['--no-install', bin, ...rest]];
const npm = (...rest) => ['npm', rest];
const docker = (image, ...rest) => ['docker', ['run', '--rm', '-v', `${ROOT}:/src`, '-w', '/src', image, ...rest]];
const dockerEntry = (entrypoint, image, ...rest) => [
    'docker',
    ['run', '--rm', '-v', `${ROOT}:/src`, '-w', '/src', '--entrypoint', entrypoint, image, ...rest],
];

const shellScripts = () =>
    ['docker', 'deploy/shiloh']
        .flatMap((dir) => readdirSync(path.join(ROOT, dir)).map((f) => `${dir}/${f}`))
        .filter((f) => f.endsWith('.sh'));

const STEPS = [
    { id: 'format', section: 1, run: () => [npx('prettier', '--check', '.')] },
    { id: 'lint-backend', section: 1, run: () => [npx('eslint', '.')] },
    { id: 'lint-frontend', heavy: true, section: 1, run: () => [npm('--prefix', 'frontend', 'run', 'lint')] },
    { id: 'typecheck-backend', section: 1, run: () => [npx('tsc', '-p', 'tsconfig.json')] },
    { id: 'typecheck-frontend', heavy: true, section: 1, run: () => [npm('--prefix', 'frontend', 'run', 'typecheck')] },
    {
        id: 'audit',
        section: 1,
        run: () => [
            npm('audit', '--omit=dev', '--audit-level=high'),
            npm('--prefix', 'frontend', 'audit', '--omit=dev', '--audit-level=high'),
        ],
    },
    {
        id: 'secrets',
        section: 1,
        run: () => [
            [
                'docker',
                [
                    'run',
                    '--rm',
                    '-v',
                    `${ROOT}:/src`,
                    '-w',
                    '/src',
                    '-e',
                    'GIT_CONFIG_COUNT=1',
                    '-e',
                    'GIT_CONFIG_KEY_0=safe.directory',
                    '-e',
                    'GIT_CONFIG_VALUE_0=*',
                    IMAGES.gitleaks,
                    'git',
                    '/src',
                    '--redact',
                    '--no-banner',
                    ...(CI ? [] : ['--staged', '--pre-commit']),
                ],
            ],
        ],
    },
    {
        id: 'semgrep',
        section: 2,
        run: () => [
            docker(
                IMAGES.semgrep,
                'semgrep',
                'scan',
                '--metrics=off',
                '--error',
                '--quiet',
                '--disable-version-check',
                ...SEMGREP_PACKS.flatMap((p) => ['--config', p]),
                '--exclude',
                'node_modules',
                '--exclude',
                'dist',
                '--exclude',
                'coverage',
                '--exclude',
                `${CHART}/templates`,
            ),
        ],
    },
    {
        id: 'hadolint',
        section: 2,
        run: () => [docker(IMAGES.hadolint, 'hadolint', '--config', '.hadolint.yaml', 'Dockerfile')],
    },
    { id: 'helm-lint', section: 2, run: () => [docker(IMAGES.helm, 'lint', CHART)] },
    {
        id: 'helm-unittest',
        section: 2,
        run: () => [
            typeof process.getuid === 'function'
                ? [
                      'docker',
                      [
                          'run',
                          '--rm',
                          '--user',
                          `${process.getuid()}:${process.getgid()}`,
                          '-e',
                          'HOME=/tmp',
                          '-v',
                          `${ROOT}:/src`,
                          '-w',
                          '/src',
                          IMAGES.helmUnittest,
                          CHART,
                      ],
                  ]
                : docker(IMAGES.helmUnittest, CHART),
        ],
    },
    { id: 'kube-linter', section: 2, run: () => [docker(IMAGES.kubeLinter, 'lint', CHART)] },
    {
        id: 'kubeconform',
        section: 2,
        run: () =>
            CHART_VARIANTS.map((v) => ({
                pipe: [
                    docker(IMAGES.helm, 'template', 'periscope', CHART, '-f', `${CHART}/${v}`),
                    ['docker', ['run', '--rm', '-i', IMAGES.kubeconform, '-strict', '-summary']],
                ],
            })),
    },
    {
        id: 'zarf-lint',
        section: 2,
        run: async () => {
            const zarf = await ensureZarf();
            return ZARF_DEFINITIONS.map((def) => ({ zarfLint: { zarf, def } }));
        },
    },
    { id: 'actionlint', section: 3, run: () => [docker(IMAGES.actionlint, '-color=false')] },
    {
        id: 'zizmor',
        section: 3,
        run: () => [docker(IMAGES.zizmor, '--offline', '--min-severity=medium', '.github/workflows/')],
    },
    { id: 'shellcheck', section: 3, run: () => [docker(IMAGES.shellcheck, '-f', 'gcc', ...shellScripts())] },
    {
        id: 'psscriptanalyzer',
        section: 3,
        run: () => [
            dockerEntry(
                'pwsh',
                IMAGES.powershell,
                '-NoLogo',
                '-NonInteractive',
                '-Command',
                `Set-PSRepository PSGallery -InstallationPolicy Trusted; ` +
                    `Install-Module PSScriptAnalyzer -RequiredVersion ${PSSA_VERSION} -Scope CurrentUser -Force | Out-Null; ` +
                    `$r = Get-ChildItem -Path /src -Filter *.ps1 | ForEach-Object { Invoke-ScriptAnalyzer -Path $_.FullName -Settings /src/PSScriptAnalyzerSettings.psd1 }; ` +
                    `$r | Format-Table -AutoSize RuleName, Severity, Line, ScriptName | Out-String -Width 200; ` +
                    `if ($r) { exit 1 }`,
            ),
        ],
    },
    {
        id: 'test-backend',
        section: 4,
        run: () => {
            mkdirSync(path.join(ROOT, 'coverage'), { recursive: true });
            return [
                [
                    'node',
                    [
                        '--test',
                        '--test-timeout=30000',
                        '--experimental-test-coverage',
                        '--test-reporter=spec',
                        '--test-reporter-destination=stdout',
                        '--test-reporter=lcov',
                        '--test-reporter-destination=coverage/lcov.info',
                        'server.test.js',
                        'src/**/*.test.js',
                    ],
                ],
            ];
        },
    },
    { id: 'test-frontend', heavy: true, section: 4, run: () => [npm('--prefix', 'frontend', 'run', 'test:coverage')] },
    { id: 'build-frontend', heavy: true, section: 4, run: () => [npm('--prefix', 'frontend', 'run', 'build')] },
    { id: 'knip', section: 4, run: () => [npx('knip', '--no-progress')] },
    { id: 'e2e', section: 4, optIn: true, run: () => [npm('--prefix', 'frontend', 'run', 'test:e2e')] },
];

async function ensureZarf() {
    const platform = { win32: 'Windows', linux: 'Linux', darwin: 'Mac' }[process.platform];
    const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
    const file = `zarf_${ZARF_VERSION}_${platform}_${arch}${process.platform === 'win32' ? '.exe' : ''}`;
    const dir = path.join(ROOT, '.cache', 'tools');
    const target = path.join(dir, file);
    if (existsSync(target)) return target;
    mkdirSync(dir, { recursive: true });
    const base = `https://github.com/zarf-dev/zarf/releases/download/${ZARF_VERSION}`;
    const [bin, sums] = await Promise.all([
        fetch(`${base}/${file}`).then((r) =>
            r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${file}: HTTP ${r.status}`)),
        ),
        fetch(`${base}/checksums.txt`).then((r) =>
            r.ok ? r.text() : Promise.reject(new Error(`checksums: HTTP ${r.status}`)),
        ),
    ]);
    const expected = sums
        .split('\n')
        .find((l) => l.trim().endsWith(` ${file}`))
        ?.split(/\s+/)[0];
    const actual = createHash('sha256').update(Buffer.from(bin)).digest('hex');
    if (!expected || expected !== actual) throw new Error(`Checksum mismatch for ${file}`);
    writeFileSync(target, Buffer.from(bin));
    chmodSync(target, 0o755);
    return target;
}

function exec(cmd, cmdArgs, input) {
    return new Promise((resolve) => {
        const child = spawn(cmd, cmdArgs, {
            cwd: ROOT,
            shell: process.platform === 'win32' && (cmd === 'npm' || cmd === 'npx'),
            env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
        });
        let out = '';
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (out += d));
        child.on('error', (err) => resolve({ code: 127, out: out + String(err) }));
        child.on('close', (code) => resolve({ code, out }));
        if (input !== undefined) child.stdin.end(input);
        else child.stdin.end();
    });
}

async function runCommand(entry) {
    if (entry.pipe) {
        const [[c1, a1], [c2, a2]] = entry.pipe;
        const first = await exec(c1, a1);
        if (first.code !== 0) return first;
        return exec(c2, a2, first.out);
    }
    if (entry.zarfLint) {
        const { zarf, def } = entry.zarfLint;
        const dir = path.join(tmpdir(), `periscope-zarf-lint-${process.pid}-${def}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, 'zarf.yaml'), readFileSync(path.join(ROOT, def)));
        const result = await exec(zarf, ['dev', 'lint', dir, '--no-color']);
        const failed = result.code !== 0 || /\|\s*Error\s*\|/.test(result.out);
        return { code: failed ? 1 : 0, out: `${def}\n${result.out}` };
    }
    const [cmd, cmdArgs] = entry;
    return exec(cmd, cmdArgs);
}

async function runStep(step) {
    const started = Date.now();
    let out = '';
    try {
        for (const entry of await step.run()) {
            const result = await runCommand(entry);
            out += result.out;
            if (result.code !== 0) return { step, ok: false, out, ms: Date.now() - started };
        }
        return { step, ok: true, out, ms: Date.now() - started };
    } catch (err) {
        return { step, ok: false, out: out + String(err?.stack || err), ms: Date.now() - started };
    }
}

async function main() {
    if (flag('list')) {
        for (const s of STEPS) console.log(`${s.section}  ${s.id}${s.optIn ? '  (opt-in)' : ''}`);
        return;
    }
    const only = option('only');
    const skip = option('skip') || [];
    const sections = option('section')?.map(Number);
    const selected = STEPS.filter(
        (s) =>
            (only ? only.includes(s.id) : !s.optIn || flag(s.id)) &&
            !skip.includes(s.id) &&
            (!sections || sections.includes(s.section)),
    );
    const unknown = [...(only || []), ...skip].filter((id) => !STEPS.some((s) => s.id === id));
    if (unknown.length) throw new Error(`Unknown step(s): ${unknown.join(', ')}. Use --list.`);

    const dockerNeeded = selected.some((s) => /docker/.test(String(s.run)));
    if (dockerNeeded && (await exec('docker', ['info', '--format', '{{.ServerVersion}}'])).code !== 0) {
        console.error('Docker is required for the container-based checks and is not running.');
        process.exit(2);
    }

    const concurrency = Math.max(2, Math.min(4, cpus().length - 1));
    const queue = [...selected];
    const results = [];
    let heavyRunning = false;
    const worker = async () => {
        while (queue.length) {
            const index = queue.findIndex((s) => !(s.heavy && heavyRunning));
            if (index === -1) {
                await new Promise((resolve) => setTimeout(resolve, 200));
                continue;
            }
            const [step] = queue.splice(index, 1);
            if (step.heavy) heavyRunning = true;
            const result = await runStep(step);
            if (step.heavy) heavyRunning = false;
            results.push(result);
            const mark = result.ok ? 'PASS' : 'FAIL';
            console.log(`${mark}  [${step.section}] ${step.id.padEnd(20)} ${(result.ms / 1000).toFixed(1)}s`);
            if (!result.ok) {
                if (CI) console.log(`::group::${step.id} output`);
                console.log(result.out.trimEnd().replace(/^/gm, '      '));
                if (CI) console.log('::endgroup::');
            }
        }
    };
    console.log(`Running ${selected.length} checks (${concurrency} at a time)...`);
    await Promise.all(Array.from({ length: concurrency }, worker));
    const failed = results.filter((r) => !r.ok).map((r) => r.step.id);
    console.log(
        failed.length
            ? `\n${failed.length} check(s) failed: ${failed.join(', ')}`
            : `\nAll ${results.length} checks passed.`,
    );
    process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(2);
});
