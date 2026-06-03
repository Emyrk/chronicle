# Stage 1: Build frontend
FROM node:20.19.1-alpine AS frontend
ARG SERVER=turtle
ENV SERVER=${SERVER}

RUN apk --no-cache add make && npm install -g pnpm@9

WORKDIR /chronicle/frontend/chronicle
COPY frontend/chronicle/package.json frontend/chronicle/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Sibling pure package consumed via the "@chronicle/wow-tooltip-renderer" path
# alias (../wow-tooltip-renderer). It is plain TypeScript with no runtime deps,
# so copying the source is enough — vite bundles it and tsc resolves it via the
# tsconfig path mapping.
COPY frontend/wow-tooltip-renderer/ /chronicle/frontend/wow-tooltip-renderer/

COPY frontend/chronicle/ ./
RUN pnpm build

# Stage 2: Build Go binary
FROM golang:1.25.7-alpine3.22 AS backend

# Build args for version info (passed from CI/CD or computed at build time)
ARG GIT_TAG=unknown
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown
ARG SERVER=turtle

RUN apk --no-cache add make git

WORKDIR /chronicle
COPY go.mod go.sum ./
RUN go mod download

COPY . .
COPY --from=frontend /chronicle/frontend/chronicle/dist ./frontend/chronicle/dist

# Build the backend with embedded frontend assets from the prebuilt dist directory.
# Touch dist so Make doesn't try to rebuild frontend (already built in stage 1)
RUN touch frontend/chronicle/dist && \
    GIT_TAG=${GIT_TAG} GIT_COMMIT=${GIT_COMMIT} BUILD_TIME=${BUILD_TIME} SERVER=${SERVER} make build-backend-static

# Stage 3: Final minimal image
FROM alpine:3.22

RUN apk --no-cache add ca-certificates
WORKDIR /app

COPY --from=frontend /chronicle/frontend/chronicle/dist ./frontend/chronicle/dist
COPY --from=backend /chronicle/bin/chronicled ./
COPY assets/ ./assets/

RUN chmod +x ./chronicled
ENTRYPOINT ["./chronicled", "server"]
