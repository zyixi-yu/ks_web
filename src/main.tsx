import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";
import { getOrCreateDid } from "./lib/did";
import { maybeDailyUvPing } from "./lib/uvPing";

function stashTokenFromUrl() {
  try {
    const url = new URL(window.location.href);
    const token = (url.searchParams.get("token") || url.searchParams.get("t") || "").trim();
    if (!token) return;

    // Stash it for the app to validate, then strip from URL to avoid leaking it
    // via screenshots, copy-paste, browser history, or monitoring tools.
    (window as any).__KS_BOOTSTRAP_TOKEN = token;
    url.searchParams.delete("token");
    url.searchParams.delete("t");
    window.history.replaceState({}, "", url.toString());
  } catch {
    // ignore
  }
}

stashTokenFromUrl();

Sentry.init({
  dsn: "https://a729b7e7493f3ba65d296cb04f4819d9@o4510812457205760.ingest.us.sentry.io/4510822605193216",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  enableLogs: true,
  tracesSampleRate: 1.0,
});

const did = getOrCreateDid();
Sentry.setUser({ id: did });
maybeDailyUvPing();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
