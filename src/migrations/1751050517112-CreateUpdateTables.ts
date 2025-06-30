import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUpdateTables1751050517112 implements MigrationInterface {
    name = 'CreateUpdateTables1751050517112'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "time_off_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "timeType" character varying NOT NULL, "hourDate" date, "startTime" TIME, "endTime" TIME, "startDate" date, "endDate" date, "requestType" character varying NOT NULL, "otherDescription" text, "comments" text, "dateOrRange" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'Pending', "createdDate" date NOT NULL, "createdTime" TIME NOT NULL, "employee_data" jsonb NOT NULL, "coordinator_approval" jsonb NOT NULL, "hr_approval" jsonb NOT NULL, CONSTRAINT "PK_d2dc15201117320068bbc641715" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "schedule_event" ("id" SERIAL NOT NULL, "register" character varying NOT NULL, "date" date NOT NULL, "start" TIMESTAMP NOT NULL, "end" TIMESTAMP NOT NULL, "location" character varying NOT NULL, "scheduleId" integer, CONSTRAINT "PK_d658c2629387690dca1f793d410" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "employee_schedule" ("id" SERIAL NOT NULL, "employee_number" character varying NOT NULL, CONSTRAINT "PK_6d849e34b04c104b4c76b92fccf" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "fixed_schedule" ("id" SERIAL NOT NULL, "weekdays" integer array NOT NULL, "start" TIME NOT NULL, "end" TIME NOT NULL, "register" character varying NOT NULL, "location" character varying NOT NULL, "scheduleId" integer, CONSTRAINT "PK_981842f3e5ded6b189d04a15ce6" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "logbook_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "employee_data" jsonb NOT NULL, "section" character varying NOT NULL, "data" jsonb NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_967ef821a783ea0b691682c3305" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "departments" DROP COLUMN "department"`);
        await queryRunner.query(`ALTER TABLE "departments" ADD "name" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "departments" ADD CONSTRAINT "UQ_8681da666ad9699d568b3e91064" UNIQUE ("name")`);
        await queryRunner.query(`ALTER TABLE "departments" DROP CONSTRAINT "departments_pkey"`);
        await queryRunner.query(`ALTER TABLE "departments" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "departments" ADD "id" uuid NOT NULL DEFAULT uuid_generate_v4()`);
        await queryRunner.query(`ALTER TABLE "departments" ADD CONSTRAINT "PK_839517a681a86bb84cbcc6a1e9d" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "schedule_event" ADD CONSTRAINT "FK_19045d7d28877e8725e26370a4e" FOREIGN KEY ("scheduleId") REFERENCES "employee_schedule"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "fixed_schedule" ADD CONSTRAINT "FK_b6e53e19acb875794e8280840d0" FOREIGN KEY ("scheduleId") REFERENCES "employee_schedule"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "fixed_schedule" DROP CONSTRAINT "FK_b6e53e19acb875794e8280840d0"`);
        await queryRunner.query(`ALTER TABLE "schedule_event" DROP CONSTRAINT "FK_19045d7d28877e8725e26370a4e"`);
        await queryRunner.query(`ALTER TABLE "departments" DROP CONSTRAINT "PK_839517a681a86bb84cbcc6a1e9d"`);
        await queryRunner.query(`ALTER TABLE "departments" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "departments" ADD "id" SERIAL NOT NULL`);
        await queryRunner.query(`ALTER TABLE "departments" ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id")`);
        await queryRunner.query(`ALTER TABLE "departments" DROP CONSTRAINT "UQ_8681da666ad9699d568b3e91064"`);
        await queryRunner.query(`ALTER TABLE "departments" DROP COLUMN "name"`);
        await queryRunner.query(`ALTER TABLE "departments" ADD "department" character varying(255) NOT NULL`);
        await queryRunner.query(`DROP TABLE "logbook_entries"`);
        await queryRunner.query(`DROP TABLE "fixed_schedule"`);
        await queryRunner.query(`DROP TABLE "employee_schedule"`);
        await queryRunner.query(`DROP TABLE "schedule_event"`);
        await queryRunner.query(`DROP TABLE "time_off_requests"`);
    }

}
