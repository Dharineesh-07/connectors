// Change BACKEND_HOST to your server's IP or hostname.
// Android emulator → 10.0.2.2:8000 | iOS simulator → localhost:8000 | Real device → machine IP
export const BACKEND_HOST = '192.168.1.100:8000'
export const API_BASE_URL = `http://${BACKEND_HOST}/api`
export const WS_BASE_URL = `ws://${BACKEND_HOST}`
