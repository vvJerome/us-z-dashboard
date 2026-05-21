#!/usr/bin/env bash
# PostToolUse hook on Write and Edit tools.
# Scans the modified file for hardcoded environment variable values.
# Warns (exit 0) so the agent sees the finding without blocking the write.

set -uo pipefail

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""' 2>/dev/null || echo "")

# Only scan source files — skip binary, lock files, and test fixtures
if [[ -z "$FILE" ]]; then exit 0; fi
if [[ ! -f "$FILE" ]]; then exit 0; fi

case "$FILE" in
  *.py|*.ts|*.tsx|*.yml|*.yaml|*.env.template) ;;  # scan these
  *) exit 0 ;;                                       # skip everything else
esac

# Skip test files and fixture files — hardcoded values are expected there
case "$FILE" in
  */tests/*|*/test_*|*test-*|*/fixtures/*|*__pycache__*) exit 0 ;;
  *.env.template) exit 0 ;;
esac

warn() {
  echo "WARNING [post-tool-no-hardcoded-secrets]: $1" >&2
}

FOUND=0

# --- Pattern 1: API keys / tokens (long hex or base64 strings assigned to variables) ---
# Matches: SERPER_API_KEY = "abc123...", api_key="sk-...", token = "ghp_..."
if grep -nE '(api[_-]?key|token|secret|webhook[_-]?key|password|passwd)\s*[=:]\s*["'"'"'][a-zA-Z0-9+/=_\-]{20,}["'"'"']' "$FILE" 2>/dev/null | grep -qvE '(os\.environ|process\.env|getenv|secrets\.|vault\.|change-me|your-|placeholder|example|CHANGE_ME|<)'; then
  MATCHES=$(grep -nE '(api[_-]?key|token|secret|webhook[_-]?key|password|passwd)\s*[=:]\s*["'"'"'][a-zA-Z0-9+/=_\-]{20,}["'"'"']' "$FILE" 2>/dev/null | grep -vE '(os\.environ|process\.env|getenv|secrets\.|vault\.|change-me|your-|placeholder|example|CHANGE_ME|<)')
  warn "Possible hardcoded secret in $FILE:"
  echo "$MATCHES" >&2
  FOUND=1
fi

# --- Pattern 2: Kestra flow {{ envs.VAR }} replaced with literal value ---
# Catches lines like: containerImage: "ghcr.io/vvjerome/us-z-3:latest"
# where a GITHUB_ORG or IMAGE_TAG that should be dynamic is baked in
if [[ "$FILE" == *"kestra/flows"* ]]; then
  # Flag containerImage with a hardcoded owner/tag instead of {{ envs.VAR }}
  if grep -nE 'containerImage:\s*"[^{].*:[^{]*"' "$FILE" 2>/dev/null | grep -qvE '\{\{.*envs'; then
    MATCHES=$(grep -nE 'containerImage:\s*"[^{].*:[^{]*"' "$FILE" 2>/dev/null | grep -vE '\{\{.*envs')
    warn "Kestra flow has hardcoded containerImage (use {{ envs.GITHUB_ORG }} and {{ envs.IMAGE_TAG }}) in $FILE:"
    echo "$MATCHES" >&2
    FOUND=1
  fi
  # Flag webhook key that is a literal hex/alphanumeric string instead of {{ envs.VAR }}
  if grep -nE 'key:\s*"[a-f0-9]{20,}"' "$FILE" 2>/dev/null; then
    MATCHES=$(grep -nE 'key:\s*"[a-f0-9]{20,}"' "$FILE" 2>/dev/null)
    warn "Kestra flow has hardcoded webhook key (use {{ envs.KESTRA_WEBHOOK_KEY }}) in $FILE:"
    echo "$MATCHES" >&2
    FOUND=1
  fi
fi

# --- Pattern 3: IP addresses hardcoded in source (not .env.template) ---
if grep -nE '([0-9]{1,3}\.){3}[0-9]{1,3}' "$FILE" 2>/dev/null | grep -qvE '(#|127\.0\.0|0\.0\.0\.0|localhost|example|placeholder)'; then
  MATCHES=$(grep -nE '([0-9]{1,3}\.){3}[0-9]{1,3}' "$FILE" 2>/dev/null | grep -vE '(#|127\.0\.0|0\.0\.0\.0|localhost|example|placeholder)')
  warn "Hardcoded IP address found in $FILE — use an environment variable instead:"
  echo "$MATCHES" >&2
  FOUND=1
fi

if [[ $FOUND -eq 0 ]]; then
  exit 0
fi

# Exit 1 = warn the agent (non-blocking — the write already happened)
# The agent will see the warning in output and can decide to act on it.
exit 1
