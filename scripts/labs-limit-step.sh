#!/usr/bin/env bash
# One step of raising the site's limit for Yoto voice jobs (src/lib/labs-jobs.ts, siteJobLimit).
# Run hourly. If sends had to wait in line in the last hour and none met a 429 from Yoto, the limit goes
# up by STEP; if nobody waited, it stays where it is. If any send met a 429, it goes back to the last
# limit that met none, and a stop file ends the stepping. The server reads
# data/labs-limit.json again within half a minute, so no restart is needed.
#   Loop:  nohup setsid bash -c 'while [ ! -f ~/labs-limit.stop ]; do bash scripts/labs-limit-step.sh; sleep 3600; done' &
set -euo pipefail

cd "$(dirname "$0")/.."
FILE=data/labs-limit.json
LOG=~/labs-limit.log
STEP=10
BUILT_IN=12

now=$(jq -r '.siteJobs // empty' "$FILE" 2>/dev/null || true)
now=${now:-$BUILT_IN}

# The send summaries count Yoto's 429s per send. Any summary in the last hour with one means Yoto pushed back.
hour=$(sudo journalctl -u pokefacts --since "1 hour ago" --no-pager -o cat 2>/dev/null || true)
refused=$(printf '%s\n' "$hour" | grep -c 'refused 429 x[1-9]' || true)
waited=$(printf '%s\n' "$hour" | grep -c '\[labs line\]' || true)
sends=$(printf '%s\n' "$hour" | grep -o 'send s[a-z0-9]*:' | sort -u | wc -l)

if [ "$refused" -gt 0 ]; then
  back=$(( now - STEP > BUILT_IN ? now - STEP : BUILT_IN ))
  printf '{"siteJobs": %d}\n' "$back" > "$FILE"
  touch ~/labs-limit.stop
  echo "$(date -Is) limit $now met Yoto 429s ($refused summaries, $sends sends, $waited waits): back to $back, stopped" >> "$LOG"
elif [ "$waited" -gt 0 ]; then
  up=$(( now + STEP ))
  printf '{"siteJobs": %d}\n' "$up" > "$FILE"
  echo "$(date -Is) limit $now: sends waited in line ($waited waits, $sends sends) and no 429s; raised to $up" >> "$LOG"
else
  echo "$(date -Is) limit $now: nobody waited in line ($sends sends) and no 429s; kept at $now" >> "$LOG"
fi
