FROM node:20-alpine AS build
WORKDIR /app

COPY apps/web/package*.json /app/apps/web/
COPY packages/ui /app/packages/ui

WORKDIR /app/apps/web
RUN npm ci

COPY apps/web /app/apps/web
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY --from=build /app/apps/web/public/config.json /usr/share/nginx/html/config.json

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
