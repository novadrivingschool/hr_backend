import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUpdateTables1750807144211 implements MigrationInterface {
    name = 'CreateUpdateTables1750807144211'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "logbook_entries" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "employee_data" jsonb NOT NULL, "section" character varying NOT NULL, "data" jsonb NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_967ef821a783ea0b691682c3305" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "logbook_entries"`);
    }

}
