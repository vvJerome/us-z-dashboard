#!/usr/bin/env bash
# PostToolUse hook on all tools.
# Appends a timestamped audit log entry to .claude/audit.log.
# Always exits 0.

set -uo pipefail

INPUT=$(cat)

# Find repo root (fall back to current directory)
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
LOG_FILE="$REPO_ROOT/.claude/audit.log"

TOOL=$(echo "$INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null || echo "unknown")

# Extract the most descriptive field depending on tool type
DETAIL=$(echo "$INPUT" | jq -r '
  .tool_response.filePath //
  .tool_input.file_path //
  (.tool_input.command | if . then (. | .[0:100]) else null end) //
  (.tool_input.description | if . then (. | .[0:100]) else null end) //
  ""
' 2>/dev/null || echo "")

STATUS=$(echo "$INPUT" | jq -r '
  if .tool_response.error then "error"
  elif .tool_response == null then "unknown"
  else "success"
  end
' 2>/dev/null || echo "unknown")

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "[$TIMESTAMP] TOOL=$TOOL DETAIL=${DETAIL} STATUS=$STATUS" >> "$LOG_FILE" 2>/dev/null || true

exit 0
