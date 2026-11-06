import { expect, type APIRequestContext } from "@playwright/test";
export const origin = process.env.APP_URL ?? "http://127.0.0.1:3000";
const password = "Atlas-Demo-2026!";
export async function login(request: APIRequestContext, email = "admin@atlas.example") {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await request.post("/api/auth/sign-in/email", { headers: { origin }, data: { email, password } });
    if (response.status() === 429) {
      // Respect the framework's sign-in protection rather than disabling it for tests.
      const retryAfter = Number(response.headers()["retry-after"] ?? 11);
      await new Promise(resolve => setTimeout(resolve, Math.min(15, Math.max(1, retryAfter)) * 1000 + 100));
      continue;
    }
    expect(response.ok(), "synthetic account signs in through Better Auth").toBeTruthy();
    return;
  }
  throw new Error("Sign-in rate limit did not clear within its documented retry window.");
}
