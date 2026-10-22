#!/usr/bin/env bash
# Update pokefacts.online on the VM without taking it down.
# Builds into .next-new while the site keeps serving .next, then swaps the folders and restarts.
# Builds share one lock: a build needs most of the VM's memory, so two at once get killed.
set -euo pipefail

cd "$(dirname "$0")/.."
git fetch origin
git merge --ff-only origin/main
npm ci --no-audit --no-fund

rm -rf .next-new
POKEFACTS_DIST_DIR=.next-new flock /tmp/pokefacts-build.lock npx next build

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
