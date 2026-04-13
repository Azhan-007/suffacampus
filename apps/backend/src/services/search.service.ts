/**
 * Full-text search service â€” PostgreSQL-native search.
 *
 * PostgreSQL natively supports `ILIKE` and `contains` filters, eliminating
 * the need for the Firestore trigram search index. For production at scale,
 * switch to PostgreSQL full-text search (tsvector/tsquery) or Typesense.
 */

import { prisma } from "../lib/prisma";
import { Client as ElasticClient } from "@elastic/elasticsearch";
import { assertSchoolScope } from "../lib/tenant-scope";

export type SearchableEntity = "students" | "teachers" | "library";

export interface SearchResult {
  id: string;
  entity: SearchableEntity;
  name: string;
  subtitle: string;
  score: number;
  data: Record<string, unknown>;
}

export interface SearchOptions {
  schoolId: string;
  query: string;
  entities?: SearchableEntity[];
  limit?: number;
}

const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL;
const ELASTICSEARCH_INDEX = process.env.ELASTICSEARCH_INDEX || "SuffaCampus-search";

let elasticClient: ElasticClient | null = null;

export async function getSearchBackendStatus(): Promise<{
  backend: "postgres" | "elasticsearch";
  status: "healthy" | "degraded" | "unhealthy";
  error?: string;
}> {
  const client = getElasticClient();
  if (!client) {
    return {
      backend: "postgres",
      status: "degraded",
      error: "ELASTICSEARCH_URL not configured; using PostgreSQL fallback",
    };
  }

  try {
    await client.ping();
    return {
      backend: "elasticsearch",
      status: "healthy",
    };
  } catch (error) {
    return {
      backend: "elasticsearch",
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Elasticsearch ping failed",
    };
  }
}

function getElasticClient(): ElasticClient | null {
  if (!ELASTICSEARCH_URL) {
    return null;
  }

  if (!elasticClient) {
    elasticClient = new ElasticClient({ node: ELASTICSEARCH_URL });
  }

  return elasticClient;
}

function toElasticDocument(result: SearchResult & { schoolId: string }): Record<string, unknown> {
  return {
    id: result.id,
    entity: result.entity,
    schoolId: result.schoolId,
    name: result.name,
    subtitle: result.subtitle,
    searchText: `${result.name} ${result.subtitle}`,
    data: result.data,
  };
}

async function searchWithPostgres(options: SearchOptions): Promise<SearchResult[]> {
  const { schoolId, query, entities, limit } = options;
  assertSchoolScope(schoolId);

  const searchEntities = entities ?? ["students", "teachers", "library"];
  const results: SearchResult[] = [];

  // Parallel search across all requested entities
  const searches = searchEntities.map(async (entity) => {
    switch (entity) {
      case "students": {
        const students = await prisma.student.findMany({
          where: {
            schoolId,
            isDeleted: false,
            OR: [
              { firstName: { contains: query, mode: "insensitive" } },
              { lastName: { contains: query, mode: "insensitive" } },
              { rollNumber: { contains: query, mode: "insensitive" } },
              { guardianName: { contains: query, mode: "insensitive" } },
            ],
          },
          take: limit,
        });

        for (const s of students) {
          const name = `${s.firstName} ${s.lastName}`;
          results.push({
            id: s.id,
            entity: "students",
            name,
            subtitle: `Class ${s.classId ?? ""} â€¢ Roll ${s.rollNumber ?? ""}`.trim(),
            score: name.toLowerCase().startsWith(query.toLowerCase()) ? 10 : 5,
            data: s as any,
          });
        }
        break;
      }

      case "teachers": {
        const teachers = await prisma.teacher.findMany({
          where: {
            schoolId,
            isDeleted: false,
            OR: [
              { firstName: { contains: query, mode: "insensitive" } },
              { lastName: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
              { department: { contains: query, mode: "insensitive" } },
            ],
          },
          take: limit,
        });

        for (const t of teachers) {
          const name = `${t.firstName} ${t.lastName}`;
          results.push({
            id: t.id,
            entity: "teachers",
            name,
            subtitle: t.department ?? "Teacher",
            score: name.toLowerCase().startsWith(query.toLowerCase()) ? 10 : 5,
            data: t as any,
          });
        }
        break;
      }

      case "library": {
        const books = await prisma.book.findMany({
          where: {
            schoolId,
            isActive: true,
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { author: { contains: query, mode: "insensitive" } },
              { isbn: { contains: query, mode: "insensitive" } },
            ],
          },
          take: limit,
        });

        for (const b of books) {
          results.push({
            id: b.id,
            entity: "library",
            name: b.title,
            subtitle: b.author || b.category || "Book",
            score: b.title.toLowerCase().startsWith(query.toLowerCase()) ? 10 : 5,
            data: b as any,
          });
        }
        break;
      }
    }
  });

  await Promise.all(searches);

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });

  return results.slice(0, limit);
}

