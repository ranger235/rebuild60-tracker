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

const SCHEMA_VERSION = 1;

function cleanScopePart(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildArtifactId(type: ArtifactType, scope: ArtifactScope = {}): string {
  const parts = [
    type,
    cleanScopePart(scope.userId) ?? "anon",
    cleanScopePart(scope.monthKey),
    cleanScopePart(scope.asOf),
    cleanScopePart(scope.pose),
    cleanScopePart(scope.scope),
    cleanScopePart(scope.focus)
  ].filter(Boolean) as string[];

  return parts.join(":");
}

export function isArtifactEnvelope(value: unknown): value is ArtifactEnvelope<unknown> {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.schemaVersion === "number" &&
    typeof v.artifactType === "string" &&
    typeof v.id === "string" &&
    typeof v.createdAt === "string" &&
    !!v.scope &&
    typeof v.scope === "object" &&
    "payload" in v
  );
}

export function wrapArtifact<T>(
  artifactType: ArtifactType,
  scope: ArtifactScope,
  payload: T,
  nowIso = new Date().toISOString()
): ArtifactEnvelope<T> {
  return {
    schemaVersion: SCHEMA_VERSION,
    artifactType,
    id: buildArtifactId(artifactType, scope),
    createdAt: nowIso,
    updatedAt: nowIso,
    scope,
    payload
  };
}

function tryParseJson(raw: string | null): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readSingletonArtifact<T>(
  storageKey: string,
  artifactType: ArtifactType,
  fallbackScope: ArtifactScope = {}
): T | null {
  const parsed = tryParseJson(localStorage.getItem(storageKey));
  if (parsed == null) return null;

  if (isArtifactEnvelope(parsed) && parsed.artifactType === artifactType) {
    return parsed.payload as T;
  }

  if (typeof parsed !== "object") return null;

  const envelope = wrapArtifact(artifactType, fallbackScope, parsed as T);
  localStorage.setItem(storageKey, JSON.stringify(envelope));
  return parsed as T;
}

export function writeSingletonArtifact<T>(
  storageKey: string,
  artifactType: ArtifactType,
  payload: T,
  scope: ArtifactScope = {}
): ArtifactEnvelope<T> {
  const nowIso = new Date().toISOString();
  const envelope = wrapArtifact(artifactType, { ...scope, asOf: scope.asOf ?? nowIso }, payload, nowIso);
  localStorage.setItem(storageKey, JSON.stringify(envelope));
  return envelope;
}

export function migrateSingletonArtifact(
  storageKey: string,
  artifactType: ArtifactType,
  fallbackScope: ArtifactScope = {}
): ArtifactEnvelope<unknown> | null {
  const parsed = tryParseJson(localStorage.getItem(storageKey));
  if (parsed == null) return null;

  if (isArtifactEnvelope(parsed) && parsed.artifactType === artifactType) {
    return parsed;
  }

  if (typeof parsed !== "object") {
    console.warn(`[artifacts] Skipping malformed artifact for ${storageKey}`);
    return null;
  }

  const envelope = wrapArtifact(artifactType, fallbackScope, parsed);
  localStorage.setItem(storageKey, JSON.stringify(envelope));
  return envelope;
}

