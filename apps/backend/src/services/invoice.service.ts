import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma, type PrismaTransactionClient } from "../lib/prisma";
import { writeAuditLog } from "./audit.service";
import { assertSchoolScope } from "../lib/tenant-scope";
import { dateTimeFrom } from "../utils/safe-fields";
import { Errors } from "../errors";

function getInvoicePeriodKey(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

async function allocateInvoiceSequence(
  client: PrismaTransactionClient | typeof prisma,
  schoolId: string,
  periodKey: string
): Promise<number> {
  const rows = await client.$queryRaw<{ currentSequence: number }[]>(Prisma.sql`
    WITH upserted AS (
      INSERT INTO "InvoiceSequence" ("id", "schoolId", "periodKey", "currentSequence")
      VALUES (${crypto.randomUUID()}, ${schoolId}, ${periodKey}, 1)
      ON CONFLICT ("schoolId", "periodKey")
      DO UPDATE SET "currentSequence" = "InvoiceSequence"."currentSequence" + 1,
                    "updatedAt" = NOW()
      RETURNING "currentSequence"
    )
    SELECT "currentSequence" FROM upserted
  `);

  const allocated = rows[0]?.currentSequence;
  if (!allocated || allocated < 1) {
    throw Errors.internal("Unable to allocate invoice sequence");
  }

  return allocated;
}

async function generateInvoiceNumber(
  client: PrismaTransactionClient | typeof prisma,
  schoolId: string,
  issuedAt = new Date()
): Promise<{ invoiceNumber: string; sequenceNumber: number; periodKey: string }> {
  assertSchoolScope(schoolId);

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  const schoolCode = school?.code ?? schoolId.slice(0, 6).toUpperCase();

  const periodKey = getInvoicePeriodKey(issuedAt);
  const sequenceNumber = await allocateInvoiceSequence(client, schoolId, periodKey);
  const invoiceNumber = `INV-${schoolCode}-${periodKey}-${String(sequenceNumber).padStart(3, "0")}`;

  return { invoiceNumber, sequenceNumber, periodKey };
}

export async function createImmutableInvoice(
  client: PrismaTransactionClient | typeof prisma,
  params: {
    schoolId: string;
    plan: string;
    amount: number;
    currency: string;
    status: string;
    razorpayPaymentId?: string | null;
    razorpayOrderId?: string | null;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    description?: string;
    paidAt?: Date | null;
    finalizedAt?: Date | null;
  }
) {
  const now = params.finalizedAt ?? new Date();
  const { invoiceNumber, sequenceNumber, periodKey } = await generateInvoiceNumber(
    client,
    params.schoolId,
    now
  );

  return client.invoice.create({
    data: {
      invoiceNumber,
      sequenceNumber,
      periodKey,
      schoolId: params.schoolId,
      plan: params.plan,
      amount: params.amount,
      currency: params.currency,
      status: params.status,
      razorpayPaymentId: params.razorpayPaymentId ?? null,
      razorpayOrderId: params.razorpayOrderId ?? null,
      periodStart: params.periodStart ?? null,
      periodEnd: params.periodEnd ?? null,
      description: params.description,
      paidAt: params.paidAt ?? null,
      finalizedAt: params.finalizedAt ?? now,
      immutableAt: now,
    },
  });
}

export async function createPaidInvoice(params: {
  schoolId: string;
  plan: string;
  amount: number;
  currency: string;
  razorpayPaymentId: string;
  razorpayOrderId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  description?: string;
}) {
  assertSchoolScope(params.schoolId);

  const periodStart = dateTimeFrom(params.billingPeriodStart);
  const periodEnd = dateTimeFrom(params.billingPeriodEnd);

  if (!periodStart || !periodEnd) {
    throw Errors.badRequest("billingPeriodStart and billingPeriodEnd must be valid dates");
  }

  const invoice = await createImmutableInvoice(prisma, {
    schoolId: params.schoolId,
    plan: params.plan,
    amount: params.amount,
    currency: params.currency,
    status: "paid",
    razorpayPaymentId: params.razorpayPaymentId,
    razorpayOrderId: params.razorpayOrderId,
    periodStart,
    periodEnd,
    description: params.description ?? `Subscription payment — ${params.plan} plan`,
    paidAt: new Date(),
  });

  await writeAuditLog("INVOICE_CREATED", "system", params.schoolId, {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    amount: params.amount,
    plan: params.plan,
  });

  return invoice;
}

export async function createCreditNote(params: {
  schoolId: string;
  plan: string;
  amount: number;
  currency: string;
  description: string;
}) {
  assertSchoolScope(params.schoolId);

  return createImmutableInvoice(prisma, {
    schoolId: params.schoolId,
    plan: params.plan,
    amount: -params.amount,
    currency: params.currency,
    status: "credit",
    periodStart: null,
    periodEnd: null,
    description: params.description,
  });
}

export async function getInvoicesBySchool(schoolId: string, limit = 50) {
  assertSchoolScope(schoolId);

  return prisma.invoice.findMany({
    where: { schoolId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getInvoiceById(invoiceId: string, schoolId?: string) {
  if (schoolId !== undefined) {
    assertSchoolScope(schoolId);
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return null;
  if (schoolId && invoice.schoolId !== schoolId) return null;
  return invoice;
}
