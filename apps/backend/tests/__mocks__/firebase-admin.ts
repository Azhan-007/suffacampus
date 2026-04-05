/**
 * Mock for src/lib/firebase-admin.ts
 *
 * Provides in-memory stubs for Firestore, Auth, and Storage so that
 * unit tests never touch a real Firebase project.
 */

/* ------------------------------------------------------------------ */
/* Firestore mocks                                                     */
/* ------------------------------------------------------------------ */

export interface MockDocData {
  [key: string]: unknown;
}

/** In-memory store: collection → docId → data */
const store: Map<string, Map<string, MockDocData>> = new Map();

/**
 * Reset the entire in-memory store between tests.
 */
export function resetFirestoreMock(): void {
  store.clear();
}

/**
 * Seed a document into the in-memory store.
 */
export function seedDoc(collection: string, docId: string, data: MockDocData): void {
  if (!store.has(collection)) store.set(collection, new Map());
  store.get(collection)!.set(docId, { ...data });
}

/**
 * Get raw doc data (for assertions).
 */
export function getDoc(collection: string, docId: string): MockDocData | undefined {
  return store.get(collection)?.get(docId);
}

/**
 * Get all docs in a collection (for assertions).
 */
export function getAllDocs(collection: string): Map<string, MockDocData> {
  return store.get(collection) ?? new Map();
}

// ---------------------------------------------------------------------------
// Firestore query chain builder
// ---------------------------------------------------------------------------

/**
 * Resolve a value to a comparable primitive.
 * Handles Firestore Timestamp-like objects (with toMillis/seconds) and strings.
 */
function resolveComparable(val: unknown): number | string | null {
  if (val == null) return null;
  if (typeof val === "number" || typeof val === "string") return val;
  if (typeof val === "object" && val !== null) {
    // Timestamp-like (our mock or real Firestore Timestamp)
    if ("toMillis" in val && typeof (val as any).toMillis === "function") {
      return (val as any).toMillis();
    }
    if ("seconds" in val && typeof (val as any).seconds === "number") {
      return (val as any).seconds * 1000;
    }
  }
  return null;
}

class MockQuerySnapshot {
  constructor(public docs: MockDocSnapshot[]) {}
  get empty(): boolean {
    return this.docs.length === 0;
  }
  get size(): number {
    return this.docs.length;
  }
  data(): { count: number } {
    return { count: this.docs.length };
  }
}

class MockDocSnapshot {
  public ref: MockDocRef;
  constructor(
    public id: string,
    private _data: MockDocData | undefined,
    collection?: string
  ) {
    this.ref = new MockDocRef(collection ?? "_unknown", id);
  }
  get exists(): boolean {
    return this._data !== undefined;
  }
  data(): MockDocData | undefined {
    return this._data ? { ...this._data } : undefined;
  }
}

class MockDocRef {
  public readonly id: string;
  constructor(
    private _collection: string,
    _id: string
  ) {
    this.id = _id;
  }

  async get(): Promise<MockDocSnapshot> {
    const data = store.get(this._collection)?.get(this.id);
    return new MockDocSnapshot(this.id, data, this._collection);
  }

  async set(data: MockDocData): Promise<void> {
    if (!store.has(this._collection)) store.set(this._collection, new Map());
    store.get(this._collection)!.set(this.id, { ...data });
  }

  async update(data: MockDocData): Promise<void> {
    const colMap = store.get(this._collection);
    if (!colMap || !colMap.has(this.id)) {
      throw new Error(`Document ${this._collection}/${this.id} does not exist`);
    }
    const existing = colMap.get(this.id)!;
    colMap.set(this.id, { ...existing, ...data });
  }

  async delete(): Promise<void> {
    store.get(this._collection)?.delete(this.id);
  }
}

class MockQuery {
  private _filters: Array<{
    field: string;
    op: string;
    value: unknown;
  }> = [];
  private _limitVal?: number;
  private _offsetVal?: number;
  private _startAfterDoc?: MockDocSnapshot;

  constructor(private _collection: string) {}

  where(field: string, op: string, value: unknown): MockQuery {
    const q = this._clone();
    q._filters.push({ field, op, value });
    return q;
  }

  limit(n: number): MockQuery {
    const q = this._clone();
    q._limitVal = n;
    return q;
  }

  offset(n: number): MockQuery {
    const q = this._clone();
    q._offsetVal = n;
    return q;
  }

  startAfter(_doc: unknown): MockQuery {
    const q = this._clone();
    // simplified: just skip first N docs
    return q;
  }

  orderBy(_field: string, _dir?: string): MockQuery {
    return this._clone();
  }

  select(..._fields: string[]): MockQuery {
    return this._clone();
  }

  count(): { get: () => Promise<{ data: () => { count: number } }> } {
    return {
      get: async () => {
        const docs = this._applyFilters();
        return { data: () => ({ count: docs.length }) };
      },
    };
  }

  async get(): Promise<MockQuerySnapshot> {
    let docs = this._applyFilters();
    if (this._offsetVal) {
      docs = docs.slice(this._offsetVal);
    }
    if (this._limitVal) {
      docs = docs.slice(0, this._limitVal);
    }
    return new MockQuerySnapshot(docs);
  }

