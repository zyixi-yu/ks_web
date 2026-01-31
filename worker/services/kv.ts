export async function kvGetText(kv: KVNamespace, key: string): Promise<string | null> {
  const body = await kv.get(key, "text");
  if (!body) return null;
  return body;
}

export async function kvGetJson(kv: KVNamespace, key: string): Promise<unknown | null> {
  const body = await kv.get(key, "text");
  if (!body) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error(`KV key JSON parse error: ${key}`);
  }
}

