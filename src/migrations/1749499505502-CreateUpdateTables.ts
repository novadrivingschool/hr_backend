import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUpdateTables1749499505502 implements MigrationInterface {
    name = 'CreateUpdateTables1749499505502'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "time_off_requests" ALTER COLUMN "coordinator_approval" SET DEFAULT '{"approved": false, "by": ""}'`);
        await queryRunner.query(`ALTER TABLE "time_off_requests" ALTER COLUMN "hr_approval" SET DEFAULT '{"approved": false, "by": ""}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "time_off_requests" ALTER COLUMN "hr_approval" SET DEFAULT '{"by": "", "approved": false}'`);
        await queryRunner.query(`ALTER TABLE "time_off_requests" ALTER COLUMN "coordinator_approval" SET DEFAULT '{"by": "", "approved": false}'`);
    }

}
