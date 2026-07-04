# Third-Party Notices

Periscope's own source code is licensed under the [MIT License](LICENSE). The
container image also bundles or downloads the third-party tools listed below
so that Periscope can invoke them at runtime (cluster terminal, vulnerability
scanning, Helm/Zarf operations, packet capture, etc.). This file lists those
tools and their licenses; it does not change the license of Periscope's own
code.

## Bundled in the container image (build time)

| Tool | License | Source |
|---|---|---|
| [Zarf](https://github.com/zarf-dev/zarf) | Apache-2.0 | https://github.com/zarf-dev/zarf/blob/main/LICENSE |
| [kubectl](https://github.com/kubernetes/kubectl) | Apache-2.0 | https://github.com/kubernetes/kubectl/blob/master/LICENSE |
| [Grype](https://github.com/anchore/grype) | Apache-2.0 | https://github.com/anchore/grype/blob/main/LICENSE |
| [ORAS](https://github.com/oras-project/oras) (airgap image only) | Apache-2.0 | https://github.com/oras-project/oras/blob/main/LICENSE |

`zarf tools k9s` and `zarf tools helm`, invoked by Periscope's Cluster
Terminal and K9s features, run [K9s](https://github.com/derailed/k9s) and
[Helm](https://github.com/helm/helm) as vendored by the Zarf CLI above — both
also **Apache-2.0**.

## Downloaded at runtime

| Tool | License | Source |
|---|---|---|
| [Kubescape](https://github.com/kubescape/kubescape) | Apache-2.0 | https://github.com/kubescape/kubescape/blob/master/LICENSE |

Kubescape is fetched on demand directly from its official GitHub release
assets, not modified or rehosted.

## Data

The Grype vulnerability database cached in the air-gapped image is generated
by [anchore/grype-db](https://github.com/anchore/grype-db) from public
vulnerability feeds (NVD, GitHub Security Advisories, and distro trackers),
each freely redistributable under their respective publishers' terms.

## Base OS packages

The image is built on `node:22-alpine`. Packages installed via `apk`
(`tcpdump`, `libcap`, `zstd`, `util-linux`, `curl`, `ca-certificates`) are
unmodified Alpine Linux packages invoked as separate system processes — BSD,
MIT/curl, and GPL-2.0 licensed depending on the package — and are not linked
into or distributed as part of Periscope's own source.

## Node.js dependencies

Periscope's npm dependencies (both the server and the `frontend/` app) are
exclusively under permissive licenses (MIT, Apache-2.0, ISC, BSD-2/3-Clause,
Python-2.0, Unlicense, MPL-2.0/BlueOak/CC-BY). None are copyleft-licensed.
Run `npx license-checker --summary` in either directory to regenerate the
full list.