  private _applyFilters(): MockDocSnapshot[] {
    const colMap = store.get(this._collection) ?? new Map();
    const results: MockDocSnapshot[] = [];

    colMap.forEach((data, id) => {
      let match = true;
      for (const f of this._filters) {
        const val = data[f.field];
        switch (f.op) {
          case "==":
            if (Array.isArray(val) && Array.isArray(f.value)) {
              if (JSON.stringify(val) !== JSON.stringify(f.value)) match = false;
            } else if (val !== f.value) match = false;
            break;
          case "array-contains":
            if (!Array.isArray(val) || !val.includes(f.value)) match = false;
            break;
          case "array-contains-any":
            if (!Array.isArray(val) || !Array.isArray(f.value) || !f.value.some((v: unknown) => val.includes(v))) match = false;
            break;
          case "!=":
            if (val === f.value) match = false;
            break;
          case "<=": {
            const lhs = resolveComparable(val);
            const rhs = resolveComparable(f.value);
            if (lhs != null && rhs != null && lhs > rhs) match = false;
            break;
          }
          case ">=": {
            const lhs = resolveComparable(val);
            const rhs = resolveComparable(f.value);
            if (lhs != null && rhs != null && lhs < rhs) match = false;
            break;
          }
          case "<": {
            const lhs = resolveComparable(val);
            const rhs = resolveComparable(f.value);
            if (lhs != null && rhs != null && lhs >= rhs) match = false;
            break;
          }
          case ">": {
            const lhs = resolveComparable(val);
            const rhs = resolveComparable(f.value);
            if (lhs != null && rhs != null && lhs <= rhs) match = false;
            break;
          }
          default:
            break;
        }
      }
      if (match) {
        results.push(new MockDocSnapshot(id, data, this._collection));
      }
    });

    return results;
  }

  private _clone(): MockQuery {
    const q = new MockQuery(this._collection);
    q._filters = [...this._filters];
    q._limitVal = this._limitVal;
    q._offsetVal = this._offsetVal;
    q._startAfterDoc = this._startAfterDoc;
    return q;
  }
}

class MockCollectionRef extends MockQuery {
  constructor(private _col: string) {
    super(_col);
  }

  doc(id?: string): MockDocRef {
    const docId = id ?? `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return new MockDocRef(this._col, docId);
  }

  async add(data: MockDocData): Promise<MockDocRef> {
    const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const ref = new MockDocRef(this._col, id);
    await ref.set(data);
    return ref;
  }
}

// ---------------------------------------------------------------------------
// Mock WriteBatch — collects set/update/delete calls and commits them
// ---------------------------------------------------------------------------

class MockWriteBatch {
  private _ops: Array<() => Promise<void>> = [];

  set(docRef: MockDocRef, data: MockDocData): MockWriteBatch {
    this._ops.push(async () => {
      await docRef.set(data);
    });
    return this;
  }

  update(docRef: MockDocRef, data: MockDocData): MockWriteBatch {
    this._ops.push(async () => {
      await docRef.update(data);
    });
    return this;
  }

  delete(docRef: MockDocRef): MockWriteBatch {
    this._ops.push(async () => {
      await docRef.delete();
    });
    return this;
  }

  async commit(): Promise<void> {
    for (const op of this._ops) {
      await op();
    }
  }
}

// ---------------------------------------------------------------------------
// Exported mock singletons
// ---------------------------------------------------------------------------

export const firestore = {
  collection: (name: string) => new MockCollectionRef(name),
  batch: () => new MockWriteBatch(),
} as unknown as FirebaseFirestore.Firestore;

export const auth = {
  verifyIdToken: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
  getUserByEmail: jest.fn(),
  setCustomUserClaims: jest.fn().mockResolvedValue(undefined),
} as unknown as import("firebase-admin").auth.Auth;

export const storage = {
  bucket: jest.fn().mockReturnValue({
    file: jest.fn().mockReturnValue({
      save: jest.fn(),
      delete: jest.fn(),
      exists: jest.fn().mockResolvedValue([false]),
      getSignedUrl: jest.fn().mockResolvedValue(["https://mock-url.example.com/file"]),
    }),
  }),
} as unknown as import("firebase-admin").storage.Storage;

// Minimal admin namespace mock – just the parts used by production code
export const admin: Record<string, unknown> = {
  firestore: {
    Timestamp: {
      now: () => ({
        toMillis: () => Date.now(),
        toDate: () => new Date(),
        seconds: Math.floor(Date.now() / 1000),
        nanoseconds: 0,
      }),
      fromMillis: (ms: number) => ({
        toMillis: () => ms,
        toDate: () => new Date(ms),
        seconds: Math.floor(ms / 1000),
        nanoseconds: 0,
      }),
      fromDate: (d: Date) => ({
        toMillis: () => d.getTime(),
        toDate: () => d,
        seconds: Math.floor(d.getTime() / 1000),
        nanoseconds: 0,
      }),
    },
    FieldValue: {
      serverTimestamp: () => ({
        toMillis: () => Date.now(),
        toDate: () => new Date(),
      }),
      increment: (n: number) => n,
      delete: () => undefined,
      arrayUnion: (...elements: unknown[]) => elements,
      arrayRemove: (...elements: unknown[]) => elements,
    },
  },
  auth: () => auth,
  storage: () => storage,
  messaging: () => ({
    subscribeToTopic: jest.fn().mockResolvedValue({}),
    unsubscribeFromTopic: jest.fn().mockResolvedValue({}),
    send: jest.fn().mockResolvedValue("mock-message-id"),
    sendEachForMulticast: jest.fn().mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    }),
  }),
};
