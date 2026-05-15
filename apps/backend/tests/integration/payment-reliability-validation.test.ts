import crypto from "crypto";

type ActivationState =
  | "captured_activation_pending"
  | "activation_failed"
  | "reconciliation_required"
  | "activated"
  | null;

interface LegacyPaymentRecord {
  id: string;
  schoolId: string;
  amount: number;
  currency: string;
  status: string;
  method?: string | null;
  gatewayId?: string | null;
  gatewayOrderId?: string | null;
  gatewaySignature?: string | null;
  verifiedAt?: Date | null;
  paymentMethodDetails?: Record<string, unknown> | null;
  failureReason?: string | null;
  refundedAmount?: number | null;
  description?: string | null;
  activationState: ActivationState;
  activationAttemptCount: number;
  activationLastError?: string | null;
  activationRequestedAt?: Date | null;
  activationStartedAt?: Date | null;
  activationCompletedAt?: Date | null;
  reconciliationMarker?: string | null;
  reconciliationRequiredAt?: Date | null;
  reconciledAt?: Date | null;
  capturedAt?: Date | null;
  invoiceId?: string | null;
  ledgerEventId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface InvoiceRecord {
  id: string;
  schoolId: string;
  invoiceNumber: string | null;
  sequenceNumber: number | null;
  periodKey: string | null;
  plan: string;
  amount: number;
  currency: string;
  status: string;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  description: string | null;
  paidAt: Date | null;
  finalizedAt: Date | null;
  immutableAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface LedgerRecord {
  id: string;
  schoolId: string;
  legacyPaymentId: string;
  providerPaymentId: string | null;
  providerOrderId: string | null;
  action: string;
  state: string;
  details?: Record<string, unknown>;
}

interface SchoolRecord {
  id: string;
  code: string;
  paymentFailureCount: number;
}

type Where = Record<string, unknown> | undefined;
type Select = Record<string, boolean> | undefined;

const mockState = {
  schools: [] as SchoolRecord[],
  payments: [] as LegacyPaymentRecord[],
  invoices: [] as InvoiceRecord[],
  ledgers: [] as LedgerRecord[],
  sequenceByKey: new Map<string, number>(),
  idCounter: 1,
  sequenceContentionFailures: 0,
  failInvoiceCreateOnce: false,
  failActivationFailureUpdateOnce: false,
};

const mockRazorpay = {
  orders: {
    create: jest.fn(),
  },
  payments: {
    fetch: jest.fn(),
    capture: jest.fn(),
  },
};

const mockWriteAuditLog = jest.fn().mockResolvedValue(undefined);
const mockActivatePaid = jest.fn();
const mockEnqueuePaymentRecovery = jest.fn().mockResolvedValue({ queued: false, inline: true });

function nextId(prefix: string): string {
  const id = `${prefix}_${mockState.idCounter}`;
  mockState.idCounter += 1;
  return id;
}

function copyRecord<T>(record: T, select?: Select): T {
  if (!select) return { ...(record as Record<string, unknown>) } as T;
  const picked: Record<string, unknown> = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled) picked[key] = (record as Record<string, unknown>)[key];
  }
  return picked as T;
}

