FROM golang:1.25.7-alpine3.22 AS build
WORKDIR /chronicle
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o /livesessiond ./cmd/livesessiond

FROM alpine:3.22
RUN apk --no-cache add ca-certificates
COPY --from=build /livesessiond /livesessiond
ENTRYPOINT ["/livesessiond"]
