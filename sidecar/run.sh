#!/bin/sh
# Run the sidecar under a restart loop.
#
# The SmartSpectra SDK is a native library reached through synchronous
# FFI. When its processing graph enters kError it refuses every frame for
# the rest of the process's life, and it cannot be torn down and rebuilt
# from inside that process — the teardown call is itself one that does not
# return, so attempting it wedges Node's event loop and takes the HTTP
# server and the websocket down with it.
#
# So the sidecar exits on that fault instead, and this brings it back. The
# game reconnects on its own; it already retries the socket every four
# seconds.
#
#   sh sidecar/run.sh
#
cd "$(dirname "$0")/.." || exit 1
# A clean exit means we asked it to stop. Anything else is a fault we
# want to come back from, and there are two kinds:
#
#   17  — our own "the graph is unrecoverable, please restart me".
#   134 — SIGABRT. The native SmartSpectra library aborts the whole
#         process from inside its own threads ("mutex lock failed"),
#         which no Node-level handler can catch. Previously this killed
#         the sidecar for the rest of the session and took Presage,
#         Backboard and the Tiger Data writes down with it, silently —
#         the game kept running on the in-browser fallback and nothing
#         said why. Restarting is strictly better than staying dead.
#
# A crash loop is the one thing worse than a crash, so back off and give
# up if it cannot stay alive.
fails=0
while true; do
  started=$(date +%s)
  node sidecar/server.js
  code=$?
  if [ "$code" -eq 0 ]; then
    echo "[run.sh] sidecar exited cleanly."
    exit 0
  fi
  # Anything that survived a minute counts as a fresh start, not a loop.
  if [ $(( $(date +%s) - started )) -gt 60 ]; then fails=0; fi
  fails=$(( fails + 1 ))
  if [ "$fails" -gt 5 ]; then
    echo "[run.sh] sidecar died $fails times in a row (last code $code) — giving up."
    echo "[run.sh] The game keeps working: it falls back to reading your pulse in the browser."
    exit "$code"
  fi
  echo "[run.sh] sidecar exited with $code — restarting ($fails/5)..."
  sleep 2
done
