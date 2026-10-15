/**
 * Firestore en memoria con la parte de la API de firebase-admin que usa el código:
 * collection().doc(), get/set(merge)/update/delete, consultas (where ==/>=, orderBy, limit, startAfter,
 * count) y runTransaction(get de documento o consulta, set, update, delete).
 * Las transacciones se serializan para emular la atomicidad. `failWith` simula que Firestore no responde.
 */
import { FieldValue } from "firebase-admin/firestore";

type Data = Record<string, unknown>;
type Filter = { field: string; op: "==" | ">=" | "<=" | ">" | "<"; value: unknown };
type QueryState = { collection: string; filters: Filter[]; order?: { field: string; dir: "asc" | "desc" }; limit?: number; after?: string };

export class FakeFirestore {
  store = new Map<string, Data>();
  writes: string[] = [];
  failWith: Error | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  collection(name: string) {
    return Object.assign(this.query({ collection: name, filters: [] }), {
      doc: (id: string) => this.doc(`${name}/${id}`),
    });
  }

  doc(path: string) {
    return {
      path,
      id: path.split("/").pop()!,
      get: async () => {
        this.check();
        return this.snapshot(path);
      },
      set: async (data: Data, opts?: { merge?: boolean }) => this.write(path, data, opts),
      update: async (data: Data) => this.update(path, data),
      delete: async () => this.remove(path),
    };
  }

  private check() {
    if (this.failWith) throw this.failWith;
  }

  snapshot(path: string) {
    const data = this.store.get(path);
    const id = path.split("/").pop()!;
    return {
      exists: data !== undefined,
      id,
      ref: this.doc(path),
      data: () => (data ? structuredClone(data) : undefined),
      get: (field: string) => (data ? structuredClone(data[field]) : undefined),
    };
  }

  private query(state: QueryState) {
    const q = {
      __query: state,
      where: (field: string, op: Filter["op"], value: unknown) => this.query({ ...state, filters: [...state.filters, { field, op, value }] }),
      orderBy: (field: string, dir: "asc" | "desc" = "asc") => this.query({ ...state, order: { field, dir } }),
      limit: (n: number) => this.query({ ...state, limit: n }),
      startAfter: (snap: { id: string }) => this.query({ ...state, after: snap.id }),
      get: async () => {
        this.check();
        return this.runQuery(state);
      },
      count: () => ({
        get: async () => {
          this.check();
          const size = this.runQuery({ ...state, limit: undefined }).size;
          return { data: () => ({ count: size }) };
        },
      }),
    };
    return q;
  }

  private runQuery(state: QueryState) {
    const prefix = `${state.collection}/`;
    let entries = [...this.store.entries()].filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"));
    for (const f of state.filters) {
      entries = entries.filter(([, d]) => compareOp(d[f.field], f.op, f.value));
    }
    if (state.order) {
      const { field, dir } = state.order;
      entries = entries.filter(([, d]) => d[field] !== undefined);
      entries.sort(([, a], [, b]) => (dir === "asc" ? 1 : -1) * cmp(a[field], b[field]));
    }
    if (state.after) {
      const i = entries.findIndex(([p]) => p === `${prefix}${state.after}`);
      entries = i === -1 ? entries : entries.slice(i + 1);
    }
    if (state.limit !== undefined) entries = entries.slice(0, state.limit);
    const docs = entries.map(([p]) => this.snapshot(p));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }

  write(path: string, data: Data, opts?: { merge?: boolean }) {
    const clean = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, isSentinel(v) ? new Date(0) : v]));
    this.store.set(path, opts?.merge ? { ...(this.store.get(path) ?? {}), ...clean } : clean);
    this.writes.push(path);
  }

  update(path: string, data: Data) {
    if (!this.store.has(path)) throw new Error(`NOT_FOUND: ${path}`);
    this.write(path, data, { merge: true });
  }

  remove(path: string) {
    this.store.delete(path);
    this.writes.push(path);
  }

  runTransaction<T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      this.check();
      const pending: (() => void)[] = [];
      const tx: FakeTx = {
        get: async (ref) => {
          if ("__query" in ref) return this.runQuery(ref.__query) as never;
          return this.snapshot(ref.path) as never;
        },
        set: (ref, data, opts) => {
          pending.push(() => this.write(ref.path, data, opts));
          return tx;
        },
        update: (ref, data) => {
          pending.push(() => this.update(ref.path, data));
          return tx;
        },
        delete: (ref) => {
          pending.push(() => this.remove(ref.path));
          return tx;
        },
      };
      const result = await fn(tx);
      for (const op of pending) op();
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

type Ref = { path: string };
type QueryRef = { __query: QueryState };
type Snap = ReturnType<FakeFirestore["snapshot"]>;
export type FakeTx = {
  get: <R extends Ref | QueryRef>(ref: R) => Promise<R extends QueryRef ? { docs: Snap[]; size: number } : Snap>;
  set: (ref: Ref, data: Data, opts?: { merge?: boolean }) => FakeTx;
  update: (ref: Ref, data: Data) => FakeTx;
  delete: (ref: Ref) => FakeTx;
};

/** Los sentinels (`FieldValue.serverTimestamp()`…) se guardan como fecha fija. */
function isSentinel(v: unknown) {
  return v instanceof FieldValue;
}

function norm(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (v && typeof v === "object" && typeof (v as { toMillis?: unknown }).toMillis === "function") {
    return (v as { toMillis: () => number }).toMillis();
  }
  return v;
}

function cmp(a: unknown, b: unknown): number {
  const x = norm(a) as number | string;
  const y = norm(b) as number | string;
  return x < y ? -1 : x > y ? 1 : 0;
}

function compareOp(a: unknown, op: Filter["op"], b: unknown): boolean {
  if (a === undefined) return false;
  const c = cmp(a, b);
  switch (op) {
    case "==":
      return norm(a) === norm(b);
    case ">=":
      return c >= 0;
    case "<=":
      return c <= 0;
    case ">":
      return c > 0;
    case "<":
      return c < 0;
  }
}
