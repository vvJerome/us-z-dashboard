#!/usr/bin/env bash
# PostToolUse hook on Write and Edit tools.
# Runs the relevant test suite when source files change.
# Always exits 0 — test failures are surfaced as output, not hard blockers.
# The agent sees test output and can decide how to respond.

set -uo pipefail

INPUT=$(cat)

# Extract file path
FILE=$(echo "$INPUT" | jq -r '
  .tool_response.filePath //
  .tool_input.file_path //
  ""
' 2>/dev/null || echo "")

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  exit 0
fi

# Find repo root
REPO_ROOT="$(git -C "$(dirname "$FILE")" rev-parse --show-toplevel 2>/dev/null || pwd)"

# Normalize to path relative to repo root
REL="${FILE#$REPO_ROOT/}"

print_header() {
  echo ""
  echo "── Tests: $1 ──"
}

case "$REL" in
  backend/*)
    # Skip test files themselves to avoid infinite recursion
    if [[ "$REL" == backend/tests/* ]]; then
      exit 0
    fi
    if [[ -f "$REPO_ROOT/backend/pyproject.toml" || -f "$REPO_ROOT/backend/pytest.ini" || -f "$REPO_ROOT/backend/setup.cfg" ]]; then
      print_header "backend (pytest)"
      (cd "$REPO_ROOT/backend" && pytest --tb=short -q 2>&1) || true
    fi
    ;;

  dashboard/src/*)
    # Skip test files themselves
    if [[ "$REL" == *.test.ts || "$REL" == *.test.tsx || "$REL" == *.spec.ts || "$REL" == *.spec.tsx ]]; then
      exit 0
    fi
    if [[ -f "$REPO_ROOT/dashboard/package.json" ]]; then
      print_header "dashboard (vitest)"
      (cd "$REPO_ROOT/dashboard" && npx vitest run --reporter=verbose 2>&1) || true
    fi
    ;;

  pipeline/*)
    # Skip test files themselves
    if [[ "$REL" == pipeline/tests/* ]]; then
      exit 0
    fi
    if [[ -f "$REPO_ROOT/pipeline/pyproject.toml" || -f "$REPO_ROOT/pipeline/pytest.ini" || -f "$REPO_ROOT/pipeline/setup.cfg" ]]; then
      print_header "pipeline (pytest)"
      (cd "$REPO_ROOT/pipeline" && pytest --tb=short -q 2>&1) || true
    fi
    ;;

  kestra/*|docker-compose*|nginx/*|.github/*)
    # No unit tests for infra files — verify via /deploy-check before deploy
    ;;
esac

exit 0
