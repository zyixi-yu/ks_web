import app from "./app";
import { MOCK_KV } from "./mock-data.generated";
import { createMockKvNamespace } from "./services/mock-kv";

(globalThis as any).__KS_NO_CACHE = true;

const mockKv = createMockKvNamespace(MOCK_KV);

const fallbackAssets: Fetcher = {
  fetch: async () => new Response("Assets not available in mock worker.", { status: 404 }),
  connect: (() => {
    throw new Error("Assets fetcher connect() not available in mock worker.");
  }) as any,
};

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const mergedEnv = {
      ...env,
      KS_KV: mockKv,
      ASSETS: env.ASSETS ?? fallbackAssets,
    } as Env;
    return Promise.resolve(app.fetch(request, mergedEnv, ctx));
  },
};
