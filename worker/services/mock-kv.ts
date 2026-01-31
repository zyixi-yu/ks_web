type KVGetValueType = "text" | "json" | "arrayBuffer" | "stream";

function normalizeType(typeOrOptions: unknown): KVGetValueType | undefined {
  if (!typeOrOptions) return undefined;
  if (typeof typeOrOptions === "string") return typeOrOptions as KVGetValueType;
  if (typeof typeOrOptions === "object" && typeOrOptions && "type" in (typeOrOptions as any)) {
    const t = (typeOrOptions as any).type;
    if (typeof t === "string") return t as KVGetValueType;
  }
  return undefined;
}

export function createMockKvNamespace(values: Record<string, string>): KVNamespace {
  const map = new Map(Object.entries(values));

  const get: KVNamespace["get"] = (async (key: string, typeOrOptions?: any) => {
    const raw = map.get(key);
    if (raw == null) return null;
    const type = normalizeType(typeOrOptions);
    if (!type || type === "text") return raw;
    if (type === "json") return JSON.parse(raw);
    if (type === "arrayBuffer") return new TextEncoder().encode(raw).buffer;
    if (type === "stream") return new Response(raw).body;
    return raw;
  }) as any;

  const getWithMetadata: KVNamespace["getWithMetadata"] = (async (key: string, typeOrOptions?: any) => {
    const value = await (get as any)(key, typeOrOptions);
    return { value, metadata: null };
  }) as any;

  const kv: KVNamespace = {
    get,
    getWithMetadata,
    put: async () => {
      throw new Error("Mock KV is read-only");
    },
    delete: async () => {
      throw new Error("Mock KV is read-only");
    },
    list: (async () => {
      return {
        keys: Array.from(map.keys()).map((name) => ({ name })),
        list_complete: true,
        cursor: "",
      };
    }) as any,
  };

  return kv;
}
