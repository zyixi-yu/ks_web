const base64map = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export type CreditsResponse = {
  code?: string;
  replays?: number;
  penalty?: number;
  updated?: number;
};

function intToGalaxyB64(num: string | number | bigint): string {
  let n = BigInt(num);
  if (n === 0n) return base64map[0];
  const chars: string[] = [];
  while (n > 0n) {
    chars.push(base64map[Number(n % 64n)]);
    n = n / 64n;
  }
  return chars.reverse().join("");
}

export function decodeCreditCode(code: string): { amount: number; lucy_credits: number } {
  const hashPart = code.split("/")[0];
  const payload = intToGalaxyB64(hashPart);
  const parts = payload.split("_");
  if (parts.length !== 3) throw new Error("Invalid code format");
  return {
    amount: parseInt(parts[1] || "0", 10),
    lucy_credits: parseInt(parts[2] || "0", 10),
  };
}

export function computeCreditBreakdown(data: CreditsResponse, decoded: { lucy_credits: number }) {
  const replays = data.replays ?? 0;
  const penalty = data.penalty ?? 0;
  const base = replays * 2 - penalty * 10;
  const bonus = (decoded.lucy_credits || 0) - base;
  return { replays, penalty, base, bonus };
}

