# Periscope: agent guidance

Periscope is a web dashboard for Kubernetes clusters, Helm releases and Zarf packages. The backend is Node 22 CommonJS
(`server.js`, `src/`), the frontend is React 19 + TypeScript + Vite (`frontend/`), and it ships as a container image, a
Helm chart (`charts/periscope`), three Zarf packages and standalone binaries.

Periscope runs with cluster-wide RBAC and opens shells and file transfers into pods, so treat every request-derived
string that reaches a path, a shell or `kubectl` as hostile.

## Required before every commit

Before creating any commit, complete **all four sections below**. Do not skip a section because the change looks small
or touches only one area. Run the commands, read the output, and fix every failure. Do not commit with a failing check,
do not use `--no-verify`, and do not weaken a rule, add a suppression or delete a test just to get green.

The fast path for all four sections is one command (needs Docker running):

```
npm run check
```

It runs every check below in parallel, prints PASS or FAIL per step with the failing output, and exits non-zero if any
step failed. `npm run check -- --list` shows the steps, `--section=2` runs one section, `--only=hadolint,knip` runs
named steps. Run the full command before committing even if you ran part of it earlier. The lefthook pre-commit hook
(`npx lefthook install`) runs only the fast subset (`format`, `lint-backend`, `typecheck-backend`, `secrets`), so it does
not replace the full run.

If a check cannot run (for example Docker is unavailable), say so explicitly in your reply and do not claim that
section passed.

### 1. Code quality: lint, format, types, dependencies, secrets

| Step | What it runs |
|---|---|
| `format` | Prettier check across the repo (4-space indent, single quotes, 120 columns). Fix with `npm run format`. |
| `lint-backend` | ESLint with `eslint-plugin-n` and `eslint-plugin-security` on `server.js`, `src/`, `scripts/`. |
| `lint-frontend` | ESLint with typescript-eslint (type-aware, including `no-floating-promises`) and the React hooks rules. |
| `typecheck-backend` | `tsc --checkJs` on the CommonJS backend (`tsconfig.json`). |
| `typecheck-frontend` | `tsc -b` on the frontend. |
| `audit` | `npm audit --omit=dev --audit-level=high` for both packages. |
| `secrets` | gitleaks on staged changes (the whole history in CI). |

Rules:

- Do not turn lint rules off to pass. A targeted `// eslint-disable-next-line <rule> -- <reason>` with a real reason is
  acceptable; blanket disables are not. `react-hooks/rules-of-hooks` and `react-hooks/static-components` must stay on.
- Never define a React component inside another component. Hoist it to module level.
- Do not add `any` in new code. Existing `any` is tracked as a warning, and `npm --prefix frontend run lint` fails if
  the warning count rises above the ceiling in `frontend/package.json` (`--max-warnings`). Lower it when you remove warnings.
- Every `async` function must `await`, every promise must be awaited, returned or explicitly `void`ed, and a rethrown
  error must carry `{ cause }`. Empty `catch {}` blocks are allowed only when swallowing is deliberate.
- Never commit secrets, tokens or passwords. Sonar reads `SONAR_TOKEN` from the environment.

### 2. Security analysis

| Step | What it runs |
|---|---|
| `semgrep` | Semgrep (javascript, typescript, react, nodejs, expressjs, secrets, dockerfile, github-actions packs). |
| `hadolint` | Dockerfile lint (`.hadolint.yaml` holds the accepted exceptions). |
| `helm-lint` | `helm lint charts/periscope`. |
| `helm-unittest` | Chart unit tests in `charts/periscope/tests/` covering all three install variants. |
| `kube-linter` | Security and best-practice checks on the chart. |
| `kubeconform` | Schema validation of the chart rendered with each `values-*.yaml`. |
| `zarf-lint` | `zarf dev lint` on `zarf.yaml`, `zarf-airgap.yaml` and `zarf-airgap-lite.yaml`. |

Rules:

- Never splice request input into a shell string. Pass it as an argument (`sh -c 'cat > "$1"' sh "$path"`) or avoid the
  shell. Use `src/utils/exec.js` (`run`, `runWithStdin`, `spawnSafe`) rather than `child_process` directly.
- Every filesystem path built from a request must go through a confining helper: `safeUploadName`, `resolveUploadPath`
  (`src/utils/oras.js`), `backupPath` (`backupService`), `dataPath` (`pvcService`), `resolveUnpackDir` (`zarfService`),
  `workspaceFileName` (`zarfRoutes`). Add a regression test that tries `../` and shell metacharacters.
- Take query parameters through `queryString()` (`src/utils/validators.js`) so an array or object cannot slip through.
- Serve command output as `text/plain`, never as sniffable HTML.
- Chart changes: a kube-linter exception goes in an `ignore-check.kube-linter.io/<check>` annotation with a written
  reason. New containers need resource requests.
- New or bumped downloads in the Dockerfile, `docker/bin-bootstrap.sh` or CI must verify a checksum or digest.

### 3. CI, supply chain and scripts

| Step | What it runs |
|---|---|
| `actionlint` | Workflow syntax, expressions and the shell inside `run:` blocks. |
| `zizmor` | Workflow security audit (permissions, template injection, unpinned actions, cache poisoning). |
| `shellcheck` | `docker/*.sh` and `deploy/shiloh/*.sh` (kept LF by `.gitattributes`). |
| `psscriptanalyzer` | The repo's `.ps1` scripts (`PSScriptAnalyzerSettings.psd1`). |

Rules:

- Workflows: grant the least `permissions` per job, pin third-party actions to a commit SHA, and pass `${{ ... }}`
  values into `run:` steps through `env:` rather than interpolating them into the script.
- Tool versions live in one place each. The pinned container images and tool versions for the checks are at the top of
  `scripts/check.mjs`. Renovate (`renovate.json`) keeps them and the Dockerfile `ARG`s current.
- When you change `.github/workflows/ci.yml`, also run `npm run check -- --only=actionlint,zizmor`.

### 4. Tests, coverage and dead code

| Step | What it runs |
|---|---|
| `test-backend` | `node --test` with coverage written to `coverage/lcov.info`. |
| `test-frontend` | `vitest run --coverage` writes `frontend/coverage/lcov.info`. |
| `build-frontend` | `tsc -b && vite build`. |
| `knip` | Unused files, dependencies and (frontend) exports. |
| `e2e` | Playwright against a live cluster. Opt-in: `npm run check -- --e2e`. |

Rules:

- Every bug fix and every security fix ships with a test that fails without the fix.
- New backend behavior gets a `*.test.js` next to the code. Tests must pass on Windows and Linux: no hard-coded
  `/etc/...` paths, and skip symlink tests on win32 with an explanatory `skip`.
- Remove dead code instead of exporting it to satisfy knip. Do not add dependencies you do not use.
- Run `npm run check -- --e2e` for changes that touch UI flows when a cluster is available.

## Code conventions

- Comments: write none unless the reason is not visible in the code (a hidden constraint, a workaround, a security
  invariant). Do not narrate what the code does.
- Backend files are CommonJS and 4-space indented. Do not convert them to ESM.
- Do not add `Co-Authored-By` or other attribution trailers to commits or PR descriptions.
- Keep commits focused. Release version bumps touch `package.json`, `zarf*.yaml`, `charts/periscope` and
  `.github/workflows/ci.yml` (`APP_VERSION`) together.

## Commands

| Command | Purpose |
|---|---|
| `npm run check` | All four sections (required before commit). |
| `npm test` | Backend unit tests. |
| `npm run lint`, `npm run format`, `npm run typecheck`, `npm run knip` | Individual backend and repo checks. |
| `npm --prefix frontend run lint`, `... run typecheck`, `... test`, `... run build` | Frontend checks. |
| `npm start` | Run the server (`PORT`, `AUTH_ENABLED`, `PERISCOPE_API_KEY`, `SCANNING_ENABLED`, `AIRGAP` and `AIRGAP_LITE` are the main toggles). |
