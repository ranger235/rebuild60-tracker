import type Dexie from "dexie";

/**
 * Full-system Backup / Restore for Rebuild @ 60 Tracker.
 *
 * Design goals:
 * - Single JSON file
 * - Versioned envelope
 * - Safe default import: MERGE (non-destructive)
 * - Optional REPLACE mode: wipe local Dexie and restore from file
 *
 * Notes:
 * - MERGE uses primary keys and will only overwrite when BOTH records have an
 *   `updatedAt` number and the incoming record is newer.
 * - For tables without `updatedAt`, MERGE will NOT overwrite existing rows.
 */

export type BackupMeta = {
  app: "rebuild60";
  backupVersion: 1;
  createdAt: string; // ISO
  dexieSchemaVersion: number; // localdb.verno
};

export type BackupEnvelopeV1 = {
  meta: BackupMeta;
  tables: Record<string, any[]>;
};

export type ImportMode = "MERGE" | "REPLACE";

function isObject(v: unknown): v is Record<string, any> {
  return typeof v === "object" && v !== null;
}

export function validateBackupEnvelope(raw: unknown): BackupEnvelopeV1 {
  if (!isObject(raw)) throw new Error("Backup JSON is not an object.");
  const meta = (raw as any).meta;
  const tables = (raw as any).tables;

  if (!isObject(meta) || meta.app !== "rebuild60") {
    throw new Error("That file doesn't look like a Rebuild @ 60 backup.");
  }
  if (meta.backupVersion !== 1) {
    throw new Error(`Unsupported backupVersion: ${String(meta.backupVersion)}`);
  }
  if (!isObject(tables)) {
    throw new Error("Backup JSON is missing 'tables'.");
  }
  return raw as BackupEnvelopeV1;
}

function getUpdatedAt(row: any): number | null {
  const v = row?.updatedAt;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function getPrimaryKeyPath(table: any): string | string[] | null {
  const kp = table?.schema?.primKey?.keyPath;
  if (typeof kp === "string") return kp;
  if (Array.isArray(kp) && kp.every((x) => typeof x === "string")) return kp as string[];
  return null;
}

function readKeyFromRow(row: any, keyPath: string | string[]): any {
  if (!row) return undefined;
  if (typeof keyPath === "string") return row[keyPath];
  return keyPath.map((k) => row[k]);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function exportFullBackup(db: Dexie): Promise<BackupEnvelopeV1> {
  const dexieAny = db as any;
  const tableList: any[] = dexieAny.tables ?? [];

  const tables: Record<string, any[]> = {};
  for (const t of tableList) {
    const name = t.name as string;
    tables[name] = await t.toArray();
  }

  return {
    meta: {
      app: "rebuild60",
      backupVersion: 1,
      createdAt: new Date().toISOString(),
      dexieSchemaVersion: (db as any).verno ?? 0
    },
    tables
  };
}

export async function importBackup(db: Dexie, envelope: BackupEnvelopeV1, mode: ImportMode): Promise<{ inserted: number; updated: number; skipped: number; }>{
  const dexieAny = db as any;
  const tableList: any[] = dexieAny.tables ?? [];
  const byName = new Map<string, any>();
  for (const t of tableList) byName.set(t.name, t);

  const allTables: any[] = (db as any).tables;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  if (mode === "REPLACE") {
    await (db as any).transaction("rw", allTables, async () => {
      for (const t of tableList) await t.clear();

      for (const [tableName, rows] of Object.entries(envelope.tables)) {
        const t = byName.get(tableName);
        if (!t) continue;
        if (!Array.isArray(rows) || rows.length === 0) continue;
        await t.bulkPut(rows);
        inserted += rows.length;
      }
    });

    return { inserted, updated, skipped };
  }

  // MERGE mode (safe default)
  await (db as any).transaction("rw", allTables, async () => {
    for (const [tableName, rows] of Object.entries(envelope.tables)) {
      const t = byName.get(tableName);
      if (!t) continue;
      if (!Array.isArray(rows) || rows.length === 0) continue;

      const keyPath = getPrimaryKeyPath(t);
      if (!keyPath) {
        // If we can't determine PK, safest is: do not touch it.
        skipped += rows.length;
        continue;
      }

      const keys = rows.map((r) => readKeyFromRow(r, keyPath)).filter((k) => k !== undefined);
      const keyToRow = new Map<any, any>();
      for (let i = 0; i < rows.length; i++) {
        const k = readKeyFromRow(rows[i], keyPath);
        if (k !== undefined) keyToRow.set(k, rows[i]);
      }

      // Fetch existing in chunks to avoid huge bulkGet arrays.
      const batches = chunk(keys, 500);
      for (const batch of batches) {
        const existingRows = await t.bulkGet(batch);

        const puts: any[] = [];
        for (let i = 0; i < batch.length; i++) {
          const key = batch[i];
          const incoming = keyToRow.get(key);
          const existing = existingRows[i];

          if (!incoming) continue;

          if (!existing) {
            puts.push(incoming);
            inserted += 1;
            continue;
          }

          const inU = getUpdatedAt(incoming);
          const exU = getUpdatedAt(existing);

          if (inU !== null && exU !== null && inU > exU) {
            puts.push(incoming);
            updated += 1;
          } else {
            skipped += 1;
          }
        }

        if (puts.length) await t.bulkPut(puts);
      }
    }
  });

  return { inserted, updated, skipped };
}
