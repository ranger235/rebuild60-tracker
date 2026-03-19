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

function buildArtifactId(type: ArtifactType, scope: ArtifactScope): string {
  return [
    type,
    scope.userId ?? "anon",
    scope.monthKey ?? "",
    scope.asOf ?? "",
    scope.pose ?? "",
    scope.scope ?? "",
    scope.focus ?? "",
  ]
    .filter(Boolean)
    .join(":");
}

export function isArtifactEnvelope(value: any): value is ArtifactEnvelope<any> {
  return (
    value &&
    typeof value === "object" &&
    "artifactType" in value &&
    "payload" in value &&
    "schemaVersion" in value
  );
}

export function wrapArtifact<T>(
  artifactType: ArtifactType,
  scope: ArtifactScope,
  payload: T
): ArtifactEnvelope<T> {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    artifactType,
    id: buildArtifactId(artifactType, scope),
    createdAt: now,
    scope,
    payload,
  };
}

// ✅ FIX: missing export
export function migrateSingletonArtifact<T>(
  storageKey: string,
  artifactType: ArtifactType
): T | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (isArtifactEnvelope(parsed)) {
      return parsed.payload as T;
    }

    const wrapped = wrapArtifact(
      artifactType,
      { asOf: new Date().toISOString() },
      parsed
    );

    localStorage.setItem(storageKey, JSON.stringify(wrapped));

    return parsed as T;
  } catch (err) {
    console.warn("migrateSingletonArtifact failed:", storageKey, err);
    return null;
  }
}

export function safeReadArtifactHistory<T>(
  storageKey: string,
  artifactType: ArtifactType
): ArtifactEnvelope<T>[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((entry: any) => {
      if (isArtifactEnvelope(entry)) return entry;
      return wrapArtifact(artifactType, { asOf: new Date().toISOString() }, entry);
    });
  } catch {
    return [];
  }
}

export function writeArtifactHistory<T>(
  storageKey: string,
  artifacts: ArtifactEnvelope<T>[]
) {
  localStorage.setItem(storageKey, JSON.stringify(artifacts));
}



