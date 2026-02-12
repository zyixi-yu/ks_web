import init, { parse_replay } from "../wasm/ks_replay_parser/pkg/ks_replay_parser.js";

export type ReplayInspectRequest = {
  id: number;
  buffer: ArrayBuffer;
};

export type ReplayInspectResult = {
  map_name: string;
  supported: boolean;
  players: Array<{ name: string; handle: string; role: string }>;
};

export type ReplayInspectResponse =
  | { id: number; ok: true; result: ReplayInspectResult }
  | { id: number; ok: false; error: string };

let ready: Promise<unknown> | null = null;
async function ensureReady() {
  if (!ready) {
    ready = init();
  }
  await ready;
}

self.onmessage = async (evt: MessageEvent<ReplayInspectRequest>) => {
  const { id, buffer } = evt.data;

  try {
    await ensureReady();
    const bytes = new Uint8Array(buffer);
    const result = parse_replay(bytes) as ReplayInspectResult;
    (self as unknown as Worker).postMessage({ id, ok: true, result } satisfies ReplayInspectResponse);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    (self as unknown as Worker).postMessage({ id, ok: false, error: msg } satisfies ReplayInspectResponse);
  }
};
