import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';
import { db, schema } from '@atlas/db';

const appUrl = process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret || secret.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters. Run the local setup script.');
const parsedAppUrl = new URL(appUrl);
const isLocalHttp = parsedAppUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsedAppUrl.hostname) && process.env.ATLAS_ALLOW_LOCAL_HTTP === 'true';
if (!['http:', 'https:'].includes(parsedAppUrl.protocol) || (process.env.NODE_ENV === 'production' && parsedAppUrl.protocol !== 'https:' && !isLocalHttp)) {
  throw new Error('Production authentication requires HTTPS; isolated local builds may explicitly set ATLAS_ALLOW_LOCAL_HTTP=true.');
}

export const auth = betterAuth({
  appName: 'ATLAS Property OS',
  telemetry: { enabled: false },
  baseURL: appUrl,
  secret,
  trustedOrigins: [new URL(appUrl).origin],
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: false,
  },
  session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 30, cookieCache: { enabled: false } },
  rateLimit: { enabled: true, window: 60, max: 30 },
  advanced: {
    useSecureCookies: appUrl.startsWith('https://'),
    defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
  },
  plugins: [twoFactor({ issuer: 'ATLAS Property OS' })],
});
