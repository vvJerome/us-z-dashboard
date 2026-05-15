# ADR-006: Local Filesystem Storage (Deferred S3 Migration)

**Status**: Accepted (temporary)  
**Date**: 2026-05-14

## Context

The original architecture (docs/context.md) specifies Hetzner Object Storage (S3-compatible) for all file persistence: uploaded inputs, pipeline outputs, and container logs. This would require:

- S3 client library (`boto3` or `aioboto3`) in both FastAPI and the pipeline container
- Bucket credentials and endpoint in environment variables
- Pre-signed URL generation for file downloads
- Bucket setup as an external dependency before the platform can run

For the initial build, adding S3 increases time-to-first-working-job and complicates local development setup. The goal is to validate the full pipeline end-to-end (upload → Kestra trigger → container processing → dashboard status → download) before adding the storage abstraction layer.

## Decision

Store all files on the **VPS local filesystem** using a named Docker volume (`data_volume`) mounted at `/data` in both the FastAPI backend and pipeline containers.

Storage layout (within the volume):

```
/data/
├── inputs/{job_id}/input.{ext}           # written by FastAPI on job creation
├── outputs/{job_id}/result.jsonl         # written by pipeline container
├── logs/{job_id}/run.log                 # written by pipeline container
└── checkpoints/{job_id}/checkpoint.json  # written by pipeline container
```

FastAPI serves output files directly via a streaming response (`GET /api/jobs/{id}/file`) instead of generating S3 pre-signed URLs.

## Consequences

- **Simpler initial build**: no S3 client, no bucket config, no pre-signed URL logic — FastAPI reads and streams local files directly
- **Works locally**: development environment requires only Docker Compose — no cloud credentials needed
- **Single-VPS constraint**: FastAPI and pipeline containers must share the same `data_volume` Docker volume — this works on a single VPS but breaks if they ever run on separate hosts
- **Disk capacity risk**: 5 concurrent long-running jobs each potentially writing large output files — monitor VPS disk usage; add alerting if disk use exceeds 70%
- **No external file access**: files are only accessible through the FastAPI download endpoint — no direct link sharing or external tool access (acceptable for an internal team tool)

## Migration path to S3

When this ADR is superseded, the changes required are:

1. `pipeline/storage.py`: replace local file writes with `boto3` S3 uploads
2. `backend/services/storage.py`: replace local file reads with S3 `get_object`; replace streaming response with pre-signed URL generation
3. Add `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` to `.env.template` and Kestra flow env
4. Create the Hetzner Object Storage bucket and set credentials
5. Write ADR-007 to document the migration decision and update this ADR's status to Superseded

## Trigger conditions for migration

- Team size grows beyond ~5 and files need to be shared externally
- VPS disk space becomes a constraint (large output files from long-running jobs)
- FastAPI and pipeline containers need to run on separate hosts
