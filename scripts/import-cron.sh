#!/usr/bin/env bash
# Unattended import runner for cron. Run weekly overnight.
#
# Cron entry (Sunday 2 AM):
#   0 2 * * 0 cd /path/to/donguri && ./scripts/import-cron.sh
#
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a

LOG="logs/import-$(date +%Y%m%d-%H%M%S).log"
mkdir -p logs data

{
  echo "=== Import started: $(date) ==="

  # Download latest data files
  echo "Downloading QRank..."
  curl -fSL -o data/qrank.csv.gz https://qrank.wmcloud.org/download/qrank.csv.gz

  echo "Downloading anime-offline-database..."
  curl -fSL -o data/anime-offline-database.jsonl \
    https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database.jsonl

  # Incremental Wikidata updates (last 7 days, new + changed media)
  echo "Running incremental Wikidata update..."
  bun run src/import/incremental.ts --days=7

  # Full media import (only if subset.ndjson exists — user generates this manually)
  if [ -f data/subset.ndjson ]; then
    echo "Running full media import from subset..."
    bun run src/import/import-all.ts data/subset.ndjson \
      --full --qrank=data/qrank.csv.gz
  else
    echo "No data/subset.ndjson found, skipping full import."
  fi

  # Non-destructive updates (seasons, covers, QRank)
  echo "Running non-destructive updates..."
  bun run import:update \
    --qrank=data/qrank.csv.gz \
    --anime-offline=data/anime-offline-database.jsonl

  echo "=== Import completed: $(date) ==="
} 2>&1 | tee -a "$LOG"
