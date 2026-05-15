type DriftStatus =
  | "detected"
  | "repair_attempted"
  | "repaired"
  | "manual_review_required";

interface DriftRecord {
  id: string;
  schoolId: string | null;
  driftType: string;
  status: DriftStatus;
  entityType: string;
  entityId: string;
  providerPaymentId: string | null;
  providerOrderId: string | null;
  driftReason: string;
  driftDetails: Record<string, unknown> | null;
  expectedState: string | null;
  actualState: string | null;
  repairAttemptCount: number;
  lastRepairAttemptAt: Date | null;
  repairedAt: Date | null;
  repairDetails: Record<string, unknown> | null;
  detectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface LegacyPaymentRecord {
  id: string;
  schoolId: string;
  status: string;
  activationState: string | null;
  capturedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
  gatewayId: string | null;
  gatewayOrderId: string | null;
  invoiceId: string | null;
  refundedAmount: number;
}

interface InvoiceRecord {
  id: string;
  schoolId: string;
  status: string;
  razorpayPaymentId: string | null;
  updatedAt: Date;
  createdAt: Date;
}

interface AuditEventRecord {
  id: string;
  schoolId: string | null;
  eventType: string;
  driftRecordId: string | null;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  outcome: string | null;
}

type Where = Record<string, unknown> | undefined;

const mockState = {
  drifts: [] as DriftRecord[],
  auditEvents: [] as AuditEventRecord[],
  payments: [] as LegacyPaymentRecord[],
  invoices: [] as InvoiceRecord[],
  idCounter: 1,
};

const mockProcessProviderPayment = jest.fn();
const mockFetchProviderPaymentState = jest.fn();
const mockTrackError = jest.fn();

function nextId(prefix: string): string {
  const id = `${prefix}_${mockState.idCounter}`;
  mockState.idCounter += 1;
  return id;
}

function matchesValue(value: unknown, condition: unknown): boolean {
  if (
    condition &&
    typeof condition === "object" &&
    !Array.isArray(condition) &&
    !(condition instanceof Date)
  ) {
    const typed = condition as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(typed, "in")) {
      const list = typed.in as unknown[];
      return Array.isArray(list) && list.includes(value);
    }
    if (Object.prototype.hasOwnProperty.call(typed, "not")) {
      return value !== typed.not;
    }
    if (Object.prototype.hasOwnProperty.call(typed, "lt")) {
      return value instanceof Date && typed.lt instanceof Date
        ? value.getTime() < typed.lt.getTime()
        : Number(value) < Number(typed.lt);
    }
  }
  return value === condition;
}

function matchesWhere(record: Record<string, unknown>, where?: Where): boolean {
  if (!where) return true;

  if (Array.isArray(where.OR)) {
    const anyMatch = where.OR.some((branch) =>
      matchesWhere(record, branch as Record<string, unknown>)
    );
    if (!anyMatch) return false;
  }

  if (Array.isArray(where.AND)) {
    const everyMatch = where.AND.every((branch) =>
      matchesWhere(record, branch as Record<string, unknown>)
    );
    if (!everyMatch) return false;
  }

  for (const [key, condition] of Object.entries(where)) {
    if (key === "OR" || key === "AND") continue;
    if (!matchesValue(record[key], condition)) return false;
  }
  return true;
}

function applyUpdate<T extends Record<string, unknown>>(
  row: T,
  data: Record<string, unknown>
): T {
  const next: Record<string, unknown> = { ...row };
  for (const [key, value] of Object.entries(data)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, "increment")
    ) {
      const increment = Number((value as { increment?: number }).increment ?? 0);
      next[key] = Number(next[key] ?? 0) + increment;
      continue;
    }
    next[key] = value;
  }
  next.updatedAt = new Date();
  return next as T;
}

