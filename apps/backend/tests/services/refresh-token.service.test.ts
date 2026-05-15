process.env.NODE_ENV = "test";
process.env.AUTH_REFRESH_TOKENS_ENABLED = "true";
process.env.AUTH_REFRESH_TOKEN_HASH_SECRET = "test-refresh-secret";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_ACCESS_TTL_SECONDS = "3600";
process.env.JWT_ISSUER = "suffacampus-api";
process.env.JWT_AUDIENCE = "suffacampus-clients";
process.env.AUTH_REFRESH_TOKEN_TTL_DAYS = "30";
process.env.AUTH_REFRESH_TOKEN_REUSE_GRACE_SECONDS = "5";

import { AppError } from "../../src/errors";

type RefreshTokenRow = {
  id: string;
  selector: string;
  tokenHash: string;
  familyId: string;
  parentId: string | null;
  replacedById: string | null;
  sessionId: string;
  userUid: string;
  schoolId: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
  reuseDetectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type SessionRow = {
  id: string;
  userUid: string;
  schoolId: string | null;
  device: string;
  ipAddress: string | null;
  userAgent: string | null;
  currentJti: string;
  lastActiveAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokeReason?: string | null;
};

type UserRow = {
  uid: string;
  role: string | null;
  isActive: boolean;
};

type RevokedTokenRow = {
  jti: string;
  reason?: string | null;
  expiresAt: Date;
  sessionId?: string | null;
  userUid?: string | null;
  schoolId?: string | null;
};

type PrismaMock = {
  refreshToken: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  session: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
  };
  revokedToken: {
    upsert: jest.Mock;
  };
  $transaction: jest.Mock<Promise<unknown>, [unknown]>;
};

