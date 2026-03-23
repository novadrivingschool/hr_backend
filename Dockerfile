# ── Builder ────────────────────────────────────────────────────────────────
FROM node:18-slim AS builder
WORKDIR /usr/src/app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────────────
FROM node:18-slim AS runtime
WORKDIR /usr/src/app

# Dependencias de sistema que Chrome necesita
RUN apt-get update && apt-get install -y --no-install-recommends \
  chromium \
  fonts-liberation \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libgdk-pixbuf2.0-0 \
  libnspr4 \
  libnss3 \
  libx11-xcb1 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  xdg-utils \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Decirle a Puppeteer que NO descargue Chrome y dónde está el del sistema
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/dist/src ./dist

RUN npm install --production

CMD ["node", "dist/main"]