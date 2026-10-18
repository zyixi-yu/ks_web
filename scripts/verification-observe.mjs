// Browserless, read-only verification diagnostics. Never call config/read here:
// it clears the SMS value. Raw tail envelopes contain credentials and must not
// be written, printed, or included in errors. Only allowlisted metadata persists.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const script = fileURLToPath(import.meta.url);
const root = path.dirname(path.dirname(script));
const require = createRequire(import.meta.url);
const account = process.env.KS_CF_ACCOUNT_ID || 'e83217f308bd1ad096b6bfbea3c78441';
const worker = process.env.KS_CF_WORKER || 'ks';
const directory = process.env.KS_VERIFICATION_LOG_DIR || path.join(os.homedir(), 'Library/Logs/ks-verification');
const apiRoot = `https://api.cloudflare.com/client/v4/accounts/${account}`;
const workerPath = `/workers/scripts/${encodeURIComponent(worker)}`;
const label = 'xyz.ks.verification-observer';
const statePath = path.join(directory, 'status.json');
const events = new Set([
  'verify_code.request', 'verify_code.write.ok', 'verify_code.read.ok',
  'verify_code.read.empty', 'verify_code.clear_started_by_config_read',
  'verify_code.cleared_by_config_read', 'verify_code.clear_failed_by_config_read',
]);
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
const now = () => new Date().toISOString();

export function sanitizeTail(frame, receivedAt = now()) {
  if (!Array.isArray(frame?.logs)) return [];
  return frame.logs.flatMap(log => {
    const message = log?.message;
    if (!Array.isArray(message) || !events.has(message[0])) return [];
    let details = message[1];
    // Cloudflare may serialize each console argument separately.
    if (typeof details === 'string') {
      try { details = JSON.parse(details); } catch { return []; }
    }
    if (!details || typeof details !== 'object' || Array.isArray(details)) return [];
    const row = { event: message[0], received_at: receivedAt };
    if (iso(details.at_utc)) row.at_utc = details.at_utc;
    for (const [key, pattern] of Object.entries({ ray: /^[a-f0-9]{16,32}(?:-[A-Z]{3})?$/i, colo: /^[A-Z]{3}$/, country: /^[A-Z]{2}$/ })) {
      if (typeof details[key] === 'string' && pattern.test(details[key])) row[key] = details[key];
    }
    if (['GET', 'POST'].includes(details.method)) row.method = details.method;
    if (['/api/verify-code/read', '/api/verify-code/write'].includes(details.path)) row.path = details.path;
    for (const key of ['status', 'duration_ms', 'sms_len', 'ttl', 'created_at', 'age_seconds']) {
      if (typeof details[key] === 'number' && Number.isFinite(details[key])) row[key] = details[key];
    }
    return [row];
  });
}

export function statusHealth(state, time = Date.now()) {
  return state?.phase === 'connected'
    && time - Date.parse(state.heartbeat_at) >= 0
    && time - Date.parse(state.heartbeat_at) < 45_000
    && time - Date.parse(state.last_pong_at || state.connected_at) < 45_000;
}

function prepareDirectory() {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
}
function writeState(state) {
  const temporary = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, statePath);
}
function append(row) {
  const date = row.received_at.slice(0, 10);
  fs.appendFileSync(path.join(directory, `${date}.jsonl`), JSON.stringify(row) + '\n', { mode: 0o600 });
}
function prune() {
  const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  for (const name of fs.readdirSync(directory)) {
    if (/^\d{4}-\d\d-\d\d\.jsonl$/.test(name) && name.slice(0, 10) < cutoff) fs.unlinkSync(path.join(directory, name));
  }
}
function readState() {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return {}; }
}
function failure(code) { const error = new Error(code); error.safeCode = code; return error; }
function errorCode(error) { return error?.safeCode || 'operation_failed'; }

