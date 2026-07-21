/**
 * The app's public base URL, resolved without manual configuration:
 *   1. BETTER_AUTH_URL — explicit override (custom domain, local wizard installs)
 *   2. VERCEL_PROJECT_PRODUCTION_URL — set automatically on every Vercel deploy,
 *      so Deploy-Button installs need no URL step at all
 *   3. localhost fallback for local dev
 */
export function getBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}
