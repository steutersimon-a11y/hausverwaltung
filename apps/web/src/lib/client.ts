export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly code = 'REQUEST_FAILED') {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) {
    const data = await response.json().catch(() => null) as { error?: { message?: string; code?: string }; message?: string } | null;
    if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('atlas-session-expired'));
    throw new ApiError(response.status, data?.error?.message ?? data?.message ?? 'Die Anfrage konnte nicht abgeschlossen werden.', data?.error?.code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function address(parts: { street?: string | null; houseNumber?: string | null; postalCode?: string | null; city?: string | null }) {
  return [parts.street, parts.houseNumber].filter(Boolean).join(' ') || 'Adresse noch unvollständig';
}

export function germanDate(value: string | null | undefined, includeTime = false) {
  if (!value) return 'Offen';
  const date = new Date(value.length === 10 ? `${value}T12:00:00+01:00` : value);
  if (Number.isNaN(date.getTime())) return 'Offen';
  return new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric', ...(includeTime ? { hour: '2-digit', minute: '2-digit' } as const : {}), timeZone: 'Europe/Berlin' }).format(date);
}

export const decimal = (value: number | null | undefined) => value == null ? 'Offen' : new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(value);