jest.mock("../../src/lib/prisma", () => {
  const refreshTokenStore = new Map<string, RefreshTokenRow>();
  const sessionStore = new Map<string, SessionRow>();
  const userStore = new Map<string, UserRow>();
  const revokedTokenStore = new Map<string, RevokedTokenRow>();

  function pick<T extends Record<string, unknown>>(
    record: T,
    select?: Record<string, boolean>
  ) {
    if (!select) return { ...record };
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(select)) {
      if (value) result[key] = record[key as keyof T];
    }
    return result as Partial<T>;
  }

  function matchesWhere(record: Record<string, unknown>, where?: Record<string, unknown>) {
    if (!where) return true;
    for (const [key, value] of Object.entries(where)) {
      const current = record[key];

      if (value && typeof value === "object" && !Array.isArray(value)) {
        const condition = value as Record<string, unknown>;
        if ("gt" in condition) {
          if (!(current instanceof Date)) return false;
          if (current.getTime() <= (condition.gt as Date).getTime()) return false;
          continue;
        }
        if ("in" in condition) {
          const list = condition.in as unknown[];
          if (!list.includes(current)) return false;
          continue;
        }
        if ("not" in condition) {
          if (current === condition.not) return false;
          continue;
        }
      }

      if (current !== value) {
        return false;
      }
    }
    return true;
  }

  const prisma: PrismaMock = {
    refreshToken: {
      findUnique: jest.fn(async ({ where, select }: { where: { id?: string; selector?: string }; select?: Record<string, boolean> }) => {
        let record: RefreshTokenRow | undefined;
        if (where.id) record = refreshTokenStore.get(where.id);
        if (where.selector) {
          record = Array.from(refreshTokenStore.values()).find(
            (entry) => entry.selector === where.selector
          );
        }
        if (!record) return null;
        return pick(record, select);
      }),
      findMany: jest.fn(async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, boolean> }) => {
        const entries = Array.from(refreshTokenStore.values()).filter((entry) =>
          matchesWhere(entry as unknown as Record<string, unknown>, where)
        );
        return entries.map((entry) => pick(entry, select));
      }),
      create: jest.fn(async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
        const id = (data.id as string | undefined) ?? `rt_${Math.random().toString(36).slice(2, 10)}`;
        const now = new Date();
        const record: RefreshTokenRow = {
          id,
          selector: data.selector as string,
          tokenHash: data.tokenHash as string,
          familyId: data.familyId as string,
          parentId: (data.parentId as string | null | undefined) ?? null,
          replacedById: (data.replacedById as string | null | undefined) ?? null,
          sessionId: data.sessionId as string,
          userUid: data.userUid as string,
          schoolId: (data.schoolId as string | null | undefined) ?? null,
          lastUsedAt: (data.lastUsedAt as Date | null | undefined) ?? null,
          expiresAt: data.expiresAt as Date,
          revokedAt: (data.revokedAt as Date | null | undefined) ?? null,
          revokeReason: (data.revokeReason as string | null | undefined) ?? null,
          reuseDetectedAt: (data.reuseDetectedAt as Date | null | undefined) ?? null,
          createdAt: now,
          updatedAt: now,
        };
        refreshTokenStore.set(id, record);
        return pick(record, select);
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const record = refreshTokenStore.get(where.id);
        if (!record) throw new Error("Refresh token not found");
        const updated = { ...record, ...data, updatedAt: new Date() } as RefreshTokenRow;
        refreshTokenStore.set(where.id, updated);
        return updated;
      }),
      updateMany: jest.fn(async ({ where, data }: { where?: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const [id, record] of refreshTokenStore.entries()) {
          if (matchesWhere(record as unknown as Record<string, unknown>, where)) {
            refreshTokenStore.set(id, { ...record, ...data, updatedAt: new Date() } as RefreshTokenRow);
            count += 1;
          }
        }
        return { count };
      }),
    },
    session: {
      findFirst: jest.fn(async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, boolean> }) => {
        const record = Array.from(sessionStore.values()).find((entry) =>
          matchesWhere(entry as unknown as Record<string, unknown>, where)
        );
        if (!record) return null;
        return pick(record, select);
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const record = sessionStore.get(where.id);
        if (!record) throw new Error("Session not found");
        const updated = { ...record, ...data } as SessionRow;
        sessionStore.set(where.id, updated);
        return updated;
      }),
    },
    user: {
      findUnique: jest.fn(async ({ where, select }: { where: { uid: string }; select?: Record<string, boolean> }) => {
        const record = userStore.get(where.uid);
        if (!record) return null;
        return pick(record, select);
      }),
    },
    revokedToken: {
      upsert: jest.fn(async ({ where, update, create }: { where: { jti: string }; update: Record<string, unknown>; create: Record<string, unknown> }) => {
        const existing = revokedTokenStore.get(where.jti);
        if (existing) {
          const updated = { ...existing, ...update } as RevokedTokenRow;
          revokedTokenStore.set(where.jti, updated);
          return updated;
        }
        const created = { ...(create as RevokedTokenRow) };
        revokedTokenStore.set(where.jti, created);
        return created;
      }),
    },
    $transaction: jest.fn(async (arg: unknown): Promise<unknown> => {
      if (typeof arg === "function") {
        return (arg as (input: typeof prisma) => Promise<unknown>)(prisma);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg as unknown[]);
      }
      return arg;
    }),
  };

  const mock = {
    resetStores: () => {
      refreshTokenStore.clear();
      sessionStore.clear();
      userStore.clear();
      revokedTokenStore.clear();
    },
    seedUser: (uid = "user_1", overrides: Partial<UserRow> = {}) => {
      userStore.set(uid, { uid, role: "Admin", isActive: true, ...overrides });
    },
    seedSession: (
      sessionId = "sess_1",
      uid = "user_1",
      overrides: Partial<SessionRow> = {}
    ) => {
      sessionStore.set(sessionId, {
        id: sessionId,
        userUid: uid,
        schoolId: "school_1",
        device: "Web",
        ipAddress: "127.0.0.1",
        userAgent: "Jest",
        currentJti: "jti_1",
        lastActiveAt: new Date(Date.now() - 1000),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        revokedAt: null,
        ...overrides,
      });
    },
    getRefreshTokens: () => Array.from(refreshTokenStore.values()),
    getSession: (sessionId: string) => sessionStore.get(sessionId),
    updateRefreshToken: (id: string, data: Partial<RefreshTokenRow>) => {
      const record = refreshTokenStore.get(id);
      if (!record) return;
      refreshTokenStore.set(id, { ...record, ...data, updatedAt: new Date() });
    },
  };

  return { prisma, __mock: mock };
});

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const refreshService = require("../../src/services/refresh-token.service") as typeof import("../../src/services/refresh-token.service");
const {
  issueRefreshTokenForSession,
  refreshSessionTokens,
  revokeRefreshTokenFamiliesForSession,
} = refreshService;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const prismaModule = require("../../src/lib/prisma") as { __mock: {
  resetStores: () => void;
  seedUser: (uid?: string, overrides?: Partial<UserRow>) => void;
  seedSession: (sessionId?: string, uid?: string, overrides?: Partial<SessionRow>) => void;
  getRefreshTokens: () => RefreshTokenRow[];
  getSession: (sessionId: string) => SessionRow | undefined;
  updateRefreshToken: (id: string, data: Partial<RefreshTokenRow>) => void;
} };

const mock = prismaModule.__mock;

beforeEach(() => {
  mock.resetStores();
  jest.clearAllMocks();
});

