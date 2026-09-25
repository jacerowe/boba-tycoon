// Runtime overrides from the URL, e.g. ?balance.rush.speedMult=1.8 or ?feel.shake.windowSec=2
// Applied once when a config module loads. Safe in Node (tests): no-op without `location`.

type AnyObj = Record<string, unknown>;

function readSearch(): string {
  try {
    const loc = (globalThis as { location?: { search?: string } }).location;
    return loc?.search ?? '';
  } catch {
    return '';
  }
}

function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  if (raw.trim() !== '' && Number.isFinite(n)) return n;
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try { return JSON.parse(raw); } catch { /* fall through */ }
  }
  return raw;
}

export const appliedOverrides: { key: string; value: unknown; ok: boolean }[] = [];

/** Set `obj.a.b.c = value` for a dotted path. Returns false if the path does not exist. */
export function setPath(obj: AnyObj, path: string, value: unknown): boolean {
  const parts = path.split('.');
  let cur: AnyObj = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
    if (typeof next !== 'object' || next === null) return false;
    cur = next as AnyObj;
  }
  const last = parts[parts.length - 1];
  if (!(last in cur)) return false;
  const prev = cur[last];
  if (typeof prev === 'number' && typeof value !== 'number') return false;
  cur[last] = value;
  return true;
}

export function getPath(obj: AnyObj, path: string): unknown {
  let cur: unknown = obj;
  for (const p of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as AnyObj)[p];
  }
  return cur;
}

export function applyUrlOverrides<T extends object>(prefix: string, target: T, search = readSearch()): T {
  if (!search) return target;
  const params = new URLSearchParams(search);
  params.forEach((raw, key) => {
    if (!key.startsWith(prefix + '.')) return;
    const path = key.slice(prefix.length + 1);
    const value = parseValue(raw);
    const ok = setPath(target as AnyObj, path, value);
    appliedOverrides.push({ key, value, ok });
    if (!ok) console.warn(`[overrides] unknown or mistyped key: ${key}`);
  });
  return target;
}
