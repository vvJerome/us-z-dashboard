# ADR-002: Use HTTP Polling Instead of WebSocket for Job Status

**Status**: Accepted  
**Date**: 2026-05-14

## Context

The dashboard needs to show live job status updates as scraper jobs move through QUEUED → RUNNING → COMPLETED/FAILED. The implementation options are:

1. **Short-poll**: Dashboard calls `GET /api/jobs` on a fixed interval
2. **WebSocket**: Persistent bidirectional connection; server pushes updates as they happen
3. **Server-Sent Events (SSE)**: One-way persistent stream from server to browser

Job durations range from hours to days. Status transitions happen at most a handful of times per job lifetime (state machine with ~5 states total). The latency difference between 10-second polling and real-time push is imperceptible given this time scale.

## Decision

Use **10-second HTTP polling** via TanStack Query's `refetchInterval: 10_000` on `GET /api/jobs`.

Rationale:

- For jobs running over hours or days, a 10-second delay in seeing a state change is invisible to users
- Polling requires no persistent connection infrastructure — nginx and FastAPI handle it as ordinary HTTP requests with no special configuration
- No server-side connection tracking, reconnection protocol, or heartbeat management
- TanStack Query provides polling, error retry, background refetching, and stale-data handling out of the box — zero custom infrastructure
- Log viewer polls the same endpoint on the same interval — consistent pattern across the app

## Consequences

- Status updates are visible within 10 seconds of an actual state change — fully acceptable given job durations
- Request volume: 1 request per 10 seconds per open browser session × max 5 users = 0.5 req/s — negligible
- Log viewer also polls every 10 seconds — acceptable since log content changes gradually during long runs; for a 3-day job, this is perfectly appropriate
- If sub-second updates are ever needed (unlikely for this use case), migrating to SSE is the next step — SSE is easier to add to FastAPI than WebSocket and requires no client-side library
- No WebSocket dependency in the stack — one less thing to configure in nginx and manage in the backend
