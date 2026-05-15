#!/usr/bin/env bash
# PreToolUse hook on Bash tool.
# Blocks dangerous commands before they execute.
# Exit 2 = block the tool call. Exit 0 = allow.

set -uo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")

block() {
  echo "BLOCKED by .claude/hooks/pre-tool-block-dangerous.sh: $1" >&2
  exit 2
}

# Block rm -rf targeting paths outside /tmp
if echo "$COMMAND" | grep -qE 'rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r|-rf|-fr)'; then
  # Allow /tmp and /var/tmp only
  if ! echo "$COMMAND" | grep -qE 'rm\s+-[rf]+\s+(/tmp|/var/tmp)'; then
    block "rm -rf outside /tmp detected. Use a more specific path or remove manually."
  fi
fi

# Block force push to main or master
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*(-f\b|--force\b|--force-with-lease\b)'; then
  if echo "$COMMAND" | grep -qE '\b(main|master)\b'; then
    block "Force push to main/master is not allowed. See git-workflow.md."
  fi
fi

# Block docker system prune (drops ALL images and volumes)
if echo "$COMMAND" | grep -qE 'docker\s+system\s+prune'; then
  block "docker system prune would remove all unused images and volumes. Run manually if intentional."
fi

# Block DROP TABLE / DROP DATABASE in any form
if echo "$COMMAND" | grep -qiE '\bDROP\s+(TABLE|DATABASE)\b'; then
  block "DROP TABLE/DATABASE detected. Apply schema changes via Alembic migrations instead."
fi

# Block alembic downgrade (forward-only migration policy)
if echo "$COMMAND" | grep -qE 'alembic\s+downgrade'; then
  block "alembic downgrade is blocked. Write a new forward migration instead. Use /db-migration command."
fi

# Block committing .env
if echo "$COMMAND" | grep -qE 'git\s+(add|commit).*\.env\b'; then
  if ! echo "$COMMAND" | grep -qE '\.env\.(template|example|sample)'; then
    block ".env must not be committed. It contains secrets. Add it to .gitignore."
  fi
fi

exit 0
