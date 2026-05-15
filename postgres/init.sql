-- Creates the kestra database alongside the main scraper database.
-- The scraper database is created automatically by POSTGRES_DB env var.
-- This script runs once on first container start (idempotent).
SELECT 'CREATE DATABASE kestra'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'kestra')
\gexec
