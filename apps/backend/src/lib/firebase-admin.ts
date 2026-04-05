import admin, { type auth as AuthType, type firestore as FirestoreType, type storage as StorageType } from "firebase-admin";

// Module-level singletons — initialised at most once.
let _app: admin.app.App | null = null;
let _auth: AuthType.Auth | null = null;
let _firestore: FirestoreType.Firestore | null = null;
let _storage: StorageType.Storage | null = null;

function getApp(): admin.app.App {
  if (_app) return _app;

  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
    FIREBASE_STORAGE_BUCKET,
  } = process.env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new Error(
      "Missing Firebase service account environment variables: " +
        "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY"
    );
  }

  _app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      // Private key comes as an escaped string in env vars — unescape newlines
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
    ...(FIREBASE_STORAGE_BUCKET ? { storageBucket: FIREBASE_STORAGE_BUCKET } : {}),
  });

  return _app;
}

// Lazy Proxies — the service instance is created once on first property access,
// then the cached instance is reused for every subsequent call.
export const auth: AuthType.Auth = new Proxy({} as AuthType.Auth, {
  get: (_target, prop) => {
    if (!_auth) _auth = admin.auth(getApp());
    return (_auth as any)[prop as string];
  },
});

export const firestore: FirestoreType.Firestore = new Proxy({} as FirestoreType.Firestore, {
  get: (_target, prop) => {
    if (!_firestore) {
      _firestore = admin.firestore(getApp());
      _firestore.settings({ ignoreUndefinedProperties: true });
    }
    return (_firestore as any)[prop as string];
  },
});

export const storage: StorageType.Storage = new Proxy({} as StorageType.Storage, {
  get: (_target, prop) => {
    if (!_storage) _storage = admin.storage(getApp());
    return (_storage as any)[prop as string];
  },
});

export { admin };
