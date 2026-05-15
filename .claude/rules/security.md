# Security Rules

Project-specific security constraints for us-z-dashboard. These extend the global security guidelines in `~/.claude/rules/security.md`.

## Secrets and credentials

- Never log JWT secrets, database passwords, Kestra API keys, or any credential — even at DEBUG level. Use structured log fields that explicitly exclude sensitive keys.
- Never hardcode credentials in source files. Always read from environment variables (`os.environ` in Python, `import.meta.env` in Vite).
- `.env` must be in `.gitignore`. If it is not present in `.gitignore`, add it immediately and verify it is not tracked: `git ls-files .env` must return nothing.
- `.env.template` must contain only placeholder values (e.g., `DATABASE_URL=postgresql://user:password@localhost:5432/scraper`). Never put real values in `.env.template`.

## File path handling

- All file paths derived from user input — uploaded filenames, job IDs from URL parameters, config values — must be validated before use.
- Reject any path containing `..` (directory traversal). In Python: `if ".." in str(path): raise HTTPException(400, "invalid path")`.
- Construct all file paths using `pathlib.Path` in Python. Never concatenate strings to build paths from user input.
- Uploaded files must be written only under `DATA_DIR/inputs/{job_id}/`. FastAPI must validate that the resolved path starts with the expected prefix before writing.

## FastAPI route security

- All routes that will eventually need authentication must have: `# TODO: add auth`
- When JWT auth is implemented (future), use `Depends(get_current_user)` — never parse the Authorization header manually in route handlers.
- Never return raw exception messages, stack traces, or internal error details in HTTP responses. Map exceptions to appropriate HTTP status codes with safe error messages.
- Rate limiting is not required initially but add a `# TODO: add rate limiting` comment on login and file upload endpoints.

## Docker and infrastructure security

- Pipeline containers must never use the `--privileged` flag. Use specific Linux capabilities if needed.
- Kestra must bind port 8080 to `127.0.0.1` only — never `0.0.0.0:8080`. nginx must not proxy Kestra UI to external traffic.
- The Docker socket bind mount (`/var/run/docker.sock`) is restricted to the Kestra service only. No other service should mount the Docker socket.
- All services run as non-root users inside containers where possible.

## Input validation

- File uploads: validate both MIME type AND file extension (not just one — a renamed file can pass extension-only checks).
- File uploads: enforce a maximum size limit server-side (100 MB). Client-side validation is a UX guard, not a security control.
- Config JSON submitted by users: always deserialize through a Pydantic schema before any use. Never pass raw user-submitted JSON strings directly to Kestra or the pipeline.
- Never trust `Content-Type` header alone for file type validation — read the first bytes (magic bytes) if strict validation is needed.
