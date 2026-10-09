#!/usr/bin/env bash
#
# start.sh — bring the whole application up with one command.
#
#   ./start.sh              API on :8000, UI on :3000
#   ./start.sh --lab        ... and bring the FRR lab up if it is down
#   ./start.sh --no-lab     never touch the lab
#   ./start.sh --status     what is running right now
#   ./start.sh --stop       stop the API and the UI
#   ./start.sh --help
#
# It installs what is missing (backend venv, node_modules) rather than asking
# you to, starts both services in the background, waits until they answer, and
# tells you where the logs are. Nothing here touches a lab that is already
# running: lab containers are started only when none of them are running, and
# the app itself owns reconfiguring them (Deploy in the UI).
#
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
RUN="$ROOT/.run"
VENV="$ROOT/backend/venv"
STAMP="$ROOT/backend/.venv-install-stamp"
LAB_DIR="$ROOT/backend/labs/current"
LAB_PROJECT="netrouteai"   # must match backend/lab_deploy.py:COMPOSE_PROJECT

API_HOST="127.0.0.1"
API_PORT="${API_PORT:-8000}"
UI_PORT="${UI_PORT:-3000}"
API_URL="http://${API_HOST}:${API_PORT}"
UI_URL="http://localhost:${UI_PORT}"

ACTION="start"
LAB_MODE="auto"            # auto | force | never

if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_BAD=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_OK=""; C_WARN=""; C_BAD=""; C_DIM=""; C_OFF=""
fi

ok()   { printf '  %sok%s    %s\n' "$C_OK" "$C_OFF" "$*"; }
note() { printf '  %s..%s    %s\n' "$C_DIM" "$C_OFF" "$*"; }
warn() { printf '  %swarn%s %s\n' "$C_WARN" "$C_OFF" "$*" >&2; }
die()  { printf '  %sFAIL%s %s\n' "$C_BAD" "$C_OFF" "$*" >&2; exit 1; }

usage() {
  sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

# --------------------------------------------------------------------------- #
# Small probes. curl and wget are not guaranteed to exist; python3 is, because
# the backend needs it anyway, so it is the fallback.
# --------------------------------------------------------------------------- #
have() { command -v "$1" >/dev/null 2>&1; }

http_ok() { # url -> 0 if it answered 2xx/3xx
  local url="$1"
  if have curl; then
    curl -fsS -o /dev/null -m 3 "$url" 2>/dev/null
  elif have wget; then
    wget -q -T 3 -O /dev/null "$url" 2>/dev/null
  else
    python3 - "$url" <<'PY' 2>/dev/null
import sys, urllib.request
try:
    urllib.request.urlopen(sys.argv[1], timeout=3)
    sys.exit(0)
except Exception:
    sys.exit(1)
PY
  fi
}

port_open() { # port -> 0 if something is listening on 127.0.0.1:port
  python3 - "$1" <<'PY' 2>/dev/null
import socket, sys
s = socket.socket()
s.settimeout(1)
try:
    s.connect(("127.0.0.1", int(sys.argv[1])))
    sys.exit(0)
except Exception:
    sys.exit(1)
finally:
    s.close()
PY
}

wait_for() { # label url seconds
  local label="$1" url="$2" secs="${3:-45}" i=0
  while [ "$i" -lt "$secs" ]; do
    if http_ok "$url"; then ok "$label is answering — $url"; return 0; fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

# --------------------------------------------------------------------------- #
# Prerequisites
# --------------------------------------------------------------------------- #
docker_daemon_up() {
  have docker || return 1
  docker info >/dev/null 2>&1 && return 0
  # Starting the daemon needs root. `sudo -n` either works without prompting or
  # fails immediately; it never hangs waiting for a password inside a script.
  if have systemctl && have sudo && sudo -n systemctl start docker 2>/dev/null; then
    sleep 3
    docker info >/dev/null 2>&1 && return 0
  fi
  return 1
}

check_prereqs() {
  have python3 || die "python3 not found — install it (e.g. sudo apt install python3)"
  have node || die "node not found — install Node.js 20 or newer"
  have npm || die "npm not found — it ships with Node.js"

  if docker_daemon_up; then
    ok "docker daemon reachable ($(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?'))"
  else
    warn "docker is not reachable — the app will start, but the lab cannot be built."
    warn "  start it with: sudo systemctl start docker   (and enable it to survive a reboot)"
  fi
}

ensure_backend_deps() {
  local req="$ROOT/backend/requirements.txt"
  if [ -x "$VENV/bin/uvicorn" ] && [ -f "$STAMP" ] && [ ! "$req" -nt "$STAMP" ]; then
    ok "backend dependencies installed"
    return 0
  fi
  note "installing backend dependencies (first run, or requirements.txt changed)"
  if [ ! -d "$VENV" ]; then
    python3 -m venv "$VENV" 2>/dev/null ||
      die "could not create backend/venv — on Debian/Ubuntu: sudo apt install python3-venv"
  fi
  "$VENV/bin/pip" install --quiet -r "$req" ||
    die "pip install failed — see the output above"
  touch "$STAMP"
  ok "backend dependencies installed"
}

ensure_frontend_deps() {
  local lock="$ROOT/frontend/package-lock.json"
  local stamp="$ROOT/frontend/node_modules/.package-lock.json"
  if [ -d "$ROOT/frontend/node_modules" ] && [ -f "$stamp" ] && [ ! "$lock" -nt "$stamp" ]; then
    ok "frontend dependencies installed"
    return 0
  fi
  note "installing frontend dependencies (first run, or the lockfile changed)"
  (cd "$ROOT/frontend" && npm install --no-audit --no-fund) ||
    die "npm install failed"
  ok "frontend dependencies installed"
}

# --------------------------------------------------------------------------- #
# Process control
# --------------------------------------------------------------------------- #
start_proc() { # name cwd log pidfile cmd...
  local name="$1" cwd="$2" log="$3" pidfile="$4"
  shift 4
  mkdir -p "$RUN"
  : > "$log"
  # The subshell execs, so the recorded pid is the real service — killing it
  # later does not leave an orphaned child behind.
  (cd "$cwd" && exec "$@") >>"$log" 2>&1 &
  echo $! > "$pidfile"
}

# Is whatever answers on that port the service *we* started? A health check
# alone cannot tell: `docker compose up` on the deployed stack binds the very
# same port, and reporting "already running" would send the user's `--stop` at a
# process this script never owned.
ours_running() { # pidfile
  local pidfile="$1" pid
  [ -f "$pidfile" ] || return 1
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

stop_proc() { # name pidfile
  local name="$1" pidfile="$2" pid i
  if [ ! -f "$pidfile" ]; then
    note "$name: not started by this script"
    return 0
  fi
  pid="$(cat "$pidfile" 2>/dev/null || true)"
  if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$pidfile"
    note "$name: not running"
    return 0
  fi
  # Children first (vite keeps esbuild workers), then the service itself.
  pkill -P "$pid" 2>/dev/null || true
  kill "$pid" 2>/dev/null || true
  for i in 1 2 3 4 5; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  kill -9 "$pid" 2>/dev/null || true
  rm -f "$pidfile"
  ok "stopped $name"
}

show_tail() { # log
  local log="$1"
  [ -f "$log" ] || return 0
  printf '%s\n' "${C_DIM}--- last lines of ${log#"$ROOT"/} ---${C_OFF}"
  tail -n 15 "$log" | sed 's/^/    /'
  printf '%s\n' "${C_DIM}---${C_OFF}"
}

# --------------------------------------------------------------------------- #
# The FRR lab
# --------------------------------------------------------------------------- #
lab_ps() { # args passed to `docker compose ps`
  [ -d "$LAB_DIR" ] || { echo 0; return 0; }
  (cd "$LAB_DIR" && docker compose -p "$LAB_PROJECT" ps "$@" 2>/dev/null) |
    grep -c . || true
}

lab_up() {
  [ "$LAB_MODE" = "never" ] && { note "lab: left alone (--no-lab)"; return 0; }
  if ! docker_daemon_up; then
    warn "lab: docker is not reachable, skipping"
    return 0
  fi
  if [ ! -f "$LAB_DIR/docker-compose.yml" ]; then
    note "lab: none generated yet — draw a topology and press Deploy"
    return 0
  fi

  local existing running i
  existing="$(lab_ps -aq)"
  running="$(lab_ps --status running -q)"
  if [ "$running" -gt 0 ]; then
    ok "lab: already running ($running router containers)"
    return 0
  fi

  # Two different situations, deliberately not treated the same:
  #   containers exist but none runs  -> the machine rebooted or the lab was
  #                                       stopped. Bringing them back is a start.
  #   no containers at all            -> only do that when asked (--lab); a
  #                                       missing lab is usually the user having
  #                                       torn it down from the app.
  if [ "$existing" -eq 0 ] && [ "$LAB_MODE" != "force" ]; then
    note "lab: no containers — deploy one from the designer (or ./start.sh --lab)"
    return 0
  fi

  note "lab: starting containers..."
  mkdir -p "$RUN"
  if ! (cd "$LAB_DIR" && docker compose -p "$LAB_PROJECT" up -d) >"$RUN/lab.log" 2>&1; then
    warn "lab: docker compose failed"
    show_tail "$RUN/lab.log"
    return 0
  fi

  existing="$(lab_ps -aq)"
  for i in $(seq 1 90); do
    running="$(lab_ps --status running -q)"
    [ "$running" -ge "$existing" ] && break
    sleep 1
  done
  running="$(lab_ps --status running -q)"
  if [ "$running" -gt 0 ]; then
    ok "lab: $running router containers running"
    warn "if these routers were configured before, press Deploy in the UI to re-apply"
    warn "  the OSPF configuration — a restarted container may not have the same"
    warn "  interface names the saved frr.conf refers to."
  else
    warn "lab: started but nothing is running yet; see .run/lab.log"
  fi
}

# --------------------------------------------------------------------------- #
# Actions
# --------------------------------------------------------------------------- #
do_status() {
  printf '%sNetRouteAI status%s\n' "$C_DIM" "$C_OFF"
  if http_ok "$API_URL/health"; then ok "API   $API_URL/health"; else note "API   not answering ($API_URL)"; fi
  if http_ok "$UI_URL/"; then ok "UI    $UI_URL"; else note "UI    not answering ($UI_URL)"; fi
  if docker_daemon_up; then
    local n
    n="$(lab_ps --status running -q)"
    if [ "$n" -gt 0 ]; then ok "lab   $n router containers running"; else note "lab   not running"; fi
  else
    note "lab   docker not reachable"
  fi
}

do_stop() {
  stop_proc "API"  "$RUN/backend.pid"
  stop_proc "UI"   "$RUN/frontend.pid"
  # Anything still answering was never ours — say so, rather than letting the
  # summary imply everything is down.
  if http_ok "$API_URL/health"; then
    warn "API still answers on $API_URL — it was not started by this script"
  fi
  if http_ok "$UI_URL/"; then
    warn "UI still answers on $UI_URL — it was not started by this script"
  fi
  note "the lab is left running; stop it from the app (Teardown) or:"
  note "  (cd backend/labs/current && docker compose -p $LAB_PROJECT down)"
}

do_start() {
  check_prereqs
  ensure_backend_deps
  ensure_frontend_deps

  # Don't start a second copy of something already answering — that is how you
  # end up with "address already in use" and no idea which process won.
  if http_ok "$API_URL/health"; then
    if ours_running "$RUN/backend.pid"; then
      ok "API already running — $API_URL/health"
    else
      ok "API answering on $API_URL, started outside this script — reusing it"
    fi
  elif port_open "$API_PORT"; then
    die "port $API_PORT is in use by something that is not this API.
        Stop it first (check with: ss -ltnp | grep $API_PORT)"
  else
    start_proc "API" "$ROOT/backend" "$RUN/backend.log" "$RUN/backend.pid" \
      "$VENV/bin/uvicorn" main:app --host "$API_HOST" --port "$API_PORT"
    if ! wait_for "API" "$API_URL/health" 45; then
      show_tail "$RUN/backend.log"
      die "the API did not come up"
    fi
  fi

  if http_ok "$UI_URL/"; then
    if ours_running "$RUN/frontend.pid"; then
      ok "UI already running — $UI_URL"
    else
      ok "UI answering on $UI_URL, started outside this script — reusing it"
    fi
  elif port_open "$UI_PORT"; then
    die "port $UI_PORT is in use by something that is not this UI.
        Stop it first (check with: ss -ltnp | grep $UI_PORT)"
  else
    start_proc "UI" "$ROOT/frontend" "$RUN/frontend.log" "$RUN/frontend.pid" \
      "$ROOT/frontend/node_modules/.bin/vite" --port="$UI_PORT" --host=0.0.0.0
    if ! wait_for "UI" "$UI_URL/" 60; then
      show_tail "$RUN/frontend.log"
      die "the UI did not come up"
    fi
  fi

  lab_up

  printf '\n%sNetRouteAI is up%s\n' "$C_DIM" "$C_OFF"
  printf '  UI    %s\n' "$UI_URL"
  printf '  API   %s\n' "$API_URL"
  printf '  logs  %s\n' "${RUN#"$ROOT"/}/backend.log, ${RUN#"$ROOT"/}/frontend.log"
  printf '  stop  ./start.sh --stop\n\n'
}

# --------------------------------------------------------------------------- #
while [ $# -gt 0 ]; do
  case "$1" in
    --lab)     LAB_MODE="force" ;;
    --no-lab)  LAB_MODE="never" ;;
    --stop)    ACTION="stop" ;;
    --status)  ACTION="status" ;;
    -h | --help) usage; exit 0 ;;
    *) die "unknown option: $1 (try ./start.sh --help)" ;;
  esac
  shift
done

case "$ACTION" in
  start)  do_start ;;
  stop)   do_stop ;;
  status) do_status ;;
esac
