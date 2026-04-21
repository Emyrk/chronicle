# Stage 1: Build frontend
FROM node:20.19.1-alpine AS frontend
ARG SERVER=turtle
ENV SERVER=${SERVER}

RUN apk --no-cache add make && npm install -g pnpm@9

WORKDIR /chronicle/frontend/chronicle
COPY frontend/chronicle/package.json frontend/chronicle/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

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

# Pass version info and server target to the Go build
RUN GIT_TAG=${GIT_TAG} GIT_COMMIT=${GIT_COMMIT} BUILD_TIME=${BUILD_TIME} SERVER=${SERVER} make build-backend

# Stage 3: Final minimal image
FROM alpine:latest

RUN apk --no-cache add ca-certificates
WORKDIR /app

COPY --from=frontend /chronicle/frontend/chronicle/dist ./frontend/chronicle/dist
COPY --from=backend /chronicle/bin/chronicled ./
COPY assets/ ./assets/

RUN chmod +x ./chronicled
ENTRYPOINT ["./chronicled", "server"]
