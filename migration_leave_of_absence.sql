-- Migration: Leave of Absence (LOA) module
-- Run this manually before deploying the new build (synchronize=false).
--
-- REEMPLAZA la versión anterior de este script. El shape cambió: fullName
-- (texto libre) fue reemplazado por employee_number + employee_data (jsonb,
-- resuelto por live search — mismo patrón que absence_requests.employee_data);
-- createdBy/updatedBy (varchar) fueron reemplazados por created_by/updated_by
-- (jsonb, actor completo — mismo patrón que i_care); attachments pasó de
-- simple-array a jsonb (array de S3 keys del recurso propio
-- leave-of-absence/files en aws_services_backend).
--
-- Como el feature nunca se desplegó con el shape viejo, este script tira la
-- tabla si ya existe (por si tu tooling la auto-generó) y la vuelve a crear
-- completa. Si por alguna razón ya tienes registros reales en esta tabla,
-- NO corras esto tal cual — avisa antes.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DROP TABLE IF EXISTS "leave_of_absence_requests";

DO $$ BEGIN
  CREATE TYPE "public"."loa_type" AS ENUM ('medical_leave', 'personal_leave');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "leave_of_absence_requests" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "employee_number" character varying(50) NOT NULL,
  "employee_data" jsonb NOT NULL,
  "startDate" date NOT NULL,
  "endDate" date NOT NULL,
  "returnDate" date,
  "loaType" "public"."loa_type" NOT NULL,
  "notes" text,
  "registeredInInspirity" boolean NOT NULL DEFAULT false,
  "wellnessPackages" boolean NOT NULL DEFAULT false,
  "attachments" jsonb DEFAULT '[]',
  "created_by" jsonb NOT NULL,
  "updated_by" jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT "PK_leave_of_absence_requests_id" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_leave_of_absence_requests_employee_number"
  ON "leave_of_absence_requests" ("employee_number");

-- Rollback manual si hace falta revertir:
-- DROP TABLE IF EXISTS "leave_of_absence_requests";
-- DROP TYPE IF EXISTS "public"."loa_type";
