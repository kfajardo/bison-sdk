// Phase 0 — transport foundation. Auth is a token callback (no X-Embeddable-Key).
// A Transport is the single seam the whole SDK sits on: http() talks to the real
// API, mock() replays the documented behavior. Everything above this file is
// identical against both.

/** Normalized API failure: HTTP errors and ApiResponse envelopes with success=false. */
export class BisonApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors: string[] = [],
    /** Stable machine-readable code from the API (e.g. "NON_US_ADDRESS"). */
    public errorCode?: string,
    public body?: unknown,
  ) {
    super(message)
    this.name = 'BisonApiError'
  }
}

export interface RequestOptions {
  method?: string
  query?: Record<string, string | number | boolean | undefined>
  json?: unknown
  form?: FormData
}

/**
 * The seam. Given a path + options, resolve the API's `data` payload (envelope
 * already unwrapped) or throw BisonApiError. http() and mock() both implement this.
 */
export type Transport = <T>(path: string, opts?: RequestOptions) => Promise<T>

/**
 * Token provider. The SDK never holds a raw API key — the consumer's server mints
 * a short-lived, scope-bound token (from an API key exchange, or an Auth0 token —
 * the SDK is neutral) and this callback returns it. Called per request; cache in
 * the callback if you want.
 */
export interface AuthProvider {
  getToken: () => string | Promise<string>
}

export interface HttpTransportConfig {
  /** API origin, e.g. https://api.example.com */
  baseUrl: string
  /** Bearer token provider. Omit only against endpoints that need no auth. */
  auth?: AuthProvider
  /** Override fetch (tests, custom agents). Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch
}

interface Envelope {
  success: boolean
  message?: string
  data?: unknown
  errors?: string[]
  errorCode?: string
}

function asEnvelope(body: unknown): Envelope | undefined {
  return typeof body === 'object' && body !== null && typeof (body as Envelope).success === 'boolean'
    ? (body as Envelope)
    : undefined
}

/** Real API transport: Bearer auth + `{ success, message, data }` envelope unwrap. */
export function http(cfg: HttpTransportConfig): Transport {
  const base = cfg.baseUrl.endsWith('/') ? cfg.baseUrl : `${cfg.baseUrl}/`
  return async <T>(path: string, opts: RequestOptions = {}): Promise<T> => {
    const url = new URL(path.replace(/^\//, ''), base)
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }

    const headers: Record<string, string> = { Accept: 'application/json' }
    if (cfg.auth) headers.Authorization = `Bearer ${await cfg.auth.getToken()}`

    let body: BodyInit | undefined
    if (opts.form) {
      body = opts.form
    } else if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(opts.json)
    }

    const doFetch = cfg.fetch ?? globalThis.fetch
    const res = await doFetch(url, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body })

    const text = await res.text()
    let parsed: unknown
    try {
      parsed = text ? JSON.parse(text) : undefined
    } catch {
      parsed = text
    }

    const envelope = asEnvelope(parsed)
    if (!res.ok || (envelope && !envelope.success)) {
      throw new BisonApiError(
        res.status,
        envelope?.message || res.statusText || 'Request failed',
        envelope?.errors ?? [],
        envelope?.errorCode,
        parsed,
      )
    }
    return (envelope ? envelope.data : parsed) as T
  }
}
