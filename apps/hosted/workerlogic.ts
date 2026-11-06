import { handleApi } from './server/index';
import type { Env } from './server/types';

export type StaticResolver = (path: string) => Response | null | Promise<Response | null>;
const applicationPaths = new Set(['/', '/portfolio', '/aufgaben', '/dokumente', '/datenqualitaet', '/einstellungen', '/importe']);
const securityHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://chat.openai.com"
};

function serviceAuthorized(request: Request, secret: string | undefined): boolean {
  if (!secret || secret.length < 32) return false;
  const actual = new TextEncoder().encode(request.headers.get('X-Atlas-Service-Authorization') ?? '');
  const expected = new TextEncoder().encode(`Bearer ${secret}`);
  let mismatch = actual.length ^ expected.length;
  for (let index = 0; index < expected.length; index++) mismatch |= (actual[index] ?? 0) ^ expected[index]!;
  return mismatch === 0;
}

/** Identity headers are supplied by Sites dispatch, never accepted from public ingress directly. */
export function authorizeRequest(request: Request, env: Env): boolean {
  return Boolean(request.headers.get('oai-authenticated-user-id')) || serviceAuthorized(request, env.ATLAS_SERVICE_SECRET);
}

function unauthorized(request: Request): Response {
  if (new URL(request.url).pathname.startsWith('/api/')) return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Bitte melde dich mit ChatGPT an.' } }, { status: 401 });
  return new Response('<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ATLAS – Zugang</title><body><main><h1>Dein privater ATLAS-Arbeitsbereich</h1><p>Öffne deinen geschützten Zugang mit deinem ChatGPT-Konto.</p><a href="/signin-with-chatgpt?return_to=%2Fportfolio" target="_top">Mit ChatGPT öffnen</a></main></body></html>', { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function secured(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'private, no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function createWorker(resolveStatic: StaticResolver) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      try {
        if (!authorizeRequest(request, env)) return secured(unauthorized(request));
        const apiResponse = await handleApi(request, env);
        if (apiResponse) return secured(apiResponse);
        const url = new URL(request.url);
        if (!['GET', 'HEAD'].includes(request.method)) return secured(new Response('Methode nicht erlaubt.', { status: 405, headers: { Allow: 'GET, HEAD' } }));
        let path: string;
        try { path = decodeURIComponent(url.pathname); } catch { return secured(new Response('Ungültige Adresse.', { status: 400 })); }
        const response = await resolveStatic(path) ?? (applicationPaths.has(path) ? await resolveStatic('/index.html') : null);
        if (!response) return secured(new Response('Seite nicht gefunden.', { status: 404 }));
        return secured(request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response);
      } catch {
        console.error('ATLAS hosted request failed.');
        return secured(Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Die Anfrage konnte gerade nicht verarbeitet werden. Bitte versuche es erneut.' } }, { status: 500 }));
      }
    }
  };
}
