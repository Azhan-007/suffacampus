import { prisma } from "../lib/prisma";
import type {
  CreateBookInput,
  UpdateBookInput,
  LibraryTransactionInput,
} from "../schemas/modules.schema";
import { writeAuditLog } from "./audit.service";
import { Errors } from "../errors";

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

export async function createBook(
  schoolId: string,
  data: CreateBookInput,
  performedBy: string
) {
  const book = await prisma.book.create({
    data: {
      schoolId,
      title: data.title,
      author: data.author,
      category: data.category,
      isbn: data.isbn,
      totalCopies: data.totalCopies,
      availableCopies: data.availableCopies ?? data.totalCopies,
      issuedCount: 0,
      publishedYear: data.publishedYear,
      publisher: data.publisher,
      description: data.description,
      coverImageURL: data.coverImageURL,
      isActive: true,
    },
  });

  await writeAuditLog("CREATE_BOOK", performedBy, schoolId, {
    bookId: book.id,
    title: book.title,
    isbn: book.isbn,
  });

  return book;
}

export async function getBooksBySchool(
  schoolId: string,
  pagination: { limit?: number; cursor?: string; sortBy?: string; sortOrder?: "asc" | "desc" },
  filters: { category?: string; available?: boolean; search?: string } = {}
) {
  const where: any = { schoolId, isActive: true };
  if (filters.category) where.category = filters.category;
  if (filters.available) where.availableCopies = { gt: 0 };
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { author: { contains: filters.search, mode: "insensitive" } },
      { isbn: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  const limit = Math.min(pagination.limit ?? 20, 100);

  const books = await prisma.book.findMany({
    where,
    orderBy: { [pagination.sortBy ?? "createdAt"]: pagination.sortOrder ?? "desc" },
    take: limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const hasMore = books.length > limit;
  const data = hasMore ? books.slice(0, limit) : books;

  return {
    data,
    pagination: { cursor: data.length > 0 ? data[data.length - 1].id : null, hasMore, limit },
  };
}

export async function getBookById(bookId: string, schoolId: string) {
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book || book.schoolId !== schoolId || !book.isActive) return null;
  return book;
}

export async function updateBook(
  bookId: string,
  schoolId: string,
  data: UpdateBookInput,
  performedBy: string
) {
  const existing = await prisma.book.findUnique({ where: { id: bookId } });
  if (!existing) throw Errors.notFound("Book", bookId);
  if (existing.schoolId !== schoolId) throw Errors.tenantMismatch();
  if (!existing.isActive) throw Errors.notFound("Book", bookId);

  const updated = await prisma.book.update({ where: { id: bookId }, data });

  await writeAuditLog("UPDATE_BOOK", performedBy, schoolId, {
    bookId,
    updatedFields: Object.keys(data),
  });

  return updated;
}

export async function softDeleteBook(
  bookId: string,
  schoolId: string,
  performedBy: string
): Promise<boolean> {
  const existing = await prisma.book.findUnique({ where: { id: bookId } });
  if (!existing || existing.schoolId !== schoolId || !existing.isActive) return false;

  await prisma.book.update({ where: { id: bookId }, data: { isActive: false } });

  await writeAuditLog("DELETE_BOOK", performedBy, schoolId, { bookId, title: existing.title });
  return true;
}

// ---------------------------------------------------------------------------
// Transactions (issue / return)
// ---------------------------------------------------------------------------

export async function issueBook(
  schoolId: string,
  data: LibraryTransactionInput,
  performedBy: string
) {
  const book = await prisma.book.findUnique({ where: { id: data.bookId } });
  if (!book) throw Errors.notFound("Book", data.bookId);
  if (book.schoolId !== schoolId) throw Errors.tenantMismatch();
  if (book.availableCopies <= 0) throw Errors.conflict("No copies available for issue");

  // Use a transaction to atomically create record + update book counts
  const [transaction] = await prisma.$transaction([
    prisma.libraryTransaction.create({
      data: {
        schoolId,
        bookId: data.bookId,
        studentId: data.studentId,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        status: "Issued",
        issuedBy: performedBy,
      },
    }),
    prisma.book.update({
      where: { id: data.bookId },
      data: {
        availableCopies: { decrement: 1 },
        issuedCount: { increment: 1 },
      },
    }),
  ]);

  await writeAuditLog("ISSUE_BOOK", performedBy, schoolId, {
    transactionId: transaction.id,
    bookId: data.bookId,
    studentId: data.studentId,
  });

  return transaction;
}

export async function returnBook(
  transactionId: string,
  schoolId: string,
  fine: number | undefined,
  performedBy: string
) {
  const tx = await prisma.libraryTransaction.findUnique({ where: { id: transactionId } });
  if (!tx) throw Errors.notFound("Transaction", transactionId);
  if (tx.schoolId !== schoolId) throw Errors.tenantMismatch();
  if (tx.status === "Returned") throw Errors.conflict("Book already returned");

  const [updated] = await prisma.$transaction([
    prisma.libraryTransaction.update({
      where: { id: transactionId },
      data: {
        status: "Returned",
        returnDate: new Date().toISOString(),
        ...(fine !== undefined ? { fine } : {}),
      },
    }),
    prisma.book.update({
      where: { id: tx.bookId },
      data: {
        availableCopies: { increment: 1 },
        issuedCount: { decrement: 1 },
      },
    }),
  ]);

  await writeAuditLog("RETURN_BOOK", performedBy, schoolId, {
    transactionId,
    bookId: tx.bookId,
    studentId: tx.studentId,
    fine,
  });

  return updated;
}

export async function getTransactionsBySchool(
  schoolId: string,
  pagination: { limit?: number; cursor?: string },
  filters: { bookId?: string; studentId?: string; status?: string } = {}
) {
  const where: any = { schoolId };
  if (filters.bookId) where.bookId = filters.bookId;
  if (filters.studentId) where.studentId = filters.studentId;
  if (filters.status) where.status = filters.status;

  const limit = Math.min(pagination.limit ?? 20, 100);

  const transactions = await prisma.libraryTransaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(pagination.cursor ? { cursor: { id: pagination.cursor }, skip: 1 } : {}),
  });

  const hasMore = transactions.length > limit;
  const data = hasMore ? transactions.slice(0, limit) : transactions;

  return {
    data,
    pagination: { cursor: data.length > 0 ? data[data.length - 1].id : null, hasMore, limit },
  };
}

export async function getLibraryStats(schoolId: string) {
  const [bookStats, categoryCounts] = await Promise.all([
    prisma.book.aggregate({
      where: { schoolId, isActive: true },
      _sum: { totalCopies: true, availableCopies: true, issuedCount: true },
      _count: true,
    }),
    prisma.book.groupBy({
      by: ["category"],
      where: { schoolId, isActive: true },
      _count: true,
    }),
  ]);

  const categories = Object.fromEntries(
    categoryCounts.map((c) => [c.category, c._count])
  );

  return {
    totalBooks: bookStats._count,
    totalCopies: bookStats._sum.totalCopies ?? 0,
    availableCopies: bookStats._sum.availableCopies ?? 0,
    issuedCopies: bookStats._sum.issuedCount ?? 0,
    categories,
  };
}
