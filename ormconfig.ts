import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { TimeOffRequest } from 'src/time_off_request/entities/time_off_request.entity';
import { Schedule } from 'src/schedule/entities/schedule.entity';

dotenv.config();

console.log('Database Configuration:');
console.log({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  username: process.env.POSTGRES_USER,
  database: process.env.POSTGRES_DB,
});

console.log('Migrations Path:', path.join(__dirname, '/migrations/*.{ts,js}'));

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: +(process.env.POSTGRES_PORT ?? 25060), // default to 5432 if undefined
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: [
    TimeOffRequest,
    Schedule,
  ],
  migrations: [path.join(__dirname, 'src/migrations/*.{ts,js}')],
  synchronize: false,
  logging: ['query', 'error'],
  ssl: {
    rejectUnauthorized: false,
  },
});

