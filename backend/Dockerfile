# One image: the API, the built frontend (served by the API) and the three scanning engines.
# Build from the repo root: docker build -f backend/Dockerfile -t cyberlens .
# Versions pinned to what the team tested.
FROM node:24-bookworm-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM node:24-bookworm-slim

ARG SEMGREP_VERSION=1.183.0
ARG GITLEAKS_VERSION=8.30.1
ARG OSV_VERSION=2.7.0
ARG TARGETARCH=amd64

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl python3 python3-pip \
 && pip3 install --no-cache-dir --break-system-packages semgrep==${SEMGREP_VERSION} \
 && GL_ARCH=$([ "$TARGETARCH" = arm64 ] && echo arm64 || echo x64) \
 && curl -fsSL https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${GL_ARCH}.tar.gz \
    | tar -xz -C /usr/local/bin gitleaks \
 && curl -fsSL -o /usr/local/bin/osv-scanner https://github.com/google/osv-scanner/releases/download/v${OSV_VERSION}/osv-scanner_linux_${TARGETARCH} \
 && chmod +x /usr/local/bin/osv-scanner \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/src ./src
COPY backend/rules ./rules
COPY backend/migrations ./migrations
COPY --from=web /web/dist ./public

USER node
ENV NODE_ENV=production PORT=4000 STATIC_DIR=/app/public
EXPOSE 4000
CMD ["node", "src/server.js"]
