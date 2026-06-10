# ── Build stage ─────────────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

WORKDIR /app

# cache dependencies separately from source
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server .

# ── Runtime stage ────────────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/server .

# uploads directory (overridden by volume in compose)
RUN mkdir -p /app/uploads

EXPOSE 8000

CMD ["./server"]
