# Build the static SPA, then serve it from nginx. The data pipeline runs
# offline; its committed output (data/*.json) is bundled at build time.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
ENV SEED_DEMO="" \
    SENTRY_DSN="" \
    UMAMI_URL="" \
    UMAMI_WEBSITE_ID=""
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/env.js.template /etc/atlas/env.js.template
COPY docker/entrypoint.sh /docker-entrypoint.d/40-atlas-env.sh
RUN chmod +x /docker-entrypoint.d/40-atlas-env.sh
EXPOSE 80
# nginx:alpine's own entrypoint runs /docker-entrypoint.d/* then starts nginx.