async function searchWithElasticsearch(options: SearchOptions): Promise<SearchResult[]> {
  const client = getElasticClient();
  if (!client) {
    return searchWithPostgres(options);
  }

  const { schoolId, query, entities, limit } = options;
  assertSchoolScope(schoolId);

  const entityFilter = entities && entities.length > 0 ? entities : undefined;

  const response = await client.search({
    index: ELASTICSEARCH_INDEX,
    size: limit,
    query: {
      bool: {
        filter: [
          { term: { schoolId } },
          ...(entityFilter ? [{ terms: { entity: entityFilter } }] : []),
        ],
        must: [
          {
            multi_match: {
              query,
              fields: ["name^3", "subtitle^2", "searchText"],
              fuzziness: "AUTO",
            },
          },
        ],
      },
    },
  });

  const hits = (response.hits.hits || []) as Array<{ _score?: number; _source?: Record<string, unknown> }>;

  return hits
    .map((hit) => {
      const source = hit._source || {};
      const entity = source.entity as SearchableEntity;
      if (entity !== "students" && entity !== "teachers" && entity !== "library") {
        return null;
      }

      return {
        id: String(source.id || ""),
        entity,
        name: String(source.name || ""),
        subtitle: String(source.subtitle || ""),
        score: typeof hit._score === "number" ? hit._score : 0,
        data: (source.data as Record<string, unknown>) || {},
      } satisfies SearchResult;
    })
    .filter((item): item is SearchResult => item !== null);
}

/**
 * Search across students, teachers, and library books using PostgreSQL ILIKE.
 * No external search index required â€” queries go directly to the source tables.
 */
export async function search(options: SearchOptions): Promise<SearchResult[]> {
  const { schoolId, query: rawQuery, entities, limit = 20 } = options;
  assertSchoolScope(schoolId);

  const query = rawQuery.trim();
  if (!query || query.length < 1) return [];

  try {
    return await searchWithElasticsearch({ schoolId, query, entities, limit });
  } catch {
    // Fallback keeps search available even when Elasticsearch is down.
    return searchWithPostgres({ schoolId, query, entities, limit });
  }
}

/**
 * Index/reindex are no-ops with PostgreSQL â€” search goes directly to source tables.
 */
export async function indexDocument(
  _entity: SearchableEntity,
  _docId: string,
  _schoolId: string,
  _data: Record<string, unknown>
): Promise<void> {
  // No-op â€” PostgreSQL handles search natively
}

export async function removeFromIndex(
  _entity: SearchableEntity,
  _docId: string
): Promise<void> {
  // No-op
}

export async function reindexEntity(
  entity: SearchableEntity,
  schoolId: string
): Promise<number> {
  assertSchoolScope(schoolId);

  const client = getElasticClient();
  if (!client) {
    return 0;
  }

  await client.indices.create({ index: ELASTICSEARCH_INDEX }, { ignore: [400] });

  try {
    await client.deleteByQuery({
      index: ELASTICSEARCH_INDEX,
      query: {
        bool: {
          filter: [{ term: { schoolId } }, { term: { entity } }],
        },
      },
      refresh: true,
    });
  } catch {
    // Ignore cleanup failures; bulk reindex below still attempts fresh writes.
  }

  let records: SearchResult[] = [];

  if (entity === "students") {
    const students = await prisma.student.findMany({
      where: { schoolId, isDeleted: false },
      take: 10_000,
    });

    records = students.map((s) => ({
      id: s.id,
      entity: "students",
      name: `${s.firstName} ${s.lastName}`.trim(),
      subtitle: `Class ${s.classId ?? ""} â€¢ Roll ${s.rollNumber ?? ""}`.trim(),
      score: 0,
      data: s as any,
    }));
  }

  if (entity === "teachers") {
    const teachers = await prisma.teacher.findMany({
      where: { schoolId, isDeleted: false },
      take: 10_000,
    });

    records = teachers.map((t) => ({
      id: t.id,
      entity: "teachers",
      name: `${t.firstName} ${t.lastName}`.trim(),
      subtitle: t.department ?? "Teacher",
      score: 0,
      data: t as any,
    }));
  }

  if (entity === "library") {
    const books = await prisma.book.findMany({
      where: { schoolId, isActive: true },
      take: 10_000,
    });

    records = books.map((b) => ({
      id: b.id,
      entity: "library",
      name: b.title,
      subtitle: b.author || b.category || "Book",
      score: 0,
      data: b as any,
    }));
  }

  if (records.length === 0) {
    return 0;
  }

  const operations = records.flatMap((item) => [
    {
      index: {
        _index: ELASTICSEARCH_INDEX,
        _id: `${item.entity}:${item.id}`,
      },
    },
    toElasticDocument({ ...item, schoolId }),
  ]);

  await client.bulk({ operations, refresh: true });

  return records.length;
}

