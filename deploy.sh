#!/usr/bin/env bash
# Usage: ./deploy.sh
# Run from the repo root on the server after setting up .env and coturn/turnserver.conf.
set -euo pipefail

echo "==> Pulling latest code..."
git pull origin main

echo "==> Building and restarting services..."
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

echo "==> Waiting for backend to be healthy..."
for i in $(seq 1 20); do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    echo "==> Backend is up."
    break
  fi
  sleep 3
done

docker compose -f docker-compose.prod.yml ps
echo "==> Deploy complete."
