import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createBookSchema,
  updateBookSchema,
  libraryTransactionSchema,
} from "../../schemas/modules.schema";
import { paginationSchema } from "../../utils/pagination";
import {
  createBook,
  getBooksBySchool,
  getBookById,
  updateBook,
  softDeleteBook,
  issueBook,
  returnBook,
  getTransactionsBySchool,
  getLibraryStats,
} from "../../services/library.service";
import { authenticate } from "../../middleware/auth";
import { tenantGuard } from "../../middleware/tenant";
import { roleMiddleware } from "../../middleware/role";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { Errors } from "../../errors";

const preHandler = [authenticate, tenantGuard];

export default async function libraryRoutes(server: FastifyInstance) {
  // POST /library/books
  server.post(
    "/library/books",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = createBookSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);

      const book = await createBook(request.schoolId, result.data, request.user.uid);
      return sendSuccess(request, reply, book, 201);
    }
  );

  // GET /library/books (paginated, filterable)
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/library/books",
    { preHandler },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = {
        category: request.query.category,
        search: request.query.search,
      };

      const result = await getBooksBySchool(request.schoolId, pagination, filters);
      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );

  // GET /library/stats
  server.get(
    "/library/stats",
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const stats = await getLibraryStats(request.schoolId);
      return sendSuccess(request, reply, stats);
    }
  );

  // GET /library/books/:id
  server.get<{ Params: { id: string } }>(
    "/library/books/:id",
    { preHandler },
    async (request, reply) => {
      const book = await getBookById(request.params.id, request.schoolId);
      if (!book) throw Errors.notFound("Book", request.params.id);
      return sendSuccess(request, reply, book);
    }
  );

  // PATCH /library/books/:id
  server.patch<{ Params: { id: string } }>(
    "/library/books/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const result = updateBookSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);
      if (Object.keys(result.data).length === 0) throw Errors.badRequest("No fields to update");

      const book = await updateBook(request.params.id, request.schoolId, result.data, request.user.uid);
      return sendSuccess(request, reply, book);
    }
  );

  // DELETE /library/books/:id
  server.delete<{ Params: { id: string } }>(
    "/library/books/:id",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin"])] },
    async (request, reply) => {
      const deleted = await softDeleteBook(request.params.id, request.schoolId, request.user.uid);
      if (!deleted) throw Errors.notFound("Book", request.params.id);
      return sendSuccess(request, reply, { message: "Book deleted" });
    }
  );

  // POST /library/transactions — issue a book
  server.post(
    "/library/transactions",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = libraryTransactionSchema.safeParse(request.body);
      if (!result.success) throw Errors.validation(result.error.flatten().fieldErrors);

      const tx = await issueBook(request.schoolId, result.data, request.user.uid);
      return sendSuccess(request, reply, tx, 201);
    }
  );

  // PATCH /library/transactions/:id/return — return a book
  server.patch<{ Params: { id: string } }>(
    "/library/transactions/:id/return",
    { preHandler: [...preHandler, roleMiddleware(["Admin", "SuperAdmin", "Teacher"])] },
    async (request, reply) => {
      const body = request.body as { fine?: number } | undefined;
      const tx = await returnBook(request.params.id, request.schoolId, body?.fine, request.user.uid);
      return sendSuccess(request, reply, tx);
    }
  );

  // GET /library/transactions (paginated)
  server.get<{ Querystring: Record<string, string | undefined> }>(
    "/library/transactions",
    { preHandler },
    async (request, reply) => {
      const pagination = paginationSchema.parse(request.query);
      const filters = {
        studentId: request.query.studentId,
        bookId: request.query.bookId,
        status: request.query.status,
      };

      const result = await getTransactionsBySchool(request.schoolId, pagination, filters);
      return sendPaginated(request, reply, result.data, result.pagination);
    }
  );
}
