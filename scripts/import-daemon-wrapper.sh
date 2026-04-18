#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

bun run import:daemon:once 2>&1 | tee -a logs/import-daemon.log
