#!/usr/bin/env bash
# Local stand-in for SonarCloud on the files changed against origin/main (or $BASE): run it before every push.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
base="${BASE:-origin/main}"
merge_base="$(git merge-base "$base" HEAD)"
changed() {
  git diff --name-only --diff-filter=d "$merge_base" -- "$@"
  git ls-files --others --exclude-standard -- "$@"
  return 0
}
only_changed() {
  local prefix="$1"
  local spec="${prefix:-.}"
  python3 scripts/changed_lines.py "$prefix" <(git diff -U0 "$merge_base" -- "$spec") <(git ls-files --others --exclude-standard -- "$spec")
  return $?
}
status=0

mapfile -t py < <(changed 'backend/*.py' | sed 's#^backend/##' | sort -u)
if ((${#py[@]})); then
  # S7503 async without await, S5778 one call in pytest.raises, S9073 composite asserts, S* security.
  (cd backend && ruff check --preview --select RUF029,PT011,PT012,PT018,S --output-format concise "${py[@]}" || true) | only_changed backend/ || status=1
  mapfile -t app < <(printf '%s\n' "${py[@]}" | grep '^app/' || true)
  if ((${#app[@]})); then
    # S3776 cognitive complexity, the threshold SonarCloud uses.
    (cd backend && uvx -q --with flake8-cognitive-complexity flake8 --select CCR001 --max-cognitive-complexity 15 "${app[@]}" 2>/dev/null || true) | only_changed backend/ || status=1
  fi
fi

mapfile -t tools < <(changed 'scripts/*.py' '.github/scripts/*.py' | sort -u)
if ((${#tools[@]})); then
  (ruff check --preview --select RUF029,S --output-format concise "${tools[@]}" || true) | only_changed "" || status=1
fi

# Only files the TypeScript project covers: the type-aware rules need it.
mapfile -t fe < <(changed 'frontend/src/*.ts' 'frontend/src/*.svelte' 'frontend/tests/*.ts' 'frontend/e2e/*.ts' | sed 's#^frontend/##' | sort -u)
if ((${#fe[@]})); then
  (cd frontend && npx --no-install eslint --config eslint.sonar.config.js --format json "${fe[@]}" || true) | only_changed frontend/ || status=1
fi

exit "$status"
