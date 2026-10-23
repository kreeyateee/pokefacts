#!/usr/bin/env bash
# Update pokefacts.online on the VM without taking it down.
# Builds in a clean copy of the code next to the live folder, copies the result in as .next-new
# while the site keeps serving .next, then swaps the folders and restarts.
#
# Why a separate copy: the live folder's data/ holds gigabytes of recorded speech. Turbopack
# scans the project folder, and building there needed more than the VM's 11 GB and starved the
# site. In the clean copy (code plus the few data files a build reads) it needs under 1 GB.
# Builds share one lock, so two never run at once.
set -euo pipefail

LIVE="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="${POKEFACTS_BUILD_DIR:-$HOME/pf-build}"
# The only data the build reads while it prerenders pages.
BUILD_DATA=(champdex.sqlite bulbapedia music-youtube.json)

cd "$LIVE"
git fetch origin
git merge --ff-only origin/main
npm ci --no-audit --no-fund
COMMIT="$(git rev-parse HEAD)"

if [ ! -e "$BUILD/.git" ]; then
  git worktree add --detach "$BUILD" "$COMMIT"
fi
cd "$BUILD"
git checkout -q --detach "$COMMIT"
mkdir -p data
for item in "${BUILD_DATA[@]}"; do
  rm -rf "data/$item"
  cp -r "$LIVE/data/$item" data/
done
npm ci --no-audit --no-fund
rm -rf .next
flock /tmp/pokefacts-build.lock npx next build
# Two files record the folder the build ran in. Point them at the live folder.
sed -i "s#$BUILD#$LIVE#g" .next/required-server-files.json .next/required-server-files.js

cd "$LIVE"
rm -rf .next-new
cp -a "$BUILD/.next" .next-new
rm -rf .next-new/cache

rm -rf .next-old
if [ -d .next ]; then mv .next .next-old; fi
mv .next-new .next
sudo systemctl restart pokefacts

for attempt in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:3847/; then
    echo "Live: $(git log --oneline -1)"
    exit 0
  fi
  sleep 1
done
echo "The site did not answer after the restart. Rolling back to the previous build." >&2
rm -rf .next
mv .next-old .next
sudo systemctl restart pokefacts
exit 1
