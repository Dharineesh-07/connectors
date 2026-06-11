# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Vite bakes these URLs into the JS bundle at build time
ARG VITE_BACKEND_URL=http://localhost:8000
ARG VITE_BACKEND_WS_URL=ws://localhost:8000
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_BACKEND_WS_URL=$VITE_BACKEND_WS_URL

RUN npm run build

# ── Production stage ────────────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
