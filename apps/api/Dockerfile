FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl

COPY apps/api/package*.json /app/apps/api/
WORKDIR /app/apps/api
RUN npm ci

COPY apps/api /app/apps/api
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app/apps/api
RUN apk add --no-cache openssl

COPY --from=build /app/apps/api/package*.json ./
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/storage ./storage

ENV NODE_ENV=production
EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/seed.js && node dist/index.js"]
