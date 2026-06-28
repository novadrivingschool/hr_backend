-- Migration: make i_care.urgency nullable
-- Run this manually before deploying the new build.
-- This removes the NOT NULL constraint and the default value so records
-- can be created without an urgency; the coordinator assigns it at justify time.

ALTER TABLE i_care
  ALTER COLUMN urgency DROP NOT NULL,
  ALTER COLUMN urgency DROP DEFAULT;