function valueMatches(rawValue: unknown, condition: unknown): boolean {
  if (
    condition &&
    typeof condition === "object" &&
    !Array.isArray(condition) &&
    !(condition instanceof Date)
  ) {
    const typed = condition as Record<string, unknown>;

    if (Object.prototype.hasOwnProperty.call(typed, "in")) {
      const values = typed.in as unknown[];
      return Array.isArray(values) && values.some((v) => v === rawValue);
    }
    if (Object.prototype.hasOwnProperty.call(typed, "not")) {
      return rawValue !== typed.not;
    }
    if (Object.prototype.hasOwnProperty.call(typed, "lt")) {
      return rawValue instanceof Date && typed.lt instanceof Date
        ? rawValue.getTime() < typed.lt.getTime()
        : Number(rawValue) < Number(typed.lt);
    }
    if (Object.prototype.hasOwnProperty.call(typed, "lte")) {
      return rawValue instanceof Date && typed.lte instanceof Date
        ? rawValue.getTime() <= typed.lte.getTime()
        : Number(rawValue) <= Number(typed.lte);
    }
    if (Object.prototype.hasOwnProperty.call(typed, "gt")) {
      return rawValue instanceof Date && typed.gt instanceof Date
        ? rawValue.getTime() > typed.gt.getTime()
        : Number(rawValue) > Number(typed.gt);
    }
    if (Object.prototype.hasOwnProperty.call(typed, "gte")) {
      return rawValue instanceof Date && typed.gte instanceof Date
        ? rawValue.getTime() >= typed.gte.getTime()
        : Number(rawValue) >= Number(typed.gte);
    }
  }

  return rawValue === condition;
}

function matchesWhere(record: Record<string, unknown>, where?: Where): boolean {
  if (!where) return true;

  const orClause = where.OR;
  if (Array.isArray(orClause)) {
    const orMatch = orClause.some((branch) =>
      matchesWhere(record, branch as Record<string, unknown>)
    );
    if (!orMatch) return false;
  }

  const andClause = where.AND;
  if (Array.isArray(andClause)) {
    const andMatch = andClause.every((branch) =>
      matchesWhere(record, branch as Record<string, unknown>)
    );
    if (!andMatch) return false;
  }

  for (const [key, condition] of Object.entries(where)) {
    if (key === "OR" || key === "AND") continue;
    if (!valueMatches(record[key], condition)) {
      return false;
    }
  }

  return true;
}

function applyUpdate<T extends Record<string, unknown>>(
  current: T,
  data: Record<string, unknown>
): T {
  const updated: Record<string, unknown> = { ...current };

  for (const [key, value] of Object.entries(data)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, "increment")
    ) {
      const increment = Number((value as { increment?: number }).increment ?? 0);
      const existing = Number(updated[key] ?? 0);
      updated[key] = existing + increment;
      continue;
    }
    updated[key] = value;
  }

  updated.updatedAt = new Date();
  return updated as T;
}

function paymentUniqueViolation(): Error & { code: string } {
  const err = new Error("Unique constraint failed");
  (err as Error & { code: string }).code = "P2002";
  return err as Error & { code: string };
}

