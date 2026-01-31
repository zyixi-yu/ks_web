export function defaultCache(): Cache {
  if ((globalThis as any).__KS_NO_CACHE) {
    const noop: Cache = {
      match: async () => undefined,
      matchAll: async () => [],
      put: async () => {},
      delete: async () => false,
      keys: async () => [],
    } as any;
    return noop;
  }
  return (caches as unknown as { default: Cache }).default;
}
