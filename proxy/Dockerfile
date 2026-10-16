# syntax=docker/dockerfile:1

# Stage 1: build the React application.
FROM node:24-bookworm-slim AS build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Caddy with the built application.
FROM caddy:2-alpine
RUN mkdir -p /certs /srv/app /srv/maintenance
COPY proxy/Caddyfile /etc/caddy/Caddyfile
COPY proxy/tls.caddy /etc/caddy/tls.caddy
COPY proxy/redirect.caddy /etc/caddy/redirect.caddy
COPY proxy/maintenance.html /srv/maintenance/maintenance.html
COPY proxy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
COPY --from=build /src/frontend/dist /srv/app
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
