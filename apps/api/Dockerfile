FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl

COPY apps/api/package*.json /app/apps/api/
WORKDIR /app/apps/api
RUN npm ci

COPY apps/api /app/apps/api
RUN npm run prisma:generate
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app/apps/api
RUN apk add --no-cache openssl

COPY --from=build /app/apps/api/package*.json ./
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/scripts ./scripts
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/start-container.sh ./start-container.sh
COPY apps/api/start-notification-worker.sh ./start-notification-worker.sh
RUN chmod +x ./start-container.sh ./start-notification-worker.sh && mkdir -p ./storage/uploads

ENV NODE_ENV=production
EXPOSE 4000

CMD ["./start-container.sh"]
