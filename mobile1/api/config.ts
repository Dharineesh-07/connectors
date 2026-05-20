// Go backend port: 8000 (docker-compose maps 8000:8000)
// Android emulator → 10.0.2.2:8000 | iOS simulator → localhost:8000 | Real device → machine LAN IP
export const BACKEND_HOST = '172.20.10.5:8000';
export const API_BASE_URL = `http://${BACKEND_HOST}/api`;
export const WS_URL = `ws://${BACKEND_HOST}/ws/connect`;
