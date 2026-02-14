import * as Sentry from "@sentry/react";

const UV_PING_DAY_KEY = "ks_uv_ping_day_v1";

function utcDay(): string {
  // YYYY-MM-DD in UTC
  return new Date().toISOString().slice(0, 10);
}

/**
 * Send a single UV ping per day (best-effort), using Sentry captureMessage.
 */
export function maybeDailyUvPing(): void {
  const day = utcDay();

  try {
    if (localStorage.getItem(UV_PING_DAY_KEY) === day) return;
    localStorage.setItem(UV_PING_DAY_KEY, day);
  } catch {
    // If localStorage is unavailable, do not spam; skip ping.
    return;
  }

  Sentry.captureMessage("uv.ping", {
    level: "info",
    extra: {
      day,
      path: window.location.pathname,
    },
  });
}
