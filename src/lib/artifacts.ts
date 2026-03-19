export type ArtifactType =
  | "program_state"
  | "block_plan"
  | "friction_profile"
  | "next_session_priority"
  | "progress_scorecard"
  | "progress_ai_analysis"
  | "progress_vision_analysis";

export type ArtifactScope = {
  userId?: string | null;
  monthKey?: string | null;
  asOf?: string | null;
  pose?: string | null;
  scope?: string | null;
  focus?: string | null;
};

export type ArtifactEnvelope<T> = {
  schemaVersion: number;
  artifactType: ArtifactType;
  id: string;
  createdAt: string;
  updatedAt?: string;
  scope: ArtifactScope;
  payload: T;
};

const CURRENT_SCHEMA_VERSION = 1;

function cleanPart(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "na";
}

export function buildArtifactId(type: ArtifactType, scope: ArtifactScope = {}): string {
  const parts = [
    type,
    scope.userId,
    scope.monthKey,
    scope.asOf,
    scope.pose,
    scope.scope,
    scope.focus,
  ].filter((part) => part != null && String(part).trim() !== "");
  return parts.map(cleanPart).join(":");
}

export function isArtifactEnvelope<T = unknown>(value: unknown): value is ArtifactEnvelope<T> {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.schemaVersion === "number" &&
    typeof v.artifactType === "string" &&
    typeof v.id === "string" &&
    typeof v.createdAt === "string" &&
    !!v.scope && typeof v.scope === "object" &&
    "payload" in v
  );
}

export function wrapArtifact<T>(
  artifactType: ArtifactType,
  payload: T,
  scope: ArtifactScope = {},
  options?: { createdAt?: string; updatedAt?: string }
): ArtifactEnvelope<T> {
  const createdAt = options?.createdAt || inferCreatedAt(payload) || new Date().toISOString();
  const normalizedScope = normalizeScope(artifactType, payload, scope, createdAt);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    artifactType,
    id: buildArtifactId(artifactType, normalizedScope),
    createdAt,
    updatedAt: options?.updatedAt,
    scope: normalizedScope,
    payload,
  };
}

function inferCreatedAt(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const candidates = [p.ts, p.createdAt, p.updatedAt, p.asOf];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return null;
}

function monthKeyFromTs(ts: string | null | undefined): string | null {
  if (!ts || typeof ts !== "string") return null;
  return ts.slice(0, 7) || null;
}

function normalizeScope(
  artifactType: ArtifactType,
  payload: unknown,
  scope: ArtifactScope = {},
  fallbackTs?: string | null,
): ArtifactScope {
  const base: ArtifactScope = { ...scope };
  const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};

  if (!base.monthKey && typeof p.monthKey === "string") base.monthKey = p.monthKey;
  if (!base.asOf && typeof p.asOf === "string") base.asOf = p.asOf;
  if (!base.pose && typeof p.pose === "string") base.pose = p.pose;
  if (!base.scope && typeof p.scope === "string") base.scope = p.scope;
  if (!base.focus && typeof p.focus === "string") base.focus = p.focus;

  if (!base.monthKey && (artifactType === "progress_ai_analysis" || artifactType === "progress_vision_analysis" || artifactType === "progress_scorecard")) {
    base.monthKey = monthKeyFromTs((typeof p.ts === "string" ? p.ts : null) || fallbackTs || null);
  }

  if (!base.asOf && (artifactType === "program_state" || artifactType === "block_plan" || artifactType === "friction_profile" || artifactType === "next_session_priority")) {
    base.asOf = typeof p.asOf === "string" ? p.asOf : monthKeyFromTs((typeof p.ts === "string" ? p.ts : null) || fallbackTs || null);
  }

  return base;
}

function validatePayloadForType(artifactType: ArtifactType, payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  switch (artifactType) {
    case "progress_scorecard":
      return typeof p.monthKey === "string" && typeof p.ts === "string";
    case "progress_ai_analysis":
      return typeof p.text === "string" && typeof p.ts === "string";
    case "progress_vision_analysis":
      return typeof p.text === "string" && typeof p.ts === "string" && typeof p.pose === "string";
    default:
      return true;
  }
}

export function normalizeLegacyArtifact<T>(
  artifactType: ArtifactType,
  raw: unknown,
  scopeHint: ArtifactScope = {}
): ArtifactEnvelope<T> | null {
  if (!raw) return null;

  if (isArtifactEnvelope<T>(raw)) {
    if (!validatePayloadForType(artifactType, raw.payload)) return null;
    const normalizedScope = normalizeScope(artifactType, raw.payload, { ...scopeHint, ...raw.scope }, raw.createdAt);
    return {
      ...raw,
      schemaVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : CURRENT_SCHEMA_VERSION,
      artifactType,
      id: buildArtifactId(artifactType, normalizedScope),
      scope: normalizedScope,
    };
  }

  if (!validatePayloadForType(artifactType, raw)) return null;
  return wrapArtifact<T>(artifactType, raw as T, scopeHint, { createdAt: inferCreatedAt(raw) || undefined });
}

export function dedupeArtifacts<T>(items: ArtifactEnvelope<T>[]): ArtifactEnvelope<T>[] {
  const sorted = [...items].sort((a, b) => {
    const aScore = scopeSpecificity(a.scope);
    const bScore = scopeSpecificity(b.scope);
    if (b.createdAt !== a.createdAt) return b.createdAt.localeCompare(a.createdAt);
    if (bScore !== aScore) return bScore - aScore;
    return 0;
  });

  const seen = new Set<string>();
  const out: ArtifactEnvelope<T>[] = [];
  for (const item of sorted) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function scopeSpecificity(scope: ArtifactScope): number {
  return [scope.userId, scope.monthKey, scope.asOf, scope.pose, scope.scope, scope.focus].filter(Boolean).length;
}

export function safeReadArtifactHistory<T>(
  storageKey: string,
  artifactType: ArtifactType,
  scopeHint: ArtifactScope = {}
): ArtifactEnvelope<T>[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map((item) => normalizeLegacyArtifact<T>(artifactType, item, scopeHint))
      .filter((item): item is ArtifactEnvelope<T> => !!item);
    return dedupeArtifacts(normalized);
  } catch {
    return [];
  }
}

export function writeArtifactHistory<T>(storageKey: string, items: ArtifactEnvelope<T>[], limit = 24): void {
  const normalized = dedupeArtifacts(items).slice(0, limit);
  localStorage.setItem(storageKey, JSON.stringify(normalized));
}
