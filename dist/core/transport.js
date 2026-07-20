// Phase 0 — transport foundation. Auth is a token callback (no X-Embeddable-Key).
// A Transport is the single seam the whole SDK sits on: http() talks to the real
// API, mock() replays the documented behavior. Everything above this file is
// identical against both.
/** Normalized API failure: HTTP errors and ApiResponse envelopes with success=false. */
export class BisonApiError extends Error {
    status;
    errors;
    errorCode;
    body;
    constructor(status, message, errors = [], 
    /** Stable machine-readable code from the API (e.g. "NON_US_ADDRESS"). */
    errorCode, body) {
        super(message);
        this.status = status;
        this.errors = errors;
        this.errorCode = errorCode;
        this.body = body;
        this.name = 'BisonApiError';
    }
}
function asEnvelope(body) {
    return typeof body === 'object' && body !== null && typeof body.success === 'boolean'
        ? body
        : undefined;
}
/** Real API transport: Bearer auth + `{ success, message, data }` envelope unwrap. */
export function http(cfg) {
    const base = cfg.baseUrl.endsWith('/') ? cfg.baseUrl : `${cfg.baseUrl}/`;
    return async (path, opts = {}) => {
        const url = new URL(path.replace(/^\//, ''), base);
        for (const [key, value] of Object.entries(opts.query ?? {})) {
            if (value !== undefined)
                url.searchParams.set(key, String(value));
        }
        const headers = { Accept: 'application/json' };
        if (cfg.auth)
            headers.Authorization = `Bearer ${await cfg.auth.getToken()}`;
        let body;
        if (opts.form) {
            body = opts.form;
        }
        else if (opts.json !== undefined) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(opts.json);
        }
        const doFetch = cfg.fetch ?? globalThis.fetch;
        const res = await doFetch(url, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body });
        const text = await res.text();
        let parsed;
        try {
            parsed = text ? JSON.parse(text) : undefined;
        }
        catch {
            parsed = text;
        }
        const envelope = asEnvelope(parsed);
        if (!res.ok || (envelope && !envelope.success)) {
            throw new BisonApiError(res.status, envelope?.message || res.statusText || 'Request failed', envelope?.errors ?? [], envelope?.errorCode, parsed);
        }
        return (envelope ? envelope.data : parsed);
    };
}
