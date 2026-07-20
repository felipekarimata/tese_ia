-- Migration: Add time tracking fields to translation_jobs table
-- Description: Adds started_at, elapsed_seconds, and estimated_seconds_remaining columns

-- Add started_at column (timestamp when translation actually started)
ALTER TABLE translation_jobs
ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- Add elapsed_seconds column (seconds since translation started)
ALTER TABLE translation_jobs
ADD COLUMN IF NOT EXISTS elapsed_seconds INTEGER;

-- Add estimated_seconds_remaining column (estimated seconds remaining)
ALTER TABLE translation_jobs
ADD COLUMN IF NOT EXISTS estimated_seconds_remaining INTEGER;

-- Optional: Add index on started_at for faster queries
CREATE INDEX IF NOT EXISTS idx_translation_jobs_started_at ON translation_jobs(started_at);

-- Comment: Run this migration in Supabase SQL Editor
-- To apply: Copy and paste this SQL in Supabase Dashboard → SQL Editor → Run
