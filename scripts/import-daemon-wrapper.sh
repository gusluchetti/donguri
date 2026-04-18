#!/bin/bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

# ==============================================================================
# PRE-FLIGHT CHECKS - Fail explicitly on missing dependencies
# ==============================================================================

echo "[wrapper] Running pre-flight checks..." >&2

# Check if bun is available
if ! command -v bun &> /dev/null; then
  echo "ERROR: bun command not found. Please install bun first." >&2
  echo "Visit: https://bun.sh" >&2
  exit 1
fi

# Check if package.json exists
if [ ! -f "package.json" ]; then
  echo "ERROR: package.json not found. This script must be run from repository root." >&2
  exit 1
fi

# Check logs directory
mkdir -p logs

# ==============================================================================
# LOCK FILE MANAGEMENT - Clean up stale locks
# ==============================================================================

LOCK_FILE="/tmp/donguri-import.pid"

if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE")
  if ! kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[wrapper] Found stale lock file (PID $LOCK_PID not running), cleaning up..." >&2
    rm -f "$LOCK_FILE"
  else
    echo "ERROR: Import daemon already running as PID $LOCK_PID" >&2
    echo "       To force restart, kill process $LOCK_PID manually" >&2
    exit 1
  fi
fi

# ==============================================================================
# CLEANUP HANDLER - Ensure proper shutdown
# ==============================================================================

cleanup() {
  local exit_code=$?
  local signal=$1

  if [ -n "$signal" ]; then
    echo "[wrapper] Received signal $signal" >&2
  fi

  echo "[wrapper] Exiting with code $exit_code" >&2

  # Clean up lock file if we owned it
  if [ -f "$LOCK_FILE" ]; then
    OUR_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [ "$OUR_PID" = "$$" ]; then
      rm -f "$LOCK_FILE"
    fi
  fi

  # Small delay for log flush
  sleep 0.1
  exit $exit_code
}

trap 'cleanup SIGTERM' SIGTERM
trap 'cleanup SIGINT' SIGINT
trap 'cleanup EXIT' EXIT

# ==============================================================================
# EXECUTION - Run import daemon with proper signal handling
# ==============================================================================

# Create lock file with our PID
echo $$ > "$LOCK_FILE"

# Log wrapper start
START_TIME=$(date -Iseconds)
echo "[wrapper] Starting import daemon: $START_TIME" | tee -a logs/import-daemon.log

# Run import daemon with explicit error handling
# Node directly inherits signals, so tmux should work properly
set +e  # Temporarily disable exit on error to capture bun exit code
bun run src/import/main.ts 2>&1 | tee -a logs/import-daemon.log
DAEMON_EXIT_CODE=${PIPESTATUS[0]}
set -e  # Re-enable strict mode

# Check result
if [ $DAEMON_EXIT_CODE -eq 0 ]; then
  echo "[wrapper] Import daemon completed successfully: $(date -Iseconds)" | tee -a logs/import-daemon.log
  exit 0
else
  echo "[wrapper] ERROR: Import daemon failed with exit code $DAEMON_EXIT_CODE" | tee -a logs/import-daemon.log
  exit $DAEMON_EXIT_CODE
fi