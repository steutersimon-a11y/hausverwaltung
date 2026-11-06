#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
mkdir -p work

app_url="$(node --env-file-if-exists=.env --eval 'console.log(process.env.APP_URL ?? "http://127.0.0.1:3000")')"
local_login_url='http://127.0.0.1:3000/login'

if ! curl --fail --silent --max-time 3 --output /dev/null "$local_login_url"; then
  nohup pnpm dev > work/browser-preview.log 2>&1 < /dev/null &
  preview_pid=$!

  for attempt in {1..120}; do
    if curl --fail --silent --max-time 3 --output /dev/null "$local_login_url"; then
      break
    fi
    if ! kill -0 "$preview_pid" 2>/dev/null; then
      printf 'ATLAS konnte nicht starten. Details stehen in work/browser-preview.log.\n' >&2
      exit 1
    fi
    sleep 1
  done
fi

if ! curl --fail --silent --max-time 3 --output /dev/null "$local_login_url"; then
  printf 'ATLAS ist noch nicht bereit. Details stehen in work/browser-preview.log.\n' >&2
  exit 1
fi

printf '\nATLAS ist bereit: %s/login\n' "${app_url%/}"
printf 'Falls kein Tab aufgeht: Ports → 3000 → Open in Browser. Sichtbarkeit: Private.\n'
