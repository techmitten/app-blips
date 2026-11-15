#!/usr/bin/env bash
# Deploy an existing release without bumping its version or rebuilding GitHub.
set -euo pipefail
cd "$(dirname "$0")/.."

tag="${1:-}"
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Usage: bash scripts/push-space.sh vX.Y.Z" >&2; exit 1; }
push_timeout="${HF_PUSH_TIMEOUT_SECONDS:-300}"
[[ "$push_timeout" =~ ^[1-9][0-9]*$ ]] || { echo "HF_PUSH_TIMEOUT_SECONDS must be a positive integer." >&2; exit 1; }
command -v timeout >/dev/null || { echo "Install GNU coreutils (timeout) to deploy to Hugging Face." >&2; exit 1; }
git remote get-url space >/dev/null
commit="$(git rev-parse --verify "refs/tags/$tag^{commit}")"

echo "Pushing $tag to Hugging Face (timeout: ${push_timeout}s)…"
# Bound credential helpers, connection setup, hooks and the upload together.
# Existing saved credentials still work; absent credentials fail immediately.
status=0
timeout --kill-after=5s "${push_timeout}s" env \
  GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/false SSH_ASKPASS=/bin/false \
  GCM_INTERACTIVE=never GIT_SSH_COMMAND='ssh -oBatchMode=yes -oConnectTimeout=15' \
  git -c credential.interactive=false -c http.lowSpeedLimit=1024 -c http.lowSpeedTime=30 \
  push --progress space "$commit:refs/heads/master" </dev/null || status=$?

if [ "$status" -ne 0 ]; then
  if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then
    echo "Hugging Face push timed out after ${push_timeout}s." >&2
  else
    echo "Hugging Face push failed (exit $status)." >&2
  fi
  echo "Check the Git error above, saved Hugging Face credentials and space branch history." >&2
  echo "Retry only this deployment: bash scripts/push-space.sh $tag" >&2
  echo "For a slow upload: HF_PUSH_TIMEOUT_SECONDS=900 bash scripts/push-space.sh $tag" >&2
  echo "Do not rerun npm run release for this version; the GitHub release is already prepared." >&2
  exit "$status"
fi
echo "Pushed to Hugging Face. The Space will rebuild the browser demo."
