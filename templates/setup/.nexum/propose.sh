#!/bin/sh
# Sends ext proposals and txt usage from the message log to NiHanDK/nexum-lang, then archives the log.
# Run by a Claude Code Stop hook (see settings-hook.json) or by hand.
set -e
cd "$(dirname "$0")/.."
LOG=.nexum/log/messages.nx
[ -s "$LOG" ] || exit 0
SETUP="${NEXUM_SETUP:-$(basename "$PWD")}"
if node .nexum/nx.mjs propose "$LOG" --setup "$SETUP"; then
  mv "$LOG" ".nexum/log/sent-$(date +%Y%m%d-%H%M%S).nx"
fi
