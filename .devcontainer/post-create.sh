#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

pnpm install --frozen-lockfile
node --import tsx scripts/prepare-browser.ts
pnpm db:migrate
pnpm db:seed

printf 'ATLAS ist eingerichtet. Die Browser-Vorschau startet automatisch.\n'
