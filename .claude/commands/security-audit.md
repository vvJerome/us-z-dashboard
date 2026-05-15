---
description: Security audit of files changed on the current branch vs main. Outputs CRITICAL / HIGH / MEDIUM labeled findings.
allowed-tools: [Bash, Read]
---

Run a security audit on files changed in the current branch compared to `main`. Output severity-labeled findings.

## Step 1: Identify changed files

```bash
git diff --name-only main...HEAD
```

If the output is empty: output "No files changed from main — nothing to audit." and stop.

## Step 2: Filter to auditable file types

Audit only: `*.py`, `*.ts`, `*.tsx`, `*.yml`, `*.yaml`, `*.json`, `*.sh`, `*.env*`, `Dockerfile*`

Skip: `*.md`, `*.txt`, `*.lock`, `*.png`, `*.jpg`

## Step 3: Run checks

### CRITICAL — block merge

**Hardcoded secrets**: credentials embedded in source code
```bash
grep -rn -E "(password|api_key|secret|token)\s*=\s*['\"][^$\{]" {changed_files}
grep -rn -E "sk-[a-zA-Z0-9]{20,}" {changed_files}
```

**Path traversal**: unvalidated user input in file path construction
```bash
grep -rn -E '\.\./' {changed_files}
grep -rn -E 'os\.path\.join.*request\.' {changed_files}
```

**Shell injection**: subprocess with user-controlled input and shell=True
```bash
grep -rn "shell=True" {changed_files}
```

**Privileged Docker**: containers with elevated permissions
```bash
grep -rn "\-\-privileged" {changed_files}
grep -rn "privileged:\s*true" {changed_files}
```

### HIGH — must fix before merge

**SQL injection**: raw string interpolation in database queries
```bash
grep -rn -E 'execute\(f["\"]' {changed_files}
grep -rn -E 'execute\("[^"]*%s' {changed_files}
grep -rn -E 'execute\(.*\.format\(' {changed_files}
```

**Missing auth markers**: FastAPI routes with no auth and no TODO marker
```bash
grep -rn -E "@(app|router)\.(get|post|put|delete|patch)\(" {changed_files} | while read -r match; do
  file=$(echo "$match" | cut -d: -f1)
  line=$(echo "$match" | cut -d: -f2)
  # Check surrounding context for auth dependency or TODO marker
  context=$(sed -n "$((line-1)),$((line+5))p" "$file")
  if ! echo "$context" | grep -qE "(Depends\(get_current_user\)|# TODO: add auth)"; then
    echo "$match — no auth guard or TODO marker"
  fi
done
```

**Kestra UI exposed publicly**: port 8080 bound to 0.0.0.0
```bash
grep -rn '"8080:8080"' {changed_files}
grep -rn "0\.0\.0\.0:8080" {changed_files}
```

### MEDIUM — informational

**Debug mode outside test files**:
```bash
grep -rn -E "DEBUG\s*=\s*True" {changed_files} | grep -v "test_\|_test\."
```

**Broad exception handling**:
```bash
grep -rn -E "^(\s*)except(\s*):(\s*)$" {changed_files}
grep -rn "except Exception:" {changed_files}
```

**Missing .env in .gitignore**:
```bash
grep -q "^\.env$" .gitignore || echo "MEDIUM: .env not in .gitignore"
```

## Step 4: Output report

```
SECURITY AUDIT — {branch} vs main
Files audited: {count}

[CRITICAL] backend/services/kestra.py:14 — hardcoded API key: api_key = "kst-..."
[HIGH]     backend/routers/jobs.py:88 — POST /jobs has no auth guard or TODO marker
[MEDIUM]   pipeline/processor.py:201 — broad except clause

Summary: 1 CRITICAL, 1 HIGH, 1 MEDIUM

CRITICAL issues must be resolved before merging.
HIGH issues should be resolved before merging.
MEDIUM issues are informational.
```

If no findings: "No security issues found in {count} changed files."
