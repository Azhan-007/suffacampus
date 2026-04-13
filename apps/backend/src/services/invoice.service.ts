import { prisma } from "../lib/prisma";
import { writeAuditLog } from "./audit.service";
import { assertSchoolScope } from "../lib/tenant-scope";
import { dateTimeFrom } from "../utils/safe-fields";
import { Errors } from "../errors";

async function generateInvoiceNumber(schoolId: string): Promise<string> {
  assertSchoolScope(schoolId);

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  const schoolCode = school?.code ?? schoolId.slice(0, 6).toUpperCase();

  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  const count = await prisma.invoice.count({
    where: {
      schoolId,
      invoiceNumber: { startsWith: `INV-${schoolCode}-${yearMonth}` },
    },
  });

  const seq = count + 1;
  return `INV-${schoolCode}-${yearMonth}-${String(seq).padStart(3, "0")}`;
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

  const invoiceNumber = await generateInvoiceNumber(params.schoolId);

  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber,
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
    },
  });

  await writeAuditLog("INVOICE_CREATED", "system", params.schoolId, {
    invoiceId: invoice.id,
    invoiceNumber,
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

  const invoiceNumber = await generateInvoiceNumber(params.schoolId);

  return prisma.invoice.create({
    data: {
      invoiceNumber,
      schoolId: params.schoolId,
      plan: params.plan,
      amount: -params.amount,
      currency: params.currency,
      status: "credit",
      periodStart: null,
      periodEnd: null,
      description: params.description,
    },
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
