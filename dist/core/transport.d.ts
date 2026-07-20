/** Normalized API failure: HTTP errors and ApiResponse envelopes with success=false. */
export declare class BisonApiError extends Error {
    status: number;
    errors: string[];
    /** Stable machine-readable code from the API (e.g. "NON_US_ADDRESS"). */
    errorCode?: string | undefined;
    body?: unknown | undefined;
    constructor(status: number, message: string, errors?: string[], 
    /** Stable machine-readable code from the API (e.g. "NON_US_ADDRESS"). */
    errorCode?: string | undefined, body?: unknown | undefined);
}
export interface RequestOptions {
    method?: string;
    query?: Record<string, string | number | boolean | undefined>;
    json?: unknown;
    form?: FormData;
}
/**
 * The seam. Given a path + options, resolve the API's `data` payload (envelope
 * already unwrapped) or throw BisonApiError. http() and mock() both implement this.
 */
export type Transport = <T>(path: string, opts?: RequestOptions) => Promise<T>;
/**
 * Token provider. The SDK never holds a raw API key — the consumer's server mints
 * a short-lived, scope-bound token (from an API key exchange, or an Auth0 token —
 * the SDK is neutral) and this callback returns it. Called per request; cache in
 * the callback if you want.
 */
export interface AuthProvider {
    getToken: () => string | Promise<string>;
}
export interface HttpTransportConfig {
    /** API origin, e.g. https://api.example.com */
    baseUrl: string;
    /** Bearer token provider. Omit only against endpoints that need no auth. */
    auth?: AuthProvider;
    /** Override fetch (tests, custom agents). Defaults to globalThis.fetch. */
    fetch?: typeof globalThis.fetch;
}
/** Real API transport: Bearer auth + `{ success, message, data }` envelope unwrap. */
export declare function http(cfg: HttpTransportConfig): Transport;