const mockPrisma = {
  reconciliationDriftRecord: {
    findFirst: jest.fn(async ({ where }: { where?: Where }) => {
      return (
        mockState.drifts.find((row) =>
          matchesWhere(row as unknown as Record<string, unknown>, where)
        ) ?? null
      );
    }),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: DriftRecord = {
        id: nextId("drift"),
        schoolId: data.schoolId ? String(data.schoolId) : null,
        driftType: String(data.driftType),
        status: (data.status as DriftStatus) ?? "detected",
        entityType: String(data.entityType),
        entityId: String(data.entityId),
        providerPaymentId: data.providerPaymentId ? String(data.providerPaymentId) : null,
        providerOrderId: data.providerOrderId ? String(data.providerOrderId) : null,
        driftReason: String(data.driftReason),
        driftDetails: (data.driftDetails as Record<string, unknown> | undefined) ?? null,
        expectedState: data.expectedState ? String(data.expectedState) : null,
        actualState: data.actualState ? String(data.actualState) : null,
        repairAttemptCount: Number(data.repairAttemptCount ?? 0),
        lastRepairAttemptAt: null,
        repairedAt: null,
        repairDetails: null,
        detectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockState.drifts.push(row);
      return { ...row };
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const index = mockState.drifts.findIndex((row) => row.id === where.id);
      if (index < 0) throw new Error("Drift not found");
      const updated = applyUpdate(
        mockState.drifts[index] as unknown as Record<string, unknown>,
        data
      ) as unknown as DriftRecord;
      mockState.drifts[index] = updated;
      return { ...updated };
    }),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const row = mockState.drifts.find((drift) => drift.id === where.id);
      return row ? { ...row } : null;
    }),
    findMany: jest.fn(async ({ where, take }: { where?: Where; take?: number }) => {
      const rows = mockState.drifts.filter((row) =>
        matchesWhere(row as unknown as Record<string, unknown>, where)
      );
      return rows.slice(0, take ?? rows.length).map((row) => ({ ...row }));
    }),
  },
  reconciliationAuditEvent: {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: AuditEventRecord = {
        id: nextId("audit"),
        schoolId: data.schoolId ? String(data.schoolId) : null,
        eventType: String(data.eventType),
        driftRecordId: data.driftRecordId ? String(data.driftRecordId) : null,
        entityType: data.entityType ? String(data.entityType) : null,
        entityId: data.entityId ? String(data.entityId) : null,
        details: (data.details as Record<string, unknown> | undefined) ?? null,
        outcome: data.outcome ? String(data.outcome) : null,
      };
      mockState.auditEvents.push(row);
      return { ...row };
    }),
  },
  legacyPayment: {
    findMany: jest.fn(async ({ where, take }: { where?: Where; take?: number }) => {
      const rows = mockState.payments.filter((row) =>
        matchesWhere(row as unknown as Record<string, unknown>, where)
      );
      return rows.slice(0, take ?? rows.length).map((row) => ({ ...row }));
    }),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
      const row = mockState.payments.find((payment) => payment.id === where.id);
      return row ? { ...row } : null;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const index = mockState.payments.findIndex((row) => row.id === where.id);
      if (index < 0) throw new Error("Payment not found");
      const updated = applyUpdate(
        mockState.payments[index] as unknown as Record<string, unknown>,
        data
      ) as unknown as LegacyPaymentRecord;
      mockState.payments[index] = updated;
      return { ...updated };
    }),
  },
  invoice: {
    findMany: jest.fn(async ({ where, take }: { where?: Where; take?: number }) => {
      const rows = mockState.invoices.filter((row) =>
        matchesWhere(row as unknown as Record<string, unknown>, where)
      );
      return rows.slice(0, take ?? rows.length).map((row) => ({ ...row }));
    }),
    findFirst: jest.fn(async ({ where }: { where?: Where }) => {
      const row = mockState.invoices.find((invoice) =>
        matchesWhere(invoice as unknown as Record<string, unknown>, where)
      );
      return row ? { ...row } : null;
    }),
  },
};

jest.mock("../../src/lib/prisma", () => ({
  prisma: mockPrisma,
}));

jest.mock("../../src/services/payment.service", () => ({
  processProviderPayment: mockProcessProviderPayment,
}));

jest.mock("../../src/services/razorpay-reconciliation.service", () => ({
  fetchProviderPaymentState: mockFetchProviderPaymentState,
}));

jest.mock("../../src/services/error-tracking.service", () => ({
  trackError: mockTrackError,
}));

import {
  detectCapturedNotActivated,
  detectInvoicePaymentMismatches,
  detectOrphanedInvoices,
  detectRefundMismatches,
  detectStalePendingPayments,
  repairActivationDrift,
  repairStalePending,
  runRepairSweep,
} from "../../src/services/reconciliation.service";

function seedPayment(overrides: Partial<LegacyPaymentRecord>): LegacyPaymentRecord {
  const row: LegacyPaymentRecord = {
    id: overrides.id ?? nextId("payment"),
    schoolId: overrides.schoolId ?? "school_1",
    status: overrides.status ?? "completed",
    activationState: overrides.activationState ?? "activated",
    capturedAt: overrides.capturedAt ?? new Date(Date.now() - 40 * 60 * 1000),
    updatedAt: new Date(),
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    gatewayId: overrides.gatewayId ?? "pay_1",
    gatewayOrderId: overrides.gatewayOrderId ?? "order_1",
    invoiceId: overrides.invoiceId ?? "inv_1",
    refundedAmount: overrides.refundedAmount ?? 0,
  };
  mockState.payments.push(row);
  return row;
}

