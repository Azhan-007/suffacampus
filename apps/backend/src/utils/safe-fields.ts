import { Prisma } from "@prisma/client";

const ZERO_MONEY = new Prisma.Decimal(0);

type MoneyLike = Prisma.Decimal | number | string | null | undefined;
type DateLike = Date | string | null | undefined;

function parseMoney(value: MoneyLike): Prisma.Decimal | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Prisma.Decimal) {
    return new Prisma.Decimal(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    return new Prisma.Decimal(value.toFixed(2));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const numericValue = Number(trimmed);
    if (!Number.isFinite(numericValue)) {
      return null;
    }

    return new Prisma.Decimal(numericValue.toFixed(2));
  }

  return null;
}

export function moneyFrom(
  value: MoneyLike,
  fallback?: MoneyLike
): Prisma.Decimal {
  return parseMoney(value) ?? parseMoney(fallback) ?? ZERO_MONEY;
}

export function moneyFromInput(value: number | string): Prisma.Decimal {
  return moneyFrom(value);
}

export function moneyToNumber(
  value: MoneyLike,
  fallback?: MoneyLike
): number {
  return Number(moneyFrom(value, fallback).toFixed(2));
}

export function formatMoneyInr(
  value: MoneyLike,
  fallback?: MoneyLike
): string {
  return moneyToNumber(value, fallback).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function dateTimeFrom(
  value: DateLike,
  fallback?: DateLike
): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  const candidate = typeof value === "string" ? value : typeof fallback === "string" ? fallback : null;
  if (!candidate) {
    if (fallback instanceof Date && !Number.isNaN(fallback.getTime())) {
      return fallback;
    }
    return null;
  }

  const trimmed = candidate.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T00:00:00.000Z`
    : trimmed;

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function dateOnlyStringFrom(
  value: DateLike,
  fallback?: DateLike
): string {
  const resolved = dateTimeFrom(value, fallback);
  return resolved ? resolved.toISOString().split("T")[0] : "";
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
