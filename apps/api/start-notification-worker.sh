#!/bin/sh
set -eu

node scripts/assert-prisma-client.mjs

interval_seconds="${NOTIFICATION_DISPATCH_INTERVAL_SECONDS:-300}"

while true; do
  if ! node dist/notificationDispatch.js; then
    echo "Notification dispatch cycle failed. Retrying in ${interval_seconds}s." >&2
  fi

  sleep "${interval_seconds}"
done
