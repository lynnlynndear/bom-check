#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${BOM_V3_PORT:-8093}"
PID_FILE="$ROOT_DIR/.tmp/bom-v3-${PORT}.pid"
LOG_FILE="$ROOT_DIR/.tmp/bom-v3-${PORT}.log"

mkdir -p "$ROOT_DIR/.tmp"

python_bin() {
  if [ -x "$ROOT_DIR/.venv/bin/python" ]; then
    echo "$ROOT_DIR/.venv/bin/python"
  else
    command -v python3
  fi
}

is_running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1
}

start() {
  if is_running; then
    echo "BOM-v3 is already running: http://127.0.0.1:${PORT}/"
    return
  fi
  cd "$ROOT_DIR"
  nohup "$(python_bin)" -m uvicorn backend.app.main:app --host 127.0.0.1 --port "$PORT" >"$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  sleep 1
  echo "BOM-v3 started: http://127.0.0.1:${PORT}/"
}

stop() {
  if is_running; then
    kill "$(cat "$PID_FILE")"
    rm -f "$PID_FILE"
    echo "BOM-v3 stopped."
  else
    rm -f "$PID_FILE"
    echo "BOM-v3 is not running."
  fi
}

status() {
  if is_running; then
    echo "running pid=$(cat "$PID_FILE") url=http://127.0.0.1:${PORT}/"
  else
    echo "stopped"
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  logs) tail -n 120 -f "$LOG_FILE" ;;
  run)
    cd "$ROOT_DIR"
    "$(python_bin)" -m uvicorn backend.app.main:app --host 127.0.0.1 --port "$PORT"
    ;;
  *) echo "Usage: $0 {start|stop|restart|status|logs|run}" >&2; exit 1 ;;
esac
