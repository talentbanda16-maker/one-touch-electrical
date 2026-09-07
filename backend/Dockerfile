FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY assets ./assets

# uploads/ is a bind mount target in docker-compose, not baked into the
# image — file storage must survive container recreation.
RUN mkdir -p uploads

EXPOSE 4000

# Applies any pending migrations before the server starts, so a fresh
# deploy or a restart after a schema change never boots against a stale
# database.
CMD npx prisma migrate deploy && node src/server.js
