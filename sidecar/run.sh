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
while true; do
  node sidecar/server.js
  code=$?
  # 17 is our own "the graph is unrecoverable, please restart me".
  if [ "$code" -ne 17 ]; then
    echo "[run.sh] sidecar exited with $code — not restarting."
    exit "$code"
  fi
  echo "[run.sh] restarting the sidecar..."
  sleep 1
done
