---
description: Generate and apply an Alembic database migration. Shows the generated file for review before applying.
allowed-tools: [Bash, Read]
---

Generate and apply an Alembic migration for the us-z backend. Follow these steps exactly — do not skip the review step.

## Step 1: Ask for migration description

Ask the user: "Describe this migration in a few words (used as the Alembic message, e.g. 'add error_message to jobs', 'create users table')"

## Step 2: Generate the migration

```bash
cd backend && alembic revision --autogenerate -m "{migration-message}"
```

Read the generated file from `backend/alembic/versions/` and display its full content to the user.

## Step 3: Review gate

Ask: "Does this migration look correct? Reply **yes** to apply, or describe what needs to change."

- If the user says yes: proceed to Step 4
- If the user describes a change: edit the migration file, show the diff, and re-ask
- If autogenerate produced an **empty migration** (no `op.` calls in `upgrade()`): tell the user "No schema changes detected — the migration is empty. Make sure your SQLAlchemy models are updated before running autogenerate." Then stop — do not apply an empty migration.

## Step 4: Apply the migration

```bash
cd backend && alembic upgrade head
```

## Step 5: Verify

```bash
cd backend && alembic current
```

Output the current revision and confirm the migration was applied successfully.

## Safety rules

- **Never run `alembic downgrade`** without explicit user instruction asking for it by name
- **Warn on jobs table changes**: if the migration touches columns on the `jobs` table, tell the user: "This migration modifies the jobs table. Running jobs may be affected if their rows are read during the migration. Ensure no jobs are RUNNING before applying."
- **Never apply without user confirmation** — always show the migration file and wait for approval
- **Migrations are irreversible in spirit**: even if `downgrade()` is present, inform the user that the preferred rollback path is a new forward migration, not a downgrade
