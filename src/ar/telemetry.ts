class TelemetrySync {
    ws: WebSocket | null = null;
    listeners: Set<(data: any) => void> = new Set();

    constructor() {
        if (typeof window !== 'undefined') {
            this.connect();
        }
    }

    connect() {
        const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ar-sync`;
        this.ws = new WebSocket(wsUrl);
        this.ws.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                this.listeners.forEach(l => l(data));
            } catch (err) { }
        };
        this.ws.onclose = () => {
            setTimeout(() => this.connect(), 1000);
        };
    }

    send(data: any) {
        if (this.ws && this.ws.readyState === 1) {
            this.ws.send(JSON.stringify(data));
        }
    }

    subscribe(fn: (data: any) => void) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }
}

export const telemetrySync = new TelemetrySync();

const logs: string[] = [];
const originalError = console.error;
console.error = (...args) => {
    logs.push(args.map(a => String(a)).join(' '));
    originalError(...args);
};
