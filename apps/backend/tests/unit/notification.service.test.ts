/**
 * Unit tests for notification.service.ts
 *
 * Covers createNotification, getNotificationsForUser, markAsRead, getUnreadCount.
 */

import {
  createNotification,
  getNotificationsForUser,
  markAsRead,
  getUnreadCount,
} from "../../src/services/notification.service";

const mockState = {
  notifications: new Map<string, any>(),
  reads: new Map<string, { notificationId: string; userId: string; readAt: Date }>(),
  preferences: new Map<string, any>(),
  notificationCounter: 1,
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    notification: {
      create: jest.fn(async ({ data }) => {
        const id = `notif_${mockState.notificationCounter++}`;
        const row = {
          id,
          createdAt: new Date(),
          ...data,
          targetId: data.targetId ?? null,
        };
        mockState.notifications.set(id, row);
        return row;
      }),
      findMany: jest.fn(async ({ where, include, orderBy }) => {
        let rows = [...mockState.notifications.values()];
        if (where?.schoolId) {
          rows = rows.filter((row) => row.schoolId === where.schoolId);
        }
        if (where?.OR && Array.isArray(where.OR)) {
          rows = rows.filter((row) =>
            where.OR.some((cond: Record<string, unknown>) => {
              if (cond.targetType && row.targetType !== cond.targetType) return false;
              if (Object.prototype.hasOwnProperty.call(cond, "targetId") && row.targetId !== cond.targetId) return false;
              return true;
            })
          );
        }

        const sortBy = Object.keys(orderBy ?? {})[0] ?? "createdAt";
        const sortOrder = (orderBy?.[sortBy] ?? "desc") as "asc" | "desc";
        rows = rows.sort((a, b) => {
          const lhs = a[sortBy];
          const rhs = b[sortBy];
          if (lhs === rhs) return 0;
          if (sortOrder === "asc") return lhs > rhs ? 1 : -1;
          return lhs < rhs ? 1 : -1;
        });

        if (include?.reads?.where?.userId) {
          const userId = include.reads.where.userId;
          rows = rows.map((row) => {
            const key = `${row.id}:${userId}`;
            const read = mockState.reads.get(key);
            return {
              ...row,
              reads: read ? [{ readAt: read.readAt }] : [],
            };
          });
        }

        return rows;
      }),
      findFirst: jest.fn(async ({ where }) => {
        const rows = [...mockState.notifications.values()];
        return (
          rows.find(
            (row) => row.id === where?.id && row.schoolId === where?.schoolId
          ) ?? null
        );
      }),
      count: jest.fn(async ({ where }) => {
        let rows = [...mockState.notifications.values()];
        if (where?.schoolId) rows = rows.filter((row) => row.schoolId === where.schoolId);
        if (where?.OR && Array.isArray(where.OR)) {
          rows = rows.filter((row) =>
            where.OR.some((cond: Record<string, unknown>) => {
              if (cond.targetType && row.targetType !== cond.targetType) return false;
              if (Object.prototype.hasOwnProperty.call(cond, "targetId") && row.targetId !== cond.targetId) return false;
              return true;
            })
          );
        }
        if (where?.NOT?.reads?.some?.userId) {
          const userId = where.NOT.reads.some.userId;
          rows = rows.filter((row) => !mockState.reads.has(`${row.id}:${userId}`));
        }
        if (where?.reads?.none?.userId) {
          const userId = where.reads.none.userId;
          rows = rows.filter((row) => !mockState.reads.has(`${row.id}:${userId}`));
        }
        return rows.length;
      }),
    },
    notificationRead: {
      upsert: jest.fn(async ({ where, create }) => {
        const key = `${where.notificationId_userId.notificationId}:${where.notificationId_userId.userId}`;
        const existing = mockState.reads.get(key);
        if (existing) return existing;
        const row = { ...create, readAt: new Date() };
        mockState.reads.set(key, row);
        return row;
      }),
      createMany: jest.fn(async ({ data, skipDuplicates }) => {
        let count = 0;
        for (const item of data) {
          const key = `${item.notificationId}:${item.userId}`;
          if (skipDuplicates && mockState.reads.has(key)) continue;
          mockState.reads.set(key, { ...item, readAt: new Date() });
          count++;
        }
        return { count };
      }),
    },
    notificationPreference: {
      findUnique: jest.fn(async ({ where }) => {
        const key = `${where.userId_schoolId.userId}:${where.userId_schoolId.schoolId}`;
        return mockState.preferences.get(key) ?? null;
      }),
      create: jest.fn(async ({ data }) => {
        const record = {
          id: `pref_${mockState.preferences.size + 1}`,
          attendanceEnabled: true,
          feesEnabled: true,
          resultsEnabled: true,
          generalEnabled: true,
          inAppEnabled: true,
          pushEnabled: true,
          emailEnabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        const key = `${data.userId}:${data.schoolId}`;
        mockState.preferences.set(key, record);
        return record;
      }),
    },
  },
}));

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}));