async function auth() {
  // Wrangler refreshes OAuth automatically. Its debug logger also records CLI
  // stdout, so redirect that log to /dev/null, not merely the subprocess output.
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-wrangler-auth-'));
  fs.chmodSync(temporary, 0o700);
  const logPath = path.join(temporary, 'auth.log');
  fs.symlinkSync('/dev/null', logPath);
  try {
    const wrangler = path.join(path.dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js');
    const { stdout } = await exec(process.execPath, [wrangler, 'auth', 'token', '--json'], {
      cwd: root, timeout: 60_000, maxBuffer: 1024 * 1024,
      env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: logPath },
    });
    const credentials = JSON.parse(stdout);
    if (['oauth', 'api_token'].includes(credentials.type) && credentials.token) return { Authorization: `Bearer ${credentials.token}` };
    if (credentials.type === 'api_key' && credentials.key && credentials.email) return { 'X-Auth-Key': credentials.key, 'X-Auth-Email': credentials.email };
    throw failure('auth_failed');
  } catch { throw failure('auth_failed'); }
  finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
async function api(endpoint, headers, method = 'GET', body) {
  let response;
  try {
    response = await fetch(apiRoot + endpoint, {
      method, headers: { ...headers, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000),
    });
  } catch { throw failure('api_network_failed'); }
  if (!response.ok) throw failure(`api_http_${response.status}`);
  let envelope;
  try { envelope = await response.json(); } catch { throw failure('api_invalid_json'); }
  if (!envelope.success) throw failure('api_unsuccessful');
  return envelope.result;
}

async function watch() {
  prepareDirectory();
  const previous = readState();
  if (previous.pid && previous.pid !== process.pid && previous.phase !== 'stopped') {
    try { process.kill(previous.pid, 0); throw failure('observer_already_running'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  // Reuse Wrangler's pinned WebSocket implementation and trace-v1 protocol.
  const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
  const WebSocket = wranglerRequire('ws');
  const state = { pid: process.pid, worker, started_at: now(), phase: 'starting', events_saved: 0, frames_received: 0 };
  let stopped = false;
  let socket;
  let wake;
  const signal = () => { stopped = true; socket?.terminate(); wake?.(); };
  process.on('SIGTERM', signal);
  process.on('SIGINT', signal);
  const note = (event, extra = {}) => append({ event: `observer.${event}`, received_at: now(), ...extra });
  const heartbeat = setInterval(() => {
    state.heartbeat_at = now();
    try { writeState(state); } catch { signal(); }
  }, 15_000);
  let delay = 5_000;
  let previousTail = previous.tail_id;
  try {
    note('started');
    while (!stopped) {
      let tailId;
      let connectedAt = 0;
      state.phase = 'connecting';
      state.heartbeat_at = now();
      writeState(state);
      try {
        const headers = await auth();
        if (previousTail) {
          // Only retire a tail ID previously created by this observer.
          try { await api(`${workerPath}/tails/${encodeURIComponent(previousTail)}`, headers, 'DELETE'); } catch { /* expires server-side */ }
          previousTail = undefined;
        }
        if (stopped) break;
        const tail = await api(`${workerPath}/tails`, headers, 'POST', { filters: [{ query: 'verify_code.' }] });
        tailId = tail.id;
        if (!tailId || typeof tail.url !== 'string' || !tail.url.startsWith('wss://')) throw failure('invalid_tail_response');
        state.tail_id = tailId;
        state.expires_at = tail.expires_at;
        writeState(state);
        if (stopped) break;
        const expiration = Date.parse(tail.expires_at);
        const renewIn = Number.isFinite(expiration) ? Math.max(1000, Math.min(expiration - Date.now() - 60_000, 5 * 3600_000)) : 3600_000;
        await new Promise((resolve, reject) => {
          socket = new WebSocket(tail.url, 'trace-v1', { handshakeTimeout: 20_000, maxPayload: 8 * 1024 * 1024 });
          let lastPong = Date.now();
          const ping = setInterval(() => {
            if (Date.now() - lastPong > 35_000) socket.terminate();
            else if (socket.readyState === WebSocket.OPEN) socket.ping();
          }, 10_000);
          const renew = setTimeout(() => socket.close(), renewIn);
          socket.on('open', () => {
            connectedAt = Date.now();
            lastPong = connectedAt;
            state.phase = 'connected';
            state.connected_at = now();
            state.last_pong_at = null;
            state.last_error = null;
            socket.send(JSON.stringify({ debug: false }));
            note('connected');
            state.heartbeat_at = now();
            writeState(state);
          });
          socket.on('pong', () => { lastPong = Date.now(); state.last_pong_at = now(); });
          socket.on('message', data => {
            state.frames_received++;
            let frame;
            try { frame = JSON.parse(data.toString()); }
            catch { state.invalid_frames = (state.invalid_frames || 0) + 1; return; }
            try {
              for (const row of sanitizeTail(frame)) {
                append(row);
                state.events_saved++;
                state.last_event_at = row.received_at;
              }
            } catch { state.last_error = 'log_write_failed'; socket.terminate(); }
          });
          socket.on('error', () => { state.last_error = 'websocket_failed'; socket.terminate(); });
          socket.on('close', () => {
            clearInterval(ping);
            clearTimeout(renew);
            socket = undefined;
            state.phase = stopped ? 'stopping' : 'disconnected';
            try { note('disconnected'); resolve(); } catch { reject(failure('log_write_failed')); }
          });
        });
      } catch (error) {
        state.last_error = errorCode(error);
        note('error', { code: state.last_error });
      } finally {
        if (tailId) {
          try { await api(`${workerPath}/tails/${encodeURIComponent(tailId)}`, await auth(), 'DELETE'); }
          catch { note('cleanup_failed'); }
        }
        delete state.tail_id;
      }
      state.phase = stopped ? 'stopping' : 'reconnecting';
      state.heartbeat_at = now();
      writeState(state);
      prune();
      if (!stopped) {
        if (connectedAt && Date.now() - connectedAt > 60_000) delay = 5_000;
        await new Promise(resolve => { const timer = setTimeout(resolve, delay); wake = () => { clearTimeout(timer); resolve(); }; });
        wake = undefined;
        delay = Math.min(delay * 2, 60_000);
      }
    }
  } finally {
    clearInterval(heartbeat);
    state.phase = 'stopped';
    state.heartbeat_at = now();
    writeState(state);
    note('stopped');
  }
}

async function doctor() {
  const headers = await auth();
  const settings = await api(`${workerPath}/settings`, headers);
  const deployments = await api(`${workerPath}/deployments`, headers);
  let historical;
  try {
    await api('/workers/observability/telemetry/keys', headers, 'POST', { timeframe: { from: Date.now() - 3600_000, to: Date.now() } });
    historical = 'available';
  } catch (error) { historical = errorCode(error); }
  console.log(JSON.stringify({ worker, observability: settings.observability, deployments: deployments.deployments?.map(d => ({ id: d.id, created_on: d.created_on, versions: d.versions })), historical_log_access: historical }, null, 2));
}

async function install() {
  if (process.platform !== 'darwin') throw failure('launchd_requires_macos');
  prepareDirectory();
  const agent = path.join(os.homedir(), 'Library/LaunchAgents', `${label}.plist`);
  const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  fs.mkdirSync(path.dirname(agent), { recursive: true });
  fs.writeFileSync(agent, `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(script)}</string><string>watch</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(path.dirname(process.execPath))}:/usr/bin:/bin:/usr/sbin:/sbin</string><key>KS_CF_ACCOUNT_ID</key><string>${xml(account)}</string><key>KS_CF_WORKER</key><string>${xml(worker)}</string><key>KS_VERIFICATION_LOG_DIR</key><string>${xml(directory)}</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>30</integer>
<key>StandardOutPath</key><string>/dev/null</string><key>StandardErrorPath</key><string>/dev/null</string>
</dict></plist>\n`, { mode: 0o600 });
  const domain = `gui/${process.getuid()}`;
  try { await exec('/bin/launchctl', ['bootout', `${domain}/${label}`]); } catch { /* not installed yet */ }
  await exec('/bin/launchctl', ['bootstrap', domain, agent]);
  console.log(JSON.stringify({ installed: label, logs: directory, plist: agent }));
}

async function main() {
  const command = process.argv[2];
  if (command === 'watch') return watch();
  if (command === 'install') return install();
  if (command === 'doctor') return doctor();
  if (command === 'status') {
    const state = readState();
    console.log(JSON.stringify({ ...state, healthy: statusHealth(state), logs: directory }, null, 2));
    return;
  }
  if (command === 'events') {
    const date = process.argv[3] || now().slice(0, 10);
    if (!/^\d{4}-\d\d-\d\d$/.test(date)) throw failure('invalid_date');
    const filename = path.join(directory, `${date}.jsonl`);
    if (fs.existsSync(filename)) process.stdout.write(fs.readFileSync(filename, 'utf8'));
    return;
  }
  console.log('Usage: node scripts/verification-observe.mjs install|status|doctor|events [YYYY-MM-DD]\nDates are UTC. install starts a launchd observer; watch is its internal entry point.\nLogs retain 30 days of allowlisted metadata only. Check status and observer connection gaps before interpreting missing events.\nRequires this Mac to be awake and the user session logged in; screen lock is supported. Historical cloud API access is separate.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  main().catch(error => { console.error(JSON.stringify({ error: errorCode(error) })); process.exitCode = 1; });
}
