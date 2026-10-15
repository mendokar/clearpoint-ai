/**
 * Firestore en memoria con la parte de la API de firebase-admin que usa el código:
 * collection().doc(), get(), set(merge), runTransaction(get/set).
 * Las transacciones se serializan para emular la atomicidad.
 */
type Data = Record<string, unknown>;

export class FakeFirestore {
  store = new Map<string, Data>();
  writes: string[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  collection(name: string) {
    return {
      doc: (id: string) => this.doc(`${name}/${id}`),
    };
  }

  doc(path: string) {
    return {
      path,
      id: path.split("/").pop()!,
      get: async () => this.snapshot(path),
      set: async (data: Data, opts?: { merge?: boolean }) => this.write(path, data, opts),
    };
  }

  snapshot(path: string) {
    const data = this.store.get(path);
    return { exists: data !== undefined, id: path.split("/").pop(), data: () => (data ? structuredClone(data) : undefined) };
  }

  write(path: string, data: Data, opts?: { merge?: boolean }) {
    const clean = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, isSentinel(v) ? new Date(0) : v]),
    );
    this.store.set(path, opts?.merge ? { ...(this.store.get(path) ?? {}), ...clean } : clean);
    this.writes.push(path);
  }

  runTransaction<T>(fn: (tx: FakeTx) => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const pending: [string, Data, { merge?: boolean } | undefined][] = [];
      const tx: FakeTx = {
        get: async (ref) => this.snapshot(ref.path),
        set: (ref, data, opts) => {
          pending.push([ref.path, data, opts]);
          return tx;
        },
      };
      const result = await fn(tx);
      for (const [p, d, o] of pending) this.write(p, d, o);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }
}

type Ref = { path: string };
export type FakeTx = {
  get: (ref: Ref) => Promise<ReturnType<FakeFirestore["snapshot"]>>;
  set: (ref: Ref, data: Data, opts?: { merge?: boolean }) => FakeTx;
};

function isSentinel(v: unknown) {
  return typeof v === "object" && v !== null && v.constructor?.name?.includes("FieldValue");
}
