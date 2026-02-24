import Dexie, { type Table } from "dexie";

export type PendingOp = {
  id?: number;
  createdAt: number;
  op: "upsert_daily" | "upsert_nutrition" | "insert_zone2" | "create_workout";
  payload: any;
  status: "queued" | "retry";
  lastError?: string;
};

export class RebuildDB extends Dexie {
  pendingOps!: Table<PendingOp, number>;

  constructor() {
    super("rebuild60_local");
    this.version(1).stores({
      pendingOps: "++id, createdAt, op, status"
    });
  }
}

export const localdb = new RebuildDB();
