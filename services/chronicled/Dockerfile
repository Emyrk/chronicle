# Stage 1: Build Go binary
FROM golang:1.25.7-alpine3.22 AS backend

# Build args for version info (passed from CI/CD or computed at build time)
ARG GIT_TAG=unknown
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown

RUN apk --no-cache add make git

WORKDIR /chronicle
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN GIT_TAG=${GIT_TAG} GIT_COMMIT=${GIT_COMMIT} BUILD_TIME=${BUILD_TIME} make build-backend

# Stage 2: Final minimal image
FROM alpine:3.22

RUN apk --no-cache add ca-certificates
WORKDIR /app

COPY --from=backend /chronicle/bin/chronicled ./
COPY assets/ ./assets/

RUN chmod +x ./chronicled
ENTRYPOINT ["./chronicled", "server"]
