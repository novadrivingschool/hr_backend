-- Migration: LOA department logs (bitácoras) + returned-to-work flow
-- Run this manually before deploying the new build (synchronize=false).
--
-- ADITIVA — no toca filas existentes. Se suma a migration_leave_of_absence.sql,
-- que ya debe estar corrida (crea la tabla base).
--
-- department_logs guarda, por departamento (it/sales/education/calendar/fleet),
-- su bitácora de comentarios+evidencia y sus dos checkboxes (attended,
-- reactivated). returned_to_work es el flag exclusivo de HR que dispara la
-- fase de reactivación.
--
-- Filas existentes quedan con department_logs = '{}' (DEFAULT de abajo). El
-- service las siembra con los 5 departamentos vacíos la primera vez que se
-- leen (LeaveOfAbsenceService.findOne) y lo persiste en el próximo write —
-- no hace falta backfill manual aquí.

ALTER TABLE "leave_of_absence_requests"
    ADD COLUMN IF NOT EXISTS "department_logs" jsonb NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS "returned_to_work" boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "returned_to_work_by" jsonb,
    ADD COLUMN IF NOT EXISTS "returned_to_work_at" TIMESTAMP WITH TIME ZONE;

-- Rollback manual si hace falta revertir:
-- ALTER TABLE "leave_of_absence_requests"
--     DROP COLUMN IF EXISTS "department_logs",
--     DROP COLUMN IF EXISTS "returned_to_work",
--     DROP COLUMN IF EXISTS "returned_to_work_by",
--     DROP COLUMN IF EXISTS "returned_to_work_at";