function conflictError(message: string): Error {
  const err = new Error(message);
  (err as Error & { statusCode?: number }).statusCode = 409;
  return err;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockPrisma = any;

const mockPrisma: MockPrisma = {
  $transaction: jest.fn(async (fn: (tx: MockPrisma) => unknown) => {
    const snapshot = structuredClone(mockState);
    try {
      return await fn(mockPrisma);
    } catch (error) {
      Object.assign(mockState, snapshot);
      throw error;
    }
  }),
  $queryRaw: jest.fn(async (...args: unknown[]) => {
    const sql = args[0] as { strings?: readonly string[]; values?: unknown[] };
    const text = Array.isArray(sql?.strings) ? sql.strings.join(" ") : "";

    if (text.includes("FOR UPDATE")) {
      return [];
    }

    if (mockState.sequenceContentionFailures > 0) {
      mockState.sequenceContentionFailures -= 1;
      throw new Error("invoice sequence contention");
    }

    if (text.includes("InvoiceSequence") || text.includes("currentSequence")) {
      const values = Array.isArray(sql?.values) ? sql.values : [];
      const schoolId = typeof values[1] === "string" ? values[1] : "default";
      const periodKey = typeof values[2] === "string" ? values[2] : "default";
      const key = `${schoolId}:${periodKey}`;
      const current = mockState.sequenceByKey.get(key) ?? 0;
      const next = current + 1;
      mockState.sequenceByKey.set(key, next);
      return [{ currentSequence: next }];
    }

    return [];
  }),
  school: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const school = mockState.schools.find((row) => row.id === where.id);
      return school ? { ...school } : null;
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
      const targets = mockState.schools.filter((school) =>
        matchesWhere(school as unknown as Record<string, unknown>, where)
      );
      for (const school of targets) {
        const updated = applyUpdate(school as unknown as Record<string, unknown>, data);
        Object.assign(school, updated);
      }
      return { count: targets.length };
    }),
  },
  legacyPayment: {
    findUnique: jest.fn(async ({ where, select }: { where: Record<string, unknown>; select?: Select }) => {
      let row: LegacyPaymentRecord | undefined;
      if (typeof where.id === "string") {
        row = mockState.payments.find((payment) => payment.id === where.id);
      } else if (
        where.schoolId_idempotencyKey &&
        typeof where.schoolId_idempotencyKey === "object"
      ) {
        const composite = where.schoolId_idempotencyKey as {
          schoolId: string;
          idempotencyKey: string;
        };
        row = mockState.payments.find(
          (payment) =>
            payment.schoolId === composite.schoolId &&
            payment.paymentMethodDetails?.idempotencyKey === composite.idempotencyKey
        );
      }
      return row ? copyRecord(row, select) : null;
    }),
    findFirst: jest.fn(async ({ where, select }: { where?: Where; select?: Select }) => {
      const row = mockState.payments.find((payment) =>
        matchesWhere(payment as unknown as Record<string, unknown>, where)
      );
      return row ? copyRecord(row, select) : null;
    }),
    findMany: jest.fn(async ({ where, select }: { where?: Where; select?: Select }) => {
      const rows = mockState.payments.filter((payment) =>
        matchesWhere(payment as unknown as Record<string, unknown>, where)
      );
      return rows.map((row) => copyRecord(row, select));
    }),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (
        data.gatewayId &&
        mockState.payments.some((row) => row.gatewayId === data.gatewayId)
      ) {
        throw paymentUniqueViolation();
      }
      if (
        data.gatewayOrderId &&
        mockState.payments.some((row) => row.gatewayOrderId === data.gatewayOrderId)
      ) {
        throw paymentUniqueViolation();
      }

      const row: LegacyPaymentRecord = {
        id: typeof data.id === "string" ? data.id : nextId("payment"),
        schoolId: String(data.schoolId),
        amount: Number(data.amount ?? 0),
        currency: String(data.currency ?? "INR"),
        status: String(data.status ?? "pending"),
        method: data.method ? String(data.method) : null,
        gatewayId: data.gatewayId ? String(data.gatewayId) : null,
        gatewayOrderId: data.gatewayOrderId ? String(data.gatewayOrderId) : null,
        gatewaySignature: data.gatewaySignature ? String(data.gatewaySignature) : null,
        verifiedAt: (data.verifiedAt as Date | undefined) ?? null,
        paymentMethodDetails:
          (data.paymentMethodDetails as Record<string, unknown> | undefined) ?? null,
        failureReason: data.failureReason ? String(data.failureReason) : null,
        refundedAmount: data.refundedAmount ? Number(data.refundedAmount) : 0,
        description: data.description ? String(data.description) : null,
        activationState: (data.activationState as ActivationState) ?? null,
        activationAttemptCount: Number(data.activationAttemptCount ?? 0),
        activationLastError: data.activationLastError ? String(data.activationLastError) : null,
        activationRequestedAt: (data.activationRequestedAt as Date | undefined) ?? null,
        activationStartedAt: (data.activationStartedAt as Date | undefined) ?? null,
        activationCompletedAt: (data.activationCompletedAt as Date | undefined) ?? null,
        reconciliationMarker: data.reconciliationMarker ? String(data.reconciliationMarker) : null,
        reconciliationRequiredAt:
          (data.reconciliationRequiredAt as Date | undefined) ?? null,
        reconciledAt: (data.reconciledAt as Date | undefined) ?? null,
        capturedAt: (data.capturedAt as Date | undefined) ?? null,
        invoiceId: data.invoiceId ? String(data.invoiceId) : null,
        ledgerEventId: data.ledgerEventId ? String(data.ledgerEventId) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockState.payments.push(row);
      return { ...row };
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const index = mockState.payments.findIndex((payment) => payment.id === where.id);
      if (index < 0) {
        throw new Error("Payment not found");
      }

      if (
        mockState.failActivationFailureUpdateOnce &&
        data.activationState === "activation_failed"
      ) {
        mockState.failActivationFailureUpdateOnce = false;
        throw new Error("activation failure persistence error");
      }

      const updated = applyUpdate(
        mockState.payments[index] as unknown as Record<string, unknown>,
        data
      ) as unknown as LegacyPaymentRecord;
      mockState.payments[index] = updated;
      return { ...updated };
    }),
    updateMany: jest.fn(async ({ where, data }: { where?: Where; data: Record<string, unknown> }) => {
      const targets = mockState.payments.filter((payment) =>
        matchesWhere(payment as unknown as Record<string, unknown>, where)
      );

      for (const payment of targets) {
        const updated = applyUpdate(
          payment as unknown as Record<string, unknown>,
          data
        ) as unknown as LegacyPaymentRecord;
        Object.assign(payment, updated);
      }
      return { count: targets.length };
    }),
  },
  invoice: {
    findFirst: jest.fn(async ({ where, select }: { where?: Where; select?: Select }) => {
      const row = mockState.invoices.find((invoice) =>
        matchesWhere(invoice as unknown as Record<string, unknown>, where)
      );
      return row ? copyRecord(row, select) : null;
    }),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      if (mockState.failInvoiceCreateOnce) {
        mockState.failInvoiceCreateOnce = false;
        throw new Error("invoice write failed");
      }

      if (
        data.razorpayPaymentId &&
        mockState.invoices.some(
          (invoice) => invoice.razorpayPaymentId === data.razorpayPaymentId
        )
      ) {
        throw paymentUniqueViolation();
      }

      const row: InvoiceRecord = {
        id: typeof data.id === "string" ? data.id : nextId("inv"),
        schoolId: String(data.schoolId),
        invoiceNumber: data.invoiceNumber ? String(data.invoiceNumber) : null,
        sequenceNumber: data.sequenceNumber ? Number(data.sequenceNumber) : null,
        periodKey: data.periodKey ? String(data.periodKey) : null,
        plan: String(data.plan ?? "unknown"),
        amount: Number(data.amount ?? 0),
        currency: String(data.currency ?? "INR"),
        status: String(data.status ?? "pending"),
        razorpayPaymentId: data.razorpayPaymentId ? String(data.razorpayPaymentId) : null,
        razorpayOrderId: data.razorpayOrderId ? String(data.razorpayOrderId) : null,
        periodStart: (data.periodStart as Date | undefined) ?? null,
        periodEnd: (data.periodEnd as Date | undefined) ?? null,
        description: data.description ? String(data.description) : null,
        paidAt: (data.paidAt as Date | undefined) ?? null,
        finalizedAt: (data.finalizedAt as Date | undefined) ?? null,
        immutableAt: (data.immutableAt as Date | undefined) ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockState.invoices.push(row);
      return { ...row };
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const index = mockState.invoices.findIndex((invoice) => invoice.id === where.id);
      if (index < 0) {
        throw new Error("Invoice not found");
      }

      const current = mockState.invoices[index];
      if (current.immutableAt) {
        throw conflictError("Finalized invoices are immutable");
      }

      const updated = applyUpdate(
        current as unknown as Record<string, unknown>,
        data
      ) as unknown as InvoiceRecord;
      mockState.invoices[index] = updated;
      return { ...updated };
    }),
  },
  paymentActivationLedger: {
    upsert: jest.fn(async ({ where, create, update }: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      const key = where.legacyPaymentId_action as { legacyPaymentId: string; action: string };
      const existingIndex = mockState.ledgers.findIndex(
        (row) => row.legacyPaymentId === key.legacyPaymentId && row.action === key.action
      );

      if (existingIndex >= 0) {
        const existing = mockState.ledgers[existingIndex];
        const merged = applyUpdate(
          existing as unknown as Record<string, unknown>,
          update
        ) as unknown as LedgerRecord;
        mockState.ledgers[existingIndex] = merged;
        return { ...merged };
      }

      const created: LedgerRecord = {
        id: nextId("ledger"),
        schoolId: String(create.schoolId),
        legacyPaymentId: String(create.legacyPaymentId),
        providerPaymentId: create.providerPaymentId ? String(create.providerPaymentId) : null,
        providerOrderId: create.providerOrderId ? String(create.providerOrderId) : null,
        action: String(create.action),
        state: String(create.state),
        details: (create.details as Record<string, unknown> | undefined) ?? undefined,
      };
      mockState.ledgers.push(created);
      return { ...created };
    }),
  },
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: mockPrisma,
}));

