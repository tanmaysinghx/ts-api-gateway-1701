# ==========================================
# STAGE 1: Build the Go executable binary
# ==========================================
FROM golang:1.22-alpine AS builder

# Install system dependencies needed for compiling Go modules
RUN apk add --no-cache git gcc musl-dev

# Set the working directory inside the container
WORKDIR /app

# Copy dependency definition files first (leverage Docker layer caching)
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source code including web templates and assets
COPY . .

# Compile the static executable binary with optimized size flags.
# - CGO_ENABLED=0 ensures the binary is fully self-contained and static.
# - ldflags "-s -w" strips debugging symbols, shrinking the binary size by 50%.
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o gateway cmd/gateway/main.go

# ==========================================
# STAGE 2: Lightweight hardened runtime environment
# ==========================================
FROM alpine:3.19

# Add basic security certificates, timezone data, and diagnostic tools
RUN apk add --no-cache ca-certificates tzdata curl && \
    adduser -D -g '' appuser

# Set working directory
WORKDIR /app

# Copy the static binary compiled in the builder stage
COPY --from=builder /app/gateway .

# Set correct permissions for our non-root user
RUN chown -R appuser:appuser /app

# Switch to the non-root user for cloud-security compliance
USER appuser

# Expose the single multiplexed ingress port (Gateway Data Plane & Control Console)
EXPOSE 8080

# Define container entrypoint
ENTRYPOINT ["./gateway"]
