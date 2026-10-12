#!/usr/bin/env bash
# Runner-side guard (ACTIONS_RUNNER_HOOK_JOB_STARTED). The repo is public, so refuse any job
# on this machine that isn't a tag push to jdmldm1/Periscope — e.g. a fork PR that targets
# the self-hosted label. Installed to /etc/github-runner/ (root-owned), not run from the checkout.
set -euo pipefail

if [[ "${GITHUB_REPOSITORY:-}" != "jdmldm1/Periscope" ]] \
   || [[ "${GITHUB_EVENT_NAME:-}" != "push" ]] \
   || [[ "${GITHUB_REF:-}" != refs/tags/v* ]]; then
  echo "Refusing job: repo=${GITHUB_REPOSITORY:-} event=${GITHUB_EVENT_NAME:-} ref=${GITHUB_REF:-}" >&2
  exit 1
fi