function seedNotification(data: Record<string, unknown>) {
  const id = (data.id as string) ?? `n_${mockState.notificationCounter}`;
  mockState.notifications.set(id, {
    id,
    createdAt: new Date(),
    ...data,
  });
  return id;
}

function seedPreferences(
  userId: string,
  schoolId: string,
  overrides: Record<string, unknown> = {}
) {
  const key = `${userId}:${schoolId}`;
  mockState.preferences.set(key, {
    id: `pref_${mockState.preferences.size + 1}`,
    userId,
    schoolId,
    attendanceEnabled: true,
    feesEnabled: true,
    resultsEnabled: true,
    generalEnabled: true,
    inAppEnabled: true,
    pushEnabled: true,
    emailEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function seedRead(notificationId: string, userId: string, readAt = new Date()) {
  mockState.reads.set(`${notificationId}:${userId}`, { notificationId, userId, readAt });
}

beforeEach(() => {
  mockState.notifications.clear();
  mockState.reads.clear();
  mockState.preferences.clear();
  mockState.notificationCounter = 1;
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createNotification
// ---------------------------------------------------------------------------

describe("createNotification", () => {
  const context = { userId: "user_1", schoolId: "school_1", role: "Admin" };

  it("creates a USER notification", async () => {
    const notification = await createNotification(
      {
        title: "Welcome",
        message: "Hello",
        type: "INFO",
        targetType: "USER",
        targetId: "user_2",
        referenceType: "FEE",
        referenceId: "fee_1",
      },
      context
    );

    expect(notification).not.toBeNull();
    expect(notification!.schoolId).toBe("school_1");
    expect(notification!.targetType).toBe("USER");
    expect(notification!.targetId).toBe("user_2");
    expect(notification!.referenceType).toBe("FEE");
    expect(notification!.referenceId).toBe("fee_1");
    expect(notification!.createdBy).toBe("user_1");
  });

  it("creates a ROLE notification", async () => {
    const notification = await createNotification(
      {
        title: "Role Update",
        message: "Admin notice",
        type: "ALERT",
        targetType: "ROLE",
        targetId: "Admin",
      },
      context
    );

    expect(notification).not.toBeNull();
    expect(notification!.targetType).toBe("ROLE");
    expect(notification!.targetId).toBe("Admin");
  });

  it("creates a SCHOOL notification", async () => {
    const notification = await createNotification(
      {
        title: "School Notice",
        message: "Applies to all",
        type: "REMINDER",
        targetType: "SCHOOL",
      },
      context
    );

    expect(notification).not.toBeNull();
    expect(notification!.targetType).toBe("SCHOOL");
    expect(notification!.targetId).toBeNull();
  });

  it("rejects USER notification without targetId", async () => {
    await expect(
      createNotification(
        {
          title: "Missing target",
          message: "",
          type: "INFO",
          targetType: "USER",
        },
        context
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("allows ROLE notification with any valid role targetId", async () => {
    const notification = await createNotification(
      {
        title: "Bad role",
        message: "Mismatch",
        type: "INFO",
        targetType: "ROLE",
        targetId: "Teacher",
      },
      context
    );

    expect(notification).not.toBeNull();
    expect(notification!.targetType).toBe("ROLE");
    expect(notification!.targetId).toBe("Teacher");
  });

  it("rejects SCHOOL notification with targetId", async () => {
    await expect(
      createNotification(
        {
          title: "School",
          message: "Bad target",
          type: "INFO",
          targetType: "SCHOOL",
          targetId: "user_1",
        },
        context
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("enforces role restrictions", async () => {
    await expect(
      createNotification(
        {
          title: "Not allowed",
          message: "",
          type: "INFO",
          targetType: "SCHOOL",
        },
        { userId: "user_2", schoolId: "school_1", role: "Teacher" }
      )
    ).rejects.toMatchObject({ code: "ROLE_UNAUTHORIZED" });
  });

  it("skips USER notification creation when in-app preference is disabled", async () => {
    seedPreferences("user_2", "school_1", {
      inAppEnabled: false,
    });

    const notification = await createNotification(
      {
        title: "Disabled",
        message: "No in-app",
        type: "INFO",
        targetType: "USER",
        targetId: "user_2",
        referenceType: "FEE",
        referenceId: "fee_1",
      },
      context
    );

    expect(notification).toBeNull();
    expect(mockState.notifications.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getNotificationsForUser
// ---------------------------------------------------------------------------

describe("getNotificationsForUser", () => {
  it("returns USER, ROLE, and SCHOOL notifications for the user", async () => {
    seedNotification({
      id: "n1",
      schoolId: "school_1",
      targetType: "USER",
      targetId: "user_1",
      title: "User",
      message: "",
      type: "INFO",
      createdBy: "admin",
    });
    seedNotification({
      id: "n2",
      schoolId: "school_1",
      targetType: "ROLE",
      targetId: "Teacher",
      title: "Role",
      message: "",
      type: "INFO",
      createdBy: "admin",
    });
    seedNotification({
      id: "n3",
      schoolId: "school_1",
      targetType: "SCHOOL",
      targetId: null,
      title: "School",
      message: "",
      type: "INFO",
      createdBy: "admin",
    });
    seedNotification({
      id: "n4",
      schoolId: "school_1",
      targetType: "USER",
      targetId: "other_user",
      title: "Other",
      message: "",
      type: "INFO",
      createdBy: "admin",
    });
    seedNotification({
      id: "n5",
      schoolId: "school_2",
      targetType: "SCHOOL",
      targetId: null,
      title: "Other school",
      message: "",
      type: "INFO",
      createdBy: "admin",
    });

    seedRead("n1", "user_1");

    const result = await getNotificationsForUser({
      userId: "user_1",
      schoolId: "school_1",
      role: "Teacher",
    });

    expect(result.data.map((n) => n.id)).toEqual([
      "n3",
      "n2",
      "n1",
    ]);

    const readItem = result.data.find((n) => n.id === "n1");
    const unreadItem = result.data.find((n) => n.id === "n2");

    expect(readItem?.isRead).toBe(true);
    expect(unreadItem?.isRead).toBe(false);
  });

  it("returns empty list when in-app notifications are disabled", async () => {
    seedPreferences("user_1", "school_1", { inAppEnabled: false });
    seedNotification({
      id: "n1",
      schoolId: "school_1",
      targetType: "USER",
      targetId: "user_1",
      title: "User",
      message: "",
      type: "INFO",
      createdBy: "admin",
    });

    const result = await getNotificationsForUser({
      userId: "user_1",
      schoolId: "school_1",
      role: "Admin",
    });

    expect(result.data).toEqual([]);
  });

  it("filters notifications when preference is disabled", async () => {
    seedPreferences("user_1", "school_1", { feesEnabled: false });
    seedNotification({
      id: "n_fee",
      schoolId: "school_1",
      targetType: "USER",
      targetId: "user_1",
      title: "Fee",
      message: "",
      type: "INFO",
      referenceType: "FEE",
      createdBy: "admin",
    });
    seedNotification({
      id: "n_general",
      schoolId: "school_1",
      targetType: "USER",
      targetId: "user_1",
      title: "General",
      message: "",
      type: "INFO",
      createdBy: "admin",
    });

    const result = await getNotificationsForUser({
      userId: "user_1",
      schoolId: "school_1",
      role: "Admin",
    });

    const ids = result.data.map((n) => n.id);
    expect(ids).toContain("n_general");
    expect(ids).not.toContain("n_fee");
  });
});

// ---------------------------------------------------------------------------
// markAsRead
// ---------------------------------------------------------------------------

describe("markAsRead", () => {
  it("marks a notification as read", async () => {
    seedNotification({
      id: "n1",
      schoolId: "school_1",
      targetType: "USER",
      targetId: "user_1",
      title: "Test",
      message: "",
      type: "INFO",
      createdBy: "admin",
    });

    const marked = await markAsRead("n1", {
      userId: "user_1",
      schoolId: "school_1",
      role: "Admin",
    });

    expect(marked).toBe(true);
    expect(mockState.reads.size).toBe(1);
  });

  it("prevents duplicate reads", async () => {
    seedNotification({
      id: "n1",
      schoolId: "school_1",
      targetType: "USER",
      targetId: "user_1",
      title: "Test",
      message: "",
      type: "INFO",
      createdBy: "admin",
    });

    await markAsRead("n1", { userId: "user_1", schoolId: "school_1", role: "Admin" });
    await markAsRead("n1", { userId: "user_1", schoolId: "school_1", role: "Admin" });

    expect(mockState.reads.size).toBe(1);
  });

  it("throws not found when notification is in another school", async () => {
    seedNotification({
      id: "n_other",
      schoolId: "school_2",
      targetType: "SCHOOL",
      targetId: null,
      title: "Other",
      message: "",
      type: "INFO",
      createdBy: "admin",
    });

    await expect(
      markAsRead("n_other", {
        userId: "user_1",
        schoolId: "school_1",
        role: "Admin",
      })
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});

// ---------------------------------------------------------------------------
// getUnreadCount
// ---------------------------------------------------------------------------

describe("getUnreadCount", () => {
  it("counts unread notifications for the user", async () => {
    seedNotification({
      id: "n1",
      schoolId: "school_1",
      targetType: "USER",
      targetId: "user_1",
      title: "User",
      message: "",
      type: "INFO",
      createdBy: "admin",
    });
    seedNotification({
      id: "n2",
      schoolId: "school_1",
      targetType: "ROLE",
      targetId: "Admin",
      title: "Role",
      message: "",
      type: "INFO",
      createdBy: "admin",
    });
    seedNotification({
      id: "n3",
      schoolId: "school_1",
      targetType: "SCHOOL",
      targetId: null,
      title: "School",
      message: "",
      type: "INFO",
      createdBy: "admin",
    });
    seedRead("n1", "user_1");

    const count = await getUnreadCount({
      userId: "user_1",
      schoolId: "school_1",
      role: "Admin",
    });

    expect(count).toBe(2);
  });

  it("returns 0 when in-app notifications are disabled", async () => {
    seedPreferences("user_1", "school_1", { inAppEnabled: false });
    seedNotification({
      id: "n1",
      schoolId: "school_1",
      targetType: "USER",
      targetId: "user_1",
      title: "User",
      message: "",
      type: "INFO",
      createdBy: "admin",
    });

    const count = await getUnreadCount({
      userId: "user_1",
      schoolId: "school_1",
      role: "Admin",
    });

    expect(count).toBe(0);
  });

  it("returns 0 when there are no matching notifications", async () => {
    const count = await getUnreadCount({
      userId: "user_1",
      schoolId: "school_1",
      role: "Admin",
    });

    expect(count).toBe(0);
  });
});
