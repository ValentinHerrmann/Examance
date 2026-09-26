#!/usr/bin/env bash
# Blocks until Cloudflare Pages has finished building and publishing <sha>.
#
# Cloudflare Pages builds the `preview`/`release` branches through its git
# integration, outside GitHub Actions. It reports the result as a check run
# ("Cloudflare Pages: <project>", app `cloudflare-workers-and-pages`) on the
# commit it built, so the deploy workflows can wait on that check with their
# own GITHUB_TOKEN instead of needing a Cloudflare API token.
#
# Usage: wait-for-cloudflare-pages.sh <sha> [timeout-seconds]
# Needs GH_TOKEN (with `checks: read`) and GITHUB_REPOSITORY in the environment.
set -euo pipefail

SHA="${1:?commit sha required}"
TIMEOUT="${2:-900}"
INTERVAL=5
DEADLINE=$(( $(date +%s) + TIMEOUT ))

echo "Waiting for Cloudflare Pages to deploy ${SHA} (timeout ${TIMEOUT}s)"
while :; do
  # The newest Cloudflare Pages check run on the commit, as "status conclusion url".
  # A request error (rate limit, transient 5xx) just counts as "not yet".
  RUN=$(gh api "repos/${GITHUB_REPOSITORY}/commits/${SHA}/check-runs?per_page=100" \
    --jq '[.check_runs[]
           | select(.app.slug == "cloudflare-workers-and-pages"
                    and (.name | startswith("Cloudflare Pages")))]
          | sort_by(.started_at) | last
          | select(. != null)
          | "\(.status) \(.conclusion) \(.details_url)"' 2>/dev/null || true)

  if [ -n "$RUN" ]; then
    read -r STATUS CONCLUSION URL <<< "$RUN"
    if [ "$STATUS" = "completed" ]; then
      if [ "$CONCLUSION" = "success" ]; then
        echo "Cloudflare Pages deployment succeeded: ${URL}"
        exit 0
      fi
      echo "::error::Cloudflare Pages deployment finished with '${CONCLUSION}': ${URL}"
      exit 1
    fi
    echo "  Cloudflare Pages: ${STATUS}"
  else
    echo "  Cloudflare Pages: no check run yet"
  fi

  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "::error::Timed out after ${TIMEOUT}s waiting for Cloudflare Pages to deploy ${SHA}"
    exit 1
  fi
  sleep "$INTERVAL"
done
