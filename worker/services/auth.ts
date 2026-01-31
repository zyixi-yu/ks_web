export function parseBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const v = authorizationHeader.trim();
  if (!v) return null;
  const [scheme, rest] = v.split(/\s+/, 2);
  if (!scheme || !rest) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.trim();
  return token ? token : null;
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

