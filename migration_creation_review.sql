-- Migration: coordinator "own personnel" creation-review flow
-- Run this manually before deploying the new build (synchronize=false).
--
-- 1. Nuevo valor de enum: pending_creation_review
--    Se usa cuando un coordinator levanta un iCare sobre su propio personal
--    (submitter aparece dentro de responsible[] del staff reportado).
--    El caso escala directo a HR/Management y queda oculto para el coordinator
--    hasta que se apruebe/rechace la creación.
--
-- IMPORTANTE: ALTER TYPE ... ADD VALUE no puede correr dentro de una transacción
-- junto con otros comandos en algunas versiones de Postgres — ejecútalo solo
-- (o en su propio statement) si tu cliente envuelve todo en una transacción.

ALTER TYPE i_care_status_enum ADD VALUE IF NOT EXISTS 'pending_creation_review';

-- 2. Nuevas columnas de auditoría para la revisión de creación.
ALTER TABLE i_care
  ADD COLUMN IF NOT EXISTS creation_review_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS creation_reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS creation_review_approved boolean,
  ADD COLUMN IF NOT EXISTS creation_reviewed_by jsonb,
  ADD COLUMN IF NOT EXISTS creation_review_date varchar(20),
  ADD COLUMN IF NOT EXISTS creation_review_time varchar(10),
  ADD COLUMN IF NOT EXISTS creation_review_notes text,
  ADD COLUMN IF NOT EXISTS creation_review_attachments jsonb DEFAULT '[]';

-- Nota: si el nombre real del tipo enum en tu base no es "i_care_status_enum",
-- verifica con:
--   SELECT udt_name FROM information_schema.columns
--   WHERE table_name = 'i_care' AND column_name = 'status';
-- y ajusta el ALTER TYPE con el nombre correcto antes de correr este script.
