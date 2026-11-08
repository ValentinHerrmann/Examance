#!/usr/bin/env bash
# Runs a command until it succeeds, up to $1 attempts with doubling waits (10 s, 20 s, 40 s, … capped at 60 s): GitHub answers pushes and downloads with 5xx during its own incidents.
# Usage: retry.sh <attempts> <command> [args…]. Only for idempotent commands (force-pushes, downloads).
set -euo pipefail

attempts="$1"
shift
wait=10
for ((i = 1; i <= attempts; i++)); do
  if "$@"; then
    exit 0
  fi
  if ((i == attempts)); then
    echo "Giving up after ${attempts} attempts: $*" >&2
    exit 1
  fi
  echo "Attempt ${i}/${attempts} failed; retrying in ${wait}s: $*" >&2
  sleep "$wait"
  wait=$((wait * 2 > 60 ? 60 : wait * 2))
done
