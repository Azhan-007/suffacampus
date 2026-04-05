/**
 * Unit tests for notification-preference.service.ts
 *
 * Covers defaults, updates, tenant isolation, and preference checks.
 */

import { NotificationPreferenceService } from "../../src/services/notification-preference.service";

const mockState = {
  preferences: new Map<string, any>(),
  counter: 1,
};

const DEFAULTS = {
  attendanceEnabled: true,
  feesEnabled: true,
  resultsEnabled: true,
  generalEnabled: true,
  inAppEnabled: true,
  pushEnabled: true,
  emailEnabled: false,
};

function keyFor(userId: string, schoolId: string) {
  return `${userId}:${schoolId}`;
}

jest.mock("../../src/lib/prisma", () => ({
  prisma: {
    notificationPreference: {
      findUnique: jest.fn(async ({ where }) => {
        const key = keyFor(where.userId_schoolId.userId, where.userId_schoolId.schoolId);
        return mockState.preferences.get(key) ?? null;
      }),
      create: jest.fn(async ({ data }) => {
        const record = {
          id: `pref_${mockState.counter++}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...DEFAULTS,
          ...data,
        };
        mockState.preferences.set(keyFor(data.userId, data.schoolId), record);
        return record;
      }),
      upsert: jest.fn(async ({ where, create, update }) => {
        const key = keyFor(where.userId_schoolId.userId, where.userId_schoolId.schoolId);
        const existing = mockState.preferences.get(key);
        const record = existing
          ? { ...existing, ...update, updatedAt: new Date() }
          : {
              id: `pref_${mockState.counter++}`,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...DEFAULTS,
              ...create,
            };
        mockState.preferences.set(key, record);
        return record;
      }),
    },
  },
}));

beforeEach(() => {
  mockState.preferences.clear();
  mockState.counter = 1;
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getPreferences
// ---------------------------------------------------------------------------

describe("getPreferences", () => {
  it("creates default preferences when missing", async () => {
    const result = await NotificationPreferenceService.getPreferences({
      userId: "user_1",
      schoolId: "school_1",
    });

    expect(result.userId).toBe("user_1");
    expect(result.schoolId).toBe("school_1");
    expect(result.attendanceEnabled).toBe(true);
    expect(result.feesEnabled).toBe(true);
    expect(result.resultsEnabled).toBe(true);
    expect(result.generalEnabled).toBe(true);
    expect(result.inAppEnabled).toBe(true);
    expect(result.pushEnabled).toBe(true);
    expect(result.emailEnabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updatePreferences
// ---------------------------------------------------------------------------

describe("updatePreferences", () => {
  it("updates allowed fields", async () => {
    const result = await NotificationPreferenceService.updatePreferences(
      { feesEnabled: false, emailEnabled: true },
      { userId: "user_1", schoolId: "school_1" }
    );

    expect(result.feesEnabled).toBe(false);
    expect(result.emailEnabled).toBe(true);
    expect(result.attendanceEnabled).toBe(true);
    expect(result.inAppEnabled).toBe(true);
  });

  it("keeps tenant isolation between schools", async () => {
    await NotificationPreferenceService.updatePreferences(
      { feesEnabled: false },
      { userId: "user_1", schoolId: "school_1" }
    );

    await NotificationPreferenceService.updatePreferences(
      { feesEnabled: true },
      { userId: "user_1", schoolId: "school_2" }
    );

    const prefSchool1 = mockState.preferences.get(keyFor("user_1", "school_1"));
    const prefSchool2 = mockState.preferences.get(keyFor("user_1", "school_2"));

    expect(prefSchool1.feesEnabled).toBe(false);
    expect(prefSchool2.feesEnabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shouldSendNotification
// ---------------------------------------------------------------------------

describe("shouldSendNotification", () => {
  it("returns true when preferences are missing", async () => {
    const allowed = await NotificationPreferenceService.shouldSendNotification(
      "user_1",
      "school_1",
      "FEES"
    );

    expect(allowed).toBe(true);
  });

  it("returns false when preference is disabled", async () => {
    await NotificationPreferenceService.updatePreferences(
      { feesEnabled: false },
      { userId: "user_1", schoolId: "school_1" }
    );

    const allowed = await NotificationPreferenceService.shouldSendNotification(
      "user_1",
      "school_1",
      "FEES"
    );

    expect(allowed).toBe(false);
  });

  it("respects push/email channel toggles", async () => {
    await NotificationPreferenceService.updatePreferences(
      { pushEnabled: false, emailEnabled: true },
      { userId: "user_1", schoolId: "school_1" }
    );

    const pushAllowed = await NotificationPreferenceService.shouldSendNotification(
      "user_1",
      "school_1",
      "GENERAL",
      "push"
    );

    const emailAllowed = await NotificationPreferenceService.shouldSendNotification(
      "user_1",
      "school_1",
      "GENERAL",
      "email"
    );

    expect(pushAllowed).toBe(false);
    expect(emailAllowed).toBe(true);
  });
});
