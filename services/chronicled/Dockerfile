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

# Build the backend with embedded frontend assets from the prebuilt dist directory.
RUN go build --tags "static ${SERVER}" \
	-ldflags="-X=github.com/Emyrk/chronicle/internal/version.GitTag=${GIT_TAG} -X=github.com/Emyrk/chronicle/internal/version.GitCommit=${GIT_COMMIT} -X=github.com/Emyrk/chronicle/internal/version.BuildTime=${BUILD_TIME}" \
	-o bin/chronicled ./cmd/chronicled

# Stage 3: Final minimal image
FROM alpine:latest

RUN apk --no-cache add ca-certificates
WORKDIR /app

COPY --from=frontend /chronicle/frontend/chronicle/dist ./frontend/chronicle/dist
COPY --from=backend /chronicle/bin/chronicled ./
COPY assets/ ./assets/

RUN chmod +x ./chronicled
ENTRYPOINT ["./chronicled", "server"]
