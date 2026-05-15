#!/usr/bin/env bash
# PostToolUse hook on Write and Edit tools.
# Auto-formats the modified file using ruff (Python) or prettier (TS/JSON).
# Always exits 0 — formatting failures are warnings, not blockers.

set -uo pipefail

INPUT=$(cat)

# Extract file path from tool response or input
FILE=$(echo "$INPUT" | jq -r '
  .tool_response.filePath //
  .tool_input.file_path //
  ""
' 2>/dev/null || echo "")

if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  exit 0
fi

case "$FILE" in
  *.py)
    if command -v ruff &>/dev/null; then
      ruff format "$FILE" 2>/dev/null || true
      ruff check --fix --silent "$FILE" 2>/dev/null || true
    fi
    ;;
  *.ts|*.tsx)
    if command -v npx &>/dev/null; then
      npx --yes prettier --write "$FILE" 2>/dev/null || true
    fi
    ;;
  *.json)
    # Skip package-lock.json and other generated lock files
    BASENAME=$(basename "$FILE")
    if [[ "$BASENAME" != "package-lock.json" && "$BASENAME" != "yarn.lock" ]]; then
      if command -v npx &>/dev/null; then
        npx --yes prettier --write "$FILE" 2>/dev/null || true
      fi
    fi
    ;;
esac

# LOC limit check: warn when .py or .ts/.tsx files exceed 600 lines
case "$FILE" in
  *.py|*.ts|*.tsx)
    LOC=$(wc -l < "$FILE" 2>/dev/null || echo 0)
    if (( LOC > 600 )); then
      echo ""
      echo "WARNING [LOC limit]: $FILE has $LOC lines (limit: 600)."
      echo "Split this file into focused modules before continuing. See rules/coding-standards.md."
      echo ""
    fi
    ;;
esac

exit 0