function seedInvoice(overrides: Partial<InvoiceRecord>): InvoiceRecord {
  const row: InvoiceRecord = {
    id: overrides.id ?? nextId("inv"),
    schoolId: overrides.schoolId ?? "school_1",
    status: overrides.status ?? "paid",
    razorpayPaymentId:
      overrides.razorpayPaymentId !== undefined ? overrides.razorpayPaymentId : "pay_1",
    updatedAt: overrides.updatedAt ?? new Date(),
    createdAt: overrides.createdAt ?? new Date(),
  };
  mockState.invoices.push(row);
  return row;
}

function seedDrift(overrides: Partial<DriftRecord>): DriftRecord {
  const row: DriftRecord = {
    id: overrides.id ?? nextId("drift"),
    schoolId: overrides.schoolId ?? "school_1",
    driftType: overrides.driftType ?? "activation_drift",
    status: overrides.status ?? "detected",
    entityType: overrides.entityType ?? "payment",
    entityId: overrides.entityId ?? "payment_1",
    providerPaymentId: overrides.providerPaymentId ?? "pay_1",
    providerOrderId: overrides.providerOrderId ?? "order_1",
    driftReason: overrides.driftReason ?? "test drift",
    driftDetails: overrides.driftDetails ?? null,
    expectedState: overrides.expectedState ?? null,
    actualState: overrides.actualState ?? null,
    repairAttemptCount: overrides.repairAttemptCount ?? 0,
    lastRepairAttemptAt: overrides.lastRepairAttemptAt ?? null,
    repairedAt: overrides.repairedAt ?? null,
    repairDetails: overrides.repairDetails ?? null,
    detectedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockState.drifts.push(row);
  return row;
}

describe("reconciliation operational validation (integration)", () => {
  beforeEach(() => {
    mockState.drifts = [];
    mockState.auditEvents = [];
    mockState.payments = [];
    mockState.invoices = [];
    mockState.idCounter = 1;

    mockProcessProviderPayment.mockReset();
    mockFetchProviderPaymentState.mockReset();
    mockTrackError.mockReset();
  });

  it("detects captured-not-activated drift and emits audit event", async () => {
    const staleCapture = new Date(Date.now() - 45 * 60 * 1000);
    seedPayment({
      id: "payment_1",
      status: "completed",
      activationState: "captured_activation_pending",
      capturedAt: staleCapture,
      gatewayId: "pay_1",
      gatewayOrderId: "order_1",
    });

    const count = await detectCapturedNotActivated();

    expect(count).toBe(1);
    expect(mockState.drifts).toHaveLength(1);
    expect(mockState.drifts[0].driftType).toBe("activation_drift");
    expect(mockState.auditEvents.some((event) => event.eventType === "drift_detected")).toBe(true);
  });

  it("detects stale pending payments and orphaned invoices", async () => {
    seedPayment({
      id: "payment_pending_1",
      status: "pending",
      activationState: null,
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      capturedAt: null,
      gatewayId: null,
      gatewayOrderId: "order_pending_1",
    });
    seedInvoice({
      id: "invoice_orphan_1",
      status: "paid",
      razorpayPaymentId: null,
    });

    const staleCount = await detectStalePendingPayments();
    const orphanedCount = await detectOrphanedInvoices();

    expect(staleCount).toBe(1);
    expect(orphanedCount).toBe(1);
    expect(mockState.drifts.map((drift) => drift.driftType)).toEqual(
      expect.arrayContaining(["stale_pending", "orphaned_invoice"])
    );
  });

  it("detects invoice-payment and refund mismatches", async () => {
    seedPayment({
      id: "payment_mismatch_1",
      status: "completed",
      activationState: "activated",
      gatewayId: "pay_missing_invoice",
      invoiceId: "inv_missing",
    });
    seedPayment({
      id: "payment_refund_1",
      status: "refunded",
      activationState: "activated",
      gatewayId: "pay_refund_1",
      refundedAmount: 100,
    });

    mockFetchProviderPaymentState.mockResolvedValue({
      exists: true,
      payment: {
        id: "pay_refund_1",
        status: "captured",
        amount: 50000,
        currency: "INR",
        method: "card",
        orderId: "order_1",
        captured: true,
        refundStatus: "partial",
        amountRefunded: 5000,
        notes: {},
        createdAt: Math.floor(Date.now() / 1000),
      },
    });

    const invoiceMismatchCount = await detectInvoicePaymentMismatches();
    const refundMismatchCount = await detectRefundMismatches();

    expect(invoiceMismatchCount).toBe(1);
    expect(refundMismatchCount).toBe(1);
    expect(mockState.drifts.map((drift) => drift.driftType)).toEqual(
      expect.arrayContaining(["invoice_payment_mismatch", "refund_drift"])
    );
  });

  it("repairs activation drift successfully and records repair events", async () => {
    seedPayment({
      id: "payment_repair_1",
      status: "completed",
      activationState: "activation_failed",
      gatewayId: "pay_repair_1",
      gatewayOrderId: "order_repair_1",
    });
    const drift = seedDrift({
      id: "drift_repair_1",
      driftType: "activation_drift",
      entityId: "payment_repair_1",
      providerPaymentId: "pay_repair_1",
    });

    mockProcessProviderPayment.mockResolvedValue({
      processed: true,
      duplicate: false,
      paymentId: "pay_repair_1",
      orderId: "order_repair_1",
      activationState: "activated",
      activationFailureReason: null,
    });

    const repaired = await repairActivationDrift(drift.id);

    expect(repaired).toBe(true);
    expect(mockState.drifts.find((row) => row.id === drift.id)?.status).toBe("repaired");
    expect(mockState.auditEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining(["repair_attempted", "repair_succeeded"])
    );
  });

  it("escalates activation drift to manual review after max retries", async () => {
    const drift = seedDrift({
      id: "drift_manual_1",
      driftType: "activation_drift",
      repairAttemptCount: 5,
      entityId: "payment_manual_1",
    });

    const repaired = await repairActivationDrift(drift.id);

    expect(repaired).toBe(false);
    expect(mockState.drifts.find((row) => row.id === drift.id)?.status).toBe(
      "manual_review_required"
    );
  });

  it("recovers stale pending payment when provider reports captured", async () => {
    seedPayment({
      id: "payment_stale_1",
      status: "pending",
      activationState: null,
      gatewayId: "pay_stale_1",
      gatewayOrderId: "order_stale_1",
    });
    const drift = seedDrift({
      id: "drift_stale_1",
      driftType: "stale_pending",
      entityId: "payment_stale_1",
      providerPaymentId: "pay_stale_1",
    });

    mockFetchProviderPaymentState.mockResolvedValue({
      exists: true,
      payment: {
        id: "pay_stale_1",
        status: "captured",
        amount: 50000,
        currency: "INR",
        method: "card",
        orderId: "order_stale_1",
        captured: true,
        refundStatus: null,
        amountRefunded: 0,
        notes: {},
        createdAt: Math.floor(Date.now() / 1000),
      },
    });
    mockProcessProviderPayment.mockResolvedValue({
      processed: true,
      duplicate: false,
      paymentId: "pay_stale_1",
      orderId: "order_stale_1",
      activationState: "activated",
      activationFailureReason: null,
    });

    const repaired = await repairStalePending(drift.id);

    expect(repaired).toBe(true);
    expect(mockProcessProviderPayment).toHaveBeenCalledWith("pay_stale_1", "order_stale_1", {
      source: "reconcile",
    });
    expect(mockState.drifts.find((row) => row.id === drift.id)?.status).toBe("repaired");
  });

  it("processes repair sweep with retry-safe behavior and escalation tracking", async () => {
    seedPayment({
      id: "payment_sweep_1",
      status: "completed",
      activationState: "activation_failed",
      gatewayId: "pay_sweep_1",
      gatewayOrderId: "order_sweep_1",
    });
    seedPayment({
      id: "payment_sweep_2",
      status: "pending",
      activationState: null,
      gatewayId: "pay_sweep_2",
      gatewayOrderId: "order_sweep_2",
    });

    seedDrift({
      id: "drift_sweep_1",
      driftType: "activation_drift",
      entityId: "payment_sweep_1",
      providerPaymentId: "pay_sweep_1",
    });
    seedDrift({
      id: "drift_sweep_2",
      driftType: "stale_pending",
      entityId: "payment_sweep_2",
      providerPaymentId: "pay_sweep_2",
    });
    seedDrift({
      id: "drift_sweep_manual",
      driftType: "provider_mismatch",
      entityId: "payment_unknown",
      repairAttemptCount: 5,
    });

    mockProcessProviderPayment.mockResolvedValue({
      processed: true,
      duplicate: false,
      paymentId: "pay_sweep_1",
      orderId: "order_sweep_1",
      activationState: "activated",
      activationFailureReason: null,
    });
    mockFetchProviderPaymentState.mockResolvedValue({
      exists: true,
      payment: {
        id: "pay_sweep_2",
        status: "failed",
        amount: 50000,
        currency: "INR",
        method: "card",
        orderId: "order_sweep_2",
        captured: false,
        refundStatus: null,
        amountRefunded: 0,
        notes: {},
        createdAt: Math.floor(Date.now() / 1000),
      },
    });

    const result = await runRepairSweep();

    expect(result.attempted).toBe(3);
    expect(result.repaired).toBeGreaterThanOrEqual(2);
    expect(result.escalated).toBeGreaterThanOrEqual(1);
    expect(
      mockState.drifts.find((row) => row.id === "drift_sweep_manual")?.status
    ).toBe("manual_review_required");
  });
});
