import { WS_URL } from './config';

type Handler = (data: unknown) => void;

class WSClient {
  private socket: WebSocket | null = null;
  private handlers: Record<string, Handler[]> = {};
  private token = '';
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private alive = false;

  connect(token: string) {
    this.token = token;
    this.alive = true;
    this._open();
  }

  private _open() {
    if (!this.alive || !this.token) return;
    if (
      this.socket?.readyState === WebSocket.CONNECTING ||
      this.socket?.readyState === WebSocket.OPEN
    ) return;

    const url = `${WS_URL}?token=${encodeURIComponent(this.token)}`;
    const s = new WebSocket(url);
    this.socket = s;

    s.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data as string) as { type: string; data: unknown };
        (this.handlers[ev.type] ?? []).forEach(h => h(ev.data));
      } catch {}
    };

    s.onclose = (event) => {
      this.socket = null;
      if (event.code === 4001) {
        // Auth failure (token invalid/expired/revoked) — stop retrying and signal the app.
        this.alive = false;
        (this.handlers['session:expired'] ?? []).forEach(h => h(null));
        return;
      }
      if (this.alive) {
        this.retryTimer = setTimeout(() => this._open(), 3000);
      }
    };

    s.onerror = () => s.close();
  }

  send(type: string, data: unknown) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, data }));
    }
  }

  /** Subscribe to a WS event type. Returns an unsubscribe function. */
  on(type: string, handler: Handler): () => void {
    this.handlers[type] = [...(this.handlers[type] ?? []), handler];
    return () => {
      this.handlers[type] = (this.handlers[type] ?? []).filter(h => h !== handler);
    };
  }

  disconnect() {
    this.alive = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.socket?.close();
    this.socket = null;
    this.token = '';
  }
}

export const wsClient = new WSClient();
