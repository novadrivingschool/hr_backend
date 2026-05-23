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
docker build -t hr-api-dev .
docker run --name hr-api-dev \
  -d \
  -p 5006:5006 \
  --restart always \
  -v $(pwd)/.env:/usr/src/app/.env \
  hr-api-dev

docker logs hr-api-dev -f

docker restart hr-api-dev

docker run --name hr-api-dev -d -p 5006:5006 --restart always hr-api-dev


## Production
docker build -t hr-api .
docker run --name hr-api \
  -d \
  -p 5006:5006 \
  --restart always \
  -v $(pwd)/.env:/usr/src/app/.env \
  hr-api

docker logs hr-api -f

docker system prune -a --volumes



apt-get update && apt-get install -y libnspr4 libnss3 libxss1 libgtk-3-0 libgbm1

---

## Docker Compose

> Dev usa Compose **v1** (`docker-compose`).

### Dev (Compose v1)

```bash
# Build + levantar
docker-compose -f docker-compose.dev.yml up --build -d

# Bajar
docker-compose -f docker-compose.dev.yml down

# Logs
docker-compose -f docker-compose.dev.yml logs -f
```

### Prod (Compose v2)

```bash
# Build + levantar
docker compose -f docker-compose.prod.yml up --build -d

# Bajar
docker compose -f docker-compose.prod.yml down

# Logs
docker compose -f docker-compose.prod.yml logs -f
```

> El `.env` se monta como volumen — cualquier cambio en el archivo aplica al reiniciar el contenedor sin necesidad de rebuild.