import * as Sentry from "@sentry/react";

declare global {
  interface Window {
    __KS_BOOTSTRAP_TOKEN?: string;
  }
}

const LS_KEY = "ks_admin_token_v1";

export function takeBootstrapToken(): string | null {
  const t = (window.__KS_BOOTSTRAP_TOKEN || "").trim();
  delete window.__KS_BOOTSTRAP_TOKEN;
  return t ? t : null;
}

export function loadAdminToken(): string | null {
  try {
    const t = (localStorage.getItem(LS_KEY) || "").trim();
    return t ? t : null;
  } catch {
    return null;
  }
}

export function saveAdminToken(token: string) {
  try {
    localStorage.setItem(LS_KEY, token);
  } catch {
    // ignore
  }
}

export function clearAdminToken() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}

export async function validateAdminToken(token: string): Promise<boolean> {
  const { logger } = Sentry;
  try {
    const res = await Sentry.startSpan(
      { op: "http.client", name: "GET /api/config/read (validate token)" },
      async () =>
        await fetch("/api/config/read", {
          headers: {
            Accept: "application/json",
            Authorization: token,
          },
          cache: "no-store",
        }),
    );
    // `GET /api/config/read` returns:
    // - 401 when token is missing/invalid
    // - 404 when token is valid but config doesn't exist yet
    // - 200 when token is valid and config exists
    if (res.status === 401) {
      logger.warn("admin.token.invalid", { status: res.status });
      return false;
    }
    if (res.status >= 500) {
      logger.warn("admin.token.server_error", { status: res.status });
      return false;
    }
    if (res.ok || res.status === 404) {
      logger.info("admin.token.valid");
      return true;
    }
    logger.warn("admin.token.unknown_status", { status: res.status });
    return false;
  } catch (e) {
    logger.warn("admin.token.validate_failed", { error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}
