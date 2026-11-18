#!/usr/bin/env bash
# One-command desktop release: npm run release [patch|minor|major|store]
#
# Bumps the version, pushes the matching v* tag (which starts the Desktop
# workflow), waits for GitHub to build the Linux installers and the Microsoft
# Store package, then publishes the draft release once you confirm. GitHub
# publishes nothing unless every build succeeds (a draft release, a Store
# submission that goes live by itself once certified, and the snap on stable).
# `npm run release store` skips all of that: it only builds and submits the
# Microsoft Store package for the latest release tag, or another one: `npm run release store v0.1.35` (no version bump).
# See notes/RELEASING.md for the manual steps this automates.
set -euo pipefail

cd "$(dirname "$0")/.."

bump="${1:-patch}"
case "$bump" in
  patch|minor|major|store) ;;
  *) echo "Usage: npm run release [patch|minor|major|store]   (default: patch)"; exit 1 ;;
esac

say()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31mStopped:\033[0m %s\n' "$*"; exit 1; }
ask()  { local reply; read -r -p "$1 [y/N] " reply; [[ "$reply" =~ ^[Yy]$ ]]; }

# --- Safety checks: only release a clean, pushed master ----------------------
command -v gh >/dev/null || fail "The GitHub CLI (gh) is not installed."
gh auth status >/dev/null 2>&1 || fail "Not signed in to GitHub. Run: gh auth login"

# --- Store only: build and submit just the Microsoft Store package -----------
if [ "$bump" = "store" ]; then
  git fetch --quiet --tags origin
  git show origin/master:.github/workflows/desktop.yml 2>/dev/null | grep -q store_only \
    || fail "GitHub's master doesn't have the Store workflow yet. Commit and push first."
  tag="${2:-$(git describe --tags --abbrev=0 --match 'v*' origin/master 2>/dev/null || true)}"
  git rev-parse -q --verify "refs/tags/$tag" >/dev/null || fail "Tag '$tag' not found."
  say "Microsoft Store only: build $tag and send it for certification (no version bump, no Linux build, no GitHub release)"
  echo "The Store rejects a version it already has. To use another tag: npm run release store vX.Y.Z"
  ask "Send $tag to the Microsoft Store for certification?" || fail "Cancelled. Nothing was changed."
  gh workflow run desktop.yml --ref master -f store_only=true -f tag="$tag"
  sleep 8
  run_id="$(gh run list --workflow desktop.yml --branch master --event workflow_dispatch --limit 1 --json databaseId --jq '.[0].databaseId')"
  say "Building and uploading (a few minutes)…"
  gh run watch "$run_id" --exit-status --interval 20 || fail "The Store job failed. See: $(gh run view "$run_id" --json url --jq .url)"
  say "Sent for certification (usually a few days). It goes live in the Store automatically when it passes."
  exit 0
fi

[ "$(git branch --show-current)" = "master" ] || fail "You are not on master. Switch with: git checkout master"
[ -z "$(git status --porcelain)" ] || fail "You have unsaved (uncommitted) changes. Commit or discard them first."
git fetch --quiet origin
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/master)" ] || fail "master is not in sync with GitHub. Run git pull and git push first."

current="$(node -p "require('./package.json').version")"
next="$(node -e "
  const [a, b, c] = '$current'.split('.').map(Number);
  console.log({ major: [a + 1, 0, 0], minor: [a, b + 1, 0], patch: [a, b, c + 1] }['$bump'].join('.'));
")"
tag="v$next"
git rev-parse -q --verify "refs/tags/$tag" >/dev/null && fail "Tag $tag already exists."

say "Checking the code (lint)…"
npm run lint --silent || fail "Lint found problems. Fix them, then run this again."

# Nothing updates docs/ automatically (Mintlify only publishes it), so show
# what changed since the last release and make sure the docs kept up.
last_tag="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || true)"
if [ -n "$last_tag" ]; then
  say "Changes since $last_tag:"
  git log --oneline --no-merges "$last_tag"..HEAD -- . ':!docs' | sed 's/^/  /'
  docs_changes="$(git diff --stat "$last_tag"..HEAD -- docs | tail -1)"
  echo "  docs/: ${docs_changes:-no changes}"
  ask "Are the docs up to date with these changes?" || fail "Update docs/ first (ask Claude to check it against $last_tag), then run this again."
fi

say "Ready to release $current -> $next"
ask "Bump the version and start the GitHub build?" || fail "Cancelled. Nothing was changed."

# --- Bump, commit, tag, push -------------------------------------------------
say "Bumping version to $next…"
npm version "$next" --no-git-tag-version >/dev/null
git commit -q -am "chore: release $tag"
git push -q origin master
git tag "$tag"
git push -q origin "$tag"

# --- Wait for the Desktop workflow -------------------------------------------
say "Waiting for GitHub to start the build…"
run_id=""
for _ in $(seq 1 30); do
  run_id="$(gh run list --workflow desktop.yml --branch "$tag" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
  [ -n "$run_id" ] && break
  sleep 5
done
[ -n "$run_id" ] || fail "The build didn't start. Check the Actions tab on GitHub."

say "Building (this usually takes 10-20 minutes)…"
if ! gh run watch "$run_id" --exit-status --interval 30; then
  fail "The GitHub build failed, so nothing was published. See: $(gh run view "$run_id" --json url --jq .url)
If the fix was outside the code (e.g. a pending Partner Center submission,
or an expired secret), rerun just the failed jobs once the run has finished:
  gh run rerun $run_id --failed
then publish the draft: gh release edit $tag --draft=false --notes \"...\"
If the code needed fixing, delete the tag:
  git tag -d $tag && git push origin :refs/tags/$tag
then tag the fixed commit and push it again: git tag $tag && git push origin $tag"
fi

# --- Publish -----------------------------------------------------------------
say "Build finished. The draft release $tag is ready on GitHub."
echo "Already out: the snap (App Center users get it now). The Microsoft Store"
echo "version is in certification and goes live automatically when it passes."
echo "Installers: $(gh release view "$tag" --json assets --jq '[.assets[].name] | join(", ")')"
echo
if ask "Publish $tag on GitHub now? AppImage and .deb users will start getting the update."; then
  read -r -p "Release notes (one line, what changed): " notes
  gh release edit "$tag" --draft=false --notes "${notes:-Improvements and fixes.}" >/dev/null
  say "Published! $(gh release view "$tag" --json url --jq .url)"
else
  say "Left as a draft. Publish it later at: $(gh release view "$tag" --json url --jq .url)"
fi
