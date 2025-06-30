# Installation
npm i class-validator class-transformer
npm install dotenv @types/dotenv --save-dev
npm install @nestjs/mapped-types
npm i @nestjs/config
npm install class-transformer class-validator
npm install typeorm
npm install @nestjs/config
npm install @nestjs/typeorm typeorm
npm install pg --save


# Migrations
<!-- CREATE TABLE -->
npm run typeorm -- migration:generate ./src/migrations/CreateUpdateTables
npm run migration:run



## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Develping Docker
docker build -t hr_backend_dev .
docker run --name hr_backend_dev \
  -d \
  -p 5006:5006 \
  --restart always \
  -v $(pwd)/.env:/usr/src/app/.env \
  hr_backend_dev

docker logs hr_backend_dev -f

docker run --name hr_backend_dev -d -p 5006:5006 --restart always hr_backend_dev


## Production
docker build -t hr_backend .
docker run --name hr_backend \
  -d \
  -p 5006:5006 \
  --restart always \
  -v $(pwd)/.env:/usr/src/app/.env \
  hr_backend

docker logs hr_backend -f

docker system prune -a --volumes
