/** Only allow same-site relative paths as post-login redirect targets (no open redirects). */
export function safeNext(raw: unknown, fallback = "/feed"): string {
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (raw.startsWith("/login") || raw.startsWith("/register")) return fallback;
  return raw;
}
