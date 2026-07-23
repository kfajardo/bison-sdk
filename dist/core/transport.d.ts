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
export declare const BISON_API_URL = "https://bison-backend-prod-cbdfeveaa2a6cngk.southeastasia-01.azurewebsites.net";
export interface HttpTransportConfig {
    /** Publishable embeddable API key sent as X-Embeddable-Key. */
    apiKey: string;
    /** Advanced override for local/staging tests. Production is the default. */
    baseUrl?: string;
    /** Override fetch (tests, custom agents). Defaults to globalThis.fetch. */
    fetch?: typeof globalThis.fetch;
}
/** Real API transport: API-key auth + `{ success, message, data }` envelope unwrap. */
export declare function http(cfg: HttpTransportConfig): Transport;
