/** Where the API lives (issue #198, docs/hosting.md §5.1). The only place an API URL is decided: `''` means this page's own origin (Vite's `/api` proxy in dev), otherwise an origin on the frontend's site, so `SameSite=Strict` cookies still travel. */
import { domainMove, onOldAddress } from '#lib/domainMove';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function configuredApiUrl(): string {
  try {
    return __API_URL__;
  } catch {
    return '';
  }
}

/** Origin of an absolute URL, or '' for anything unusable. */
export function originOf(url: string): string {
  try {
    return url ? new URL(url).origin : '';
  } catch {
    return '';
  }
}

/** Order: loopback frontend (same origin), the old address of a domain move (its old API), PUBLIC_API_URL, else `api.` + this host. */
export function apiOrigin(): string {
  if (typeof location === 'undefined' || LOOPBACK.has(location.hostname)) return '';
  if (onOldAddress() && domainMove?.fromApiUrl) return originOf(domainMove.fromApiUrl);
  const configured = originOf(configuredApiUrl());
  if (configured) return configured;
  return `${location.protocol}//api.${location.host}`;
}

/** Host of the API, for display ("account on api.example.org"). */
export function apiHost(): string {
  const origin = apiOrigin();
  if (origin) return new URL(origin).host;
  return typeof location === 'undefined' ? '' : location.host;
}

/** Absolute (or same-origin) URL of an API path such as `/api/health`. */
export function apiUrl(path: string): string {
  return `${apiOrigin()}${path}`;
}
