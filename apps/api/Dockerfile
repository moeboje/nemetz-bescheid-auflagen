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
RUN mkdir -p ./storage/uploads ./storage/mail-outbox

ENV NODE_ENV=production
EXPOSE 4000

CMD ["sh","-c","if echo \"$DATABASE_URL\" | grep -q \"^file:/tmp/\"; then cp -f /data/db/prod.db /tmp/prod.db || true; fi; exec node dist/index.js"]
