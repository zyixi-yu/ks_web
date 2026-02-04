export type JsonDiffKind = "add" | "remove" | "change";

export type JsonDiffEntry = {
  kind: JsonDiffKind;
  path: string;
  before?: unknown;
  after?: unknown;
};

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function sameValue(a: unknown, b: unknown): boolean {
  // Object.is handles NaN / -0 properly
  return Object.is(a, b);
}

function formatPath(path: Array<string | number>): string {
  if (!path.length) return "$";
  return (
    "$" +
    path
      .map((p) => {
        if (typeof p === "number") return `[${p}]`;
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(p) ? `.${p}` : `[${JSON.stringify(p)}]`;
      })
      .join("")
  );
}

export function diffJson(a: unknown, b: unknown): JsonDiffEntry[] {
  const out: JsonDiffEntry[] = [];

  const walk = (before: unknown, after: unknown, path: Array<string | number>) => {
    if (sameValue(before, after)) return;

    if (Array.isArray(before) && Array.isArray(after)) {
      // Arrays are typically treated as replace for config blobs to avoid noisy diffs.
      out.push({ kind: "change", path: formatPath(path), before, after });
      return;
    }

    if (isPlainObject(before) && isPlainObject(after)) {
      const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
      for (const key of Array.from(keys).sort()) {
        const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
        const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
        if (hasBefore && !hasAfter) {
          out.push({ kind: "remove", path: formatPath([...path, key]), before: before[key] });
          continue;
        }
        if (!hasBefore && hasAfter) {
          out.push({ kind: "add", path: formatPath([...path, key]), after: after[key] });
          continue;
        }
        walk(before[key], after[key], [...path, key]);
      }
      return;
    }

    out.push({ kind: "change", path: formatPath(path), before, after });
  };

  walk(a, b, []);
  return out;
}

