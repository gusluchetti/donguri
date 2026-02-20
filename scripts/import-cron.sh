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

  # Unified import: media (if subset exists) + percentiles + seasons + covers
  echo "Running unified import pipeline..."
  bun run import:update --all \
    --qrank=data/qrank.csv.gz \
    --anime-offline=data/anime-offline-database.jsonl

  echo "=== Import completed: $(date) ==="
} 2>&1 | tee -a "$LOG"
