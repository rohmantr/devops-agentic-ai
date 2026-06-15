# Stage 1: Build
FROM golang:1.23-alpine AS builder
WORKDIR /app

# Install Pulumi CLI for Automation API
RUN apk add --no-cache curl bash && \
    curl -fsSL https://get.pulumi.com | sh
ENV PATH="/root/.pulumi/bin:${PATH}"

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Build binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server ./cmd/server

# Stage 2: Runtime (distroless-like minimal image)
FROM alpine:3.20
RUN apk --no-cache add ca-certificates curl bash

# Install Pulumi CLI for Automation API runtime
COPY --from=builder /root/.pulumi /root/.pulumi
ENV PATH="/root/.pulumi/bin:${PATH}"

WORKDIR /app
COPY --from=builder /app/server .

EXPOSE 8080
USER nobody:nobody
CMD ["./server"]