jest.mock("../../src/lib/razorpay", () => ({
  razorpay: mockRazorpay,
}));

jest.mock("../../src/services/audit.service", () => ({
  writeAuditLog: mockWriteAuditLog,
}));

jest.mock("../../src/services/tenant-lifecycle.service", () => ({
  activatePaid: mockActivatePaid,
}));

jest.mock("../../src/services/payment-recovery-queue.service", () => ({
  enqueuePaymentRecovery: mockEnqueuePaymentRecovery,
}));

import { verifyPaymentAndPersist } from "../../src/services/payment.service";
import { createCreditNote, createImmutableInvoice } from "../../src/services/invoice.service";

function seedSchool(id = "school_1"): void {
  mockState.schools.push({ id, code: "SCH001", paymentFailureCount: 0 });
}

function seedPendingSubscriptionPayment(overrides: Partial<LegacyPaymentRecord> = {}): LegacyPaymentRecord {
  const row: LegacyPaymentRecord = {
    id: overrides.id ?? "payment_pending_1",
    schoolId: overrides.schoolId ?? "school_1",
    amount: overrides.amount ?? 50000,
    currency: overrides.currency ?? "INR",
    status: overrides.status ?? "pending",
    method: overrides.method ?? "card",
    gatewayId: overrides.gatewayId ?? null,
    gatewayOrderId: overrides.gatewayOrderId ?? "order_1",
    gatewaySignature: overrides.gatewaySignature ?? null,
    verifiedAt: overrides.verifiedAt ?? null,
    paymentMethodDetails:
      overrides.paymentMethodDetails ??
      ({
        schoolId: "school_1",
        plan: "pro",
        billingCycle: "monthly",
        durationDays: "30",
      } as Record<string, unknown>),
    failureReason: overrides.failureReason ?? null,
    refundedAmount: overrides.refundedAmount ?? 0,
    description: overrides.description ?? "Pending subscription payment",
    activationState: overrides.activationState ?? null,
    activationAttemptCount: overrides.activationAttemptCount ?? 0,
    activationLastError: overrides.activationLastError ?? null,
    activationRequestedAt: overrides.activationRequestedAt ?? null,
    activationStartedAt: overrides.activationStartedAt ?? null,
    activationCompletedAt: overrides.activationCompletedAt ?? null,
    reconciliationMarker: overrides.reconciliationMarker ?? null,
    reconciliationRequiredAt: overrides.reconciliationRequiredAt ?? null,
    reconciledAt: overrides.reconciledAt ?? null,
    capturedAt: overrides.capturedAt ?? null,
    invoiceId: overrides.invoiceId ?? null,
    ledgerEventId: overrides.ledgerEventId ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };

  mockState.payments.push(row);
  return row;
}