describe("refreshSessionTokens", () => {
  it("rotates refresh token and access token", async () => {
    mock.seedUser();
    mock.seedSession();

    const issued = await issueRefreshTokenForSession({
      sessionId: "sess_1",
      userUid: "user_1",
      schoolId: "school_1",
    });

    const result = await refreshSessionTokens({ refreshToken: issued.refreshToken });

    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(result.refreshToken).not.toBe(issued.refreshToken);
    expect(result.session.id).toBe("sess_1");

    const tokens = mock.getRefreshTokens();
    expect(tokens.length).toBe(2);
    const root = tokens.find((entry) => entry.parentId === null);
    const child = tokens.find((entry) => entry.parentId === root?.id);

    expect(root?.replacedById).toBe(child?.id);
    expect(root?.lastUsedAt).toBeTruthy();

    const session = mock.getSession("sess_1");
    expect(session?.currentJti).not.toBe("jti_1");
  });

  it("rejects refresh reuse and revokes family", async () => {
    mock.seedUser();
    mock.seedSession();

    const issued = await issueRefreshTokenForSession({
      sessionId: "sess_1",
      userUid: "user_1",
      schoolId: "school_1",
    });

    const first = await refreshSessionTokens({ refreshToken: issued.refreshToken });
    expect(first.refreshToken).toBeTruthy();

    const root = mock.getRefreshTokens().find((entry) => entry.parentId === null);
    if (root) {
      mock.updateRefreshToken(root.id, { lastUsedAt: new Date(Date.now() - 10_000) });
    }

    await expect(refreshSessionTokens({ refreshToken: issued.refreshToken })).rejects.toThrow(
      AppError
    );

    const families = mock.getRefreshTokens().map((entry) => entry.revokedAt);
    expect(families.every((value) => value instanceof Date)).toBe(true);

    const session = mock.getSession("sess_1");
    expect(session?.revokedAt).toBeTruthy();
    expect(session?.revokeReason).toBe("refresh_reuse_detected");
  });

  it("rejects expired refresh token", async () => {
    mock.seedUser();
    mock.seedSession();

    const issued = await issueRefreshTokenForSession({
      sessionId: "sess_1",
      userUid: "user_1",
      schoolId: "school_1",
    });

    const token = mock
      .getRefreshTokens()
      .find((entry) => entry.selector === issued.refreshToken.split(".")[0]);
    if (token) {
      mock.updateRefreshToken(token.id, { expiresAt: new Date(Date.now() - 1000) });
    }

    await expect(refreshSessionTokens({ refreshToken: issued.refreshToken })).rejects.toThrow(
      AppError
    );
  });

  it("rejects revoked refresh token", async () => {
    mock.seedUser();
    mock.seedSession();

    const issued = await issueRefreshTokenForSession({
      sessionId: "sess_1",
      userUid: "user_1",
      schoolId: "school_1",
    });

    const token = mock
      .getRefreshTokens()
      .find((entry) => entry.selector === issued.refreshToken.split(".")[0]);
    if (token) {
      mock.updateRefreshToken(token.id, { revokedAt: new Date() });
    }

    await expect(refreshSessionTokens({ refreshToken: issued.refreshToken })).rejects.toThrow(
      AppError
    );
  });

  it("handles duplicate refresh within grace window", async () => {
    mock.seedUser();
    mock.seedSession();

    const issued = await issueRefreshTokenForSession({
      sessionId: "sess_1",
      userUid: "user_1",
      schoolId: "school_1",
    });

    const results = await Promise.allSettled([
      refreshSessionTokens({ refreshToken: issued.refreshToken }),
      refreshSessionTokens({ refreshToken: issued.refreshToken }),
    ]);

    const fulfilled = results.filter((res) => res.status === "fulfilled");
    const rejected = results.filter((res) => res.status === "rejected");

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const revoked = mock.getRefreshTokens().some((entry) => entry.revokedAt);
    expect(revoked).toBe(false);
  });
});

describe("revokeRefreshTokenFamiliesForSession", () => {
  it("revokes families tied to a session", async () => {
    mock.seedUser();
    mock.seedSession();

    const issued = await issueRefreshTokenForSession({
      sessionId: "sess_1",
      userUid: "user_1",
      schoolId: "school_1",
    });

    await revokeRefreshTokenFamiliesForSession({
      sessionId: "sess_1",
      userUid: "user_1",
      schoolId: "school_1",
    });

    const token = mock
      .getRefreshTokens()
      .find((entry) => entry.selector === issued.refreshToken.split(".")[0]);
    expect(token?.revokedAt).toBeTruthy();
  });
});
