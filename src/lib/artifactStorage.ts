export type ArtifactEnvelopeKind = "progress_scorecards" | "progress_ai_history" | "progress_vision_history";

export type ArtifactEnvelope<T> = {
  version: 1;
  kind: ArtifactEnvelopeKind;
  updatedAt: string;
  items: T[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readEnvelopeItems<T>(parsed: unknown, expectedKind: ArtifactEnvelopeKind): T[] | null {
  if (!isRecord(parsed)) return null;
  if (parsed.kind !== expectedKind) return null;
  if (!Array.isArray(parsed.items)) return null;
  return parsed.items as T[];
}

export function loadArtifactHistory<T>(opts: {
  key: string;
  kind: ArtifactEnvelopeKind;
  normalize: (value: unknown) => T | null;
  limit?: number;
}): T[] {
  if (typeof localStorage === "undefined") return [];
  const parsed = safeParse(localStorage.getItem(opts.key));
  const source = Array.isArray(parsed) ? parsed : readEnvelopeItems<unknown>(parsed, opts.kind);
  if (!source || source.length === 0) return [];

  const normalized: T[] = [];
  for (const item of source) {
    const next = opts.normalize(item);
    if (next) normalized.push(next);
  }

  return typeof opts.limit === "number" ? normalized.slice(0, opts.limit) : normalized;
}

export function saveArtifactHistory<T>(opts: {
  key: string;
  kind: ArtifactEnvelopeKind;
  items: T[];
  limit?: number;
}): void {
  if (typeof localStorage === "undefined") return;
  const items = typeof opts.limit === "number" ? opts.items.slice(0, opts.limit) : opts.items;
  const envelope: ArtifactEnvelope<T> = {
    version: 1,
    kind: opts.kind,
    updatedAt: new Date().toISOString(),
    items,
  };
  localStorage.setItem(opts.key, JSON.stringify(envelope));
}