function makeVerifySignature(orderId: string, paymentId: string): string {
  const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
  return crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

describe("payment reliability validation (integration)", () => {
  const originalKeySecret = process.env.RAZORPAY_KEY_SECRET;

  beforeEach(() => {
    mockState.schools = [];
    mockState.payments = [];
    mockState.invoices = [];
    mockState.ledgers = [];
    mockState.sequenceByKey = new Map<string, number>();
    mockState.idCounter = 1;
    mockState.sequenceContentionFailures = 0;
    mockState.failInvoiceCreateOnce = false;
    mockState.failActivationFailureUpdateOnce = false;

    mockRazorpay.orders.create.mockReset();
    mockRazorpay.payments.fetch.mockReset();
    mockRazorpay.payments.capture.mockReset();
    mockWriteAuditLog.mockClear();
    mockEnqueuePaymentRecovery.mockClear();

    mockActivatePaid.mockReset();
    mockActivatePaid.mockResolvedValue({ status: "applied" });

    process.env.RAZORPAY_KEY_SECRET = "test_key_secret";
    seedSchool("school_1");
  });

  afterAll(() => {
    if (originalKeySecret !== undefined) {
      process.env.RAZORPAY_KEY_SECRET = originalKeySecret;
    } else {
      delete process.env.RAZORPAY_KEY_SECRET;
    }
  });

  it("processes a successful subscription payment end-to-end", async () => {
    seedPendingSubscriptionPayment();

    mockRazorpay.payments.fetch.mockResolvedValue({
      id: "pay_sub_1",
      order_id: "order_1",
      status: "captured",
      amount: 50000,
      currency: "INR",
      method: "card",
      notes: {
        schoolId: "school_1",
        plan: "pro",
        billingCycle: "monthly",
        durationDays: "30",
      },
    });

    const result = await verifyPaymentAndPersist({
      schoolId: "school_1",
      razorpayOrderId: "order_1",
      razorpayPaymentId: "pay_sub_1",
      razorpaySignature: makeVerifySignature("order_1", "pay_sub_1"),
      performedBy: "admin_1",
    });

    expect(result).toEqual({
      verified: true,
      duplicate: false,
      paymentId: "pay_sub_1",
      orderId: "order_1",
    });

    expect(mockState.invoices).toHaveLength(1);
    expect(mockState.invoices[0].status).toBe("paid");
    expect(mockState.invoices[0].immutableAt).toBeInstanceOf(Date);
    expect(mockState.invoices[0].sequenceNumber).toBe(1);

    const payment = mockState.payments[0];
    expect(payment.status).toBe("completed");
    expect(payment.activationState).toBe("activated");
    expect(payment.invoiceId).toBe(mockState.invoices[0].id);

    expect(mockState.ledgers.map((row) => row.action)).toEqual(
      expect.arrayContaining(["capture_received", "activation_complete"])
    );

    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      "PAYMENT_CAPTURED",
      "system",
      "school_1",
      expect.objectContaining({
        razorpayPaymentId: "pay_sub_1",
        activationState: "activated",
      })
    );
  });

  it("treats duplicate frontend verify calls as idempotent", async () => {
    seedPendingSubscriptionPayment();

    mockRazorpay.payments.fetch.mockResolvedValue({
      id: "pay_dup_1",
      order_id: "order_1",
      status: "captured",
      amount: 50000,
      currency: "INR",
      method: "card",
      notes: {
        schoolId: "school_1",
        plan: "pro",
        billingCycle: "monthly",
        durationDays: "30",
      },
    });

    const signature = makeVerifySignature("order_1", "pay_dup_1");

    const first = await verifyPaymentAndPersist({
      schoolId: "school_1",
      razorpayOrderId: "order_1",
      razorpayPaymentId: "pay_dup_1",
      razorpaySignature: signature,
      performedBy: "admin_1",
    });
    const second = await verifyPaymentAndPersist({
      schoolId: "school_1",
      razorpayOrderId: "order_1",
      razorpayPaymentId: "pay_dup_1",
      razorpaySignature: signature,
      performedBy: "admin_1",
    });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(mockState.invoices).toHaveLength(1);
  });

  it("keeps concurrent activation attempts safe (single finalized invoice)", async () => {
    seedPendingSubscriptionPayment();

    mockRazorpay.payments.fetch.mockResolvedValue({
      id: "pay_concurrent_1",
      order_id: "order_1",
      status: "captured",
      amount: 50000,
      currency: "INR",
      method: "card",
      notes: {
        schoolId: "school_1",
        plan: "pro",
        billingCycle: "monthly",
        durationDays: "30",
      },
    });

    const signature = makeVerifySignature("order_1", "pay_concurrent_1");

    const [one, two] = await Promise.all([
      verifyPaymentAndPersist({
        schoolId: "school_1",
        razorpayOrderId: "order_1",
        razorpayPaymentId: "pay_concurrent_1",
        razorpaySignature: signature,
        performedBy: "admin_1",
      }),
      verifyPaymentAndPersist({
        schoolId: "school_1",
        razorpayOrderId: "order_1",
        razorpayPaymentId: "pay_concurrent_1",
        razorpaySignature: signature,
        performedBy: "admin_2",
      }),
    ]);

    expect(one.verified).toBe(true);
    expect(two.verified).toBe(true);
    expect(mockState.invoices).toHaveLength(1);
    expect(mockState.payments[0].activationState).toEqual(
      expect.stringMatching(/activated|activation_failed/)
    );
  });

  it("marks activation failure and enqueues recovery when activation cannot be finalized", async () => {
    seedPendingSubscriptionPayment();

    mockRazorpay.payments.fetch.mockResolvedValue({
      id: "pay_fail_1",
      order_id: "order_1",
      status: "captured",
      amount: 50000,
      currency: "INR",
      method: "card",
      notes: {
        schoolId: "school_1",
        plan: "pro",
        billingCycle: "monthly",
        durationDays: "30",
      },
    });
    mockActivatePaid.mockResolvedValue({ status: "blocked" });

    const result = await verifyPaymentAndPersist({
      schoolId: "school_1",
      razorpayOrderId: "order_1",
      razorpayPaymentId: "pay_fail_1",
      razorpaySignature: makeVerifySignature("order_1", "pay_fail_1"),
      performedBy: "admin_1",
    });

    expect(result.verified).toBe(true);
    expect(result.duplicate).toBe(false);

    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(mockState.payments[0].activationState).toBe("activation_failed");
    expect(mockEnqueuePaymentRecovery).toHaveBeenCalledWith("pay_fail_1", {
      requestedBy: "system:payment-activation",
    });
  });

  it("surfaces provider timeout and avoids mutating invoice state", async () => {
    seedPendingSubscriptionPayment();
    mockRazorpay.payments.fetch.mockRejectedValue(new Error("ETIMEDOUT"));

    await expect(
      verifyPaymentAndPersist({
        schoolId: "school_1",
        razorpayOrderId: "order_1",
        razorpayPaymentId: "pay_timeout_1",
        razorpaySignature: makeVerifySignature("order_1", "pay_timeout_1"),
        performedBy: "admin_1",
      })
    ).rejects.toThrow("ETIMEDOUT");

    expect(mockState.invoices).toHaveLength(0);
  });

  it("handles DB failure after capture by preserving activation-failed state for recovery", async () => {
    seedPendingSubscriptionPayment();
    mockState.failInvoiceCreateOnce = true;

    mockRazorpay.payments.fetch.mockResolvedValue({
      id: "pay_dberr_1",
      order_id: "order_1",
      status: "captured",
      amount: 50000,
      currency: "INR",
      method: "card",
      notes: {
        schoolId: "school_1",
        plan: "pro",
        billingCycle: "monthly",
        durationDays: "30",
      },
    });

    const result = await verifyPaymentAndPersist({
      schoolId: "school_1",
      razorpayOrderId: "order_1",
      razorpayPaymentId: "pay_dberr_1",
      razorpaySignature: makeVerifySignature("order_1", "pay_dberr_1"),
      performedBy: "admin_1",
    });

    expect(result.verified).toBe(true);
    expect(mockState.payments[0].activationState).toBe("activation_failed");
    expect(mockState.invoices).toHaveLength(0);
  });

  it("rolls back transaction when failure-state persistence itself fails", async () => {
    seedPendingSubscriptionPayment();
    mockActivatePaid.mockResolvedValue({ status: "blocked" });
    mockState.failActivationFailureUpdateOnce = true;

    mockRazorpay.payments.fetch.mockResolvedValue({
      id: "pay_rollback_1",
      order_id: "order_1",
      status: "captured",
      amount: 50000,
      currency: "INR",
      method: "card",
      notes: {
        schoolId: "school_1",
        plan: "pro",
        billingCycle: "monthly",
        durationDays: "30",
      },
    });

    await expect(
      verifyPaymentAndPersist({
        schoolId: "school_1",
        razorpayOrderId: "order_1",
        razorpayPaymentId: "pay_rollback_1",
        razorpaySignature: makeVerifySignature("order_1", "pay_rollback_1"),
        performedBy: "admin_1",
      })
    ).rejects.toThrow("activation failure persistence error");

    const payment = mockState.payments[0];
    expect(payment.status).toBe("pending");
    expect(payment.activationState).toBeNull();
    expect(mockState.invoices).toHaveLength(0);
  });

  it("creates deterministic, unique invoice sequences under concurrent creation", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, idx) =>
        createImmutableInvoice(mockPrisma as unknown as any, {
          schoolId: "school_1",
          plan: "pro",
          amount: 10000 + idx,
          currency: "INR",
          status: "paid",
          razorpayPaymentId: `seq_payment_${idx + 1}`,
          razorpayOrderId: `seq_order_${idx + 1}`,
          finalizedAt: new Date("2026-05-14T12:00:00.000Z"),
        })
      )
    );

    const numbers = results.map((row) => row.sequenceNumber);
    const invoiceNumbers = results.map((row) => row.invoiceNumber);

    expect(new Set(numbers).size).toBe(5);
    expect(new Set(invoiceNumbers).size).toBe(5);
    expect(numbers.sort((a, b) => Number(a) - Number(b))).toEqual([1, 2, 3, 4, 5]);
  });

  it("simulates invoice sequence contention failure deterministically", async () => {
    mockState.sequenceContentionFailures = 1;

    await expect(
      createImmutableInvoice(mockPrisma as unknown as any, {
        schoolId: "school_1",
        plan: "pro",
        amount: 10000,
        currency: "INR",
        status: "paid",
        razorpayPaymentId: "pay_seq_contention_1",
        razorpayOrderId: "order_seq_contention_1",
        finalizedAt: new Date("2026-05-14T12:00:00.000Z"),
      })
    ).rejects.toThrow("invoice sequence contention");
  });

  it("keeps finalized invoices immutable and issues refund as a credit note", async () => {
    const paidInvoice = await createImmutableInvoice(mockPrisma as unknown as any, {
      schoolId: "school_1",
      plan: "pro",
      amount: 25000,
      currency: "INR",
      status: "paid",
      razorpayPaymentId: "pay_refund_1",
      razorpayOrderId: "order_refund_1",
      finalizedAt: new Date("2026-05-14T12:00:00.000Z"),
    });

    await expect(
      mockPrisma.invoice.update({
        where: { id: paidInvoice.id },
        data: { amount: 1 },
      })
    ).rejects.toThrow("Finalized invoices are immutable");

    const credit = await createCreditNote({
      schoolId: "school_1",
      plan: "refund",
      amount: 25000,
      currency: "INR",
      description: "Refund for pay_refund_1",
    });

    expect(credit.status).toBe("credit");
    expect(credit.amount).toBe(-25000);

    const original = mockState.invoices.find((row) => row.id === paidInvoice.id);
    expect(original?.amount).toBe(25000);
    expect(mockState.invoices).toHaveLength(2);
  });
});
