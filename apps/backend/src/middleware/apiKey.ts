/**
 * API key authentication for inter-service and machine-to-machine calls.
 *
 * Usage:
 *   - Set API_KEYS env var as comma-separated list: "key1:name1,key2:name2"
 *   - Clients send the key in the `X-API-Key` header
 *   - Use `apiKeyAuth` as a preHandler to protect internal endpoints
 *
 * This is separate from Firebase Auth and is for server-to-server calls,
 * webhooks from third-party services (beyond Razorpay), or admin CLI tools.
 */

import type { FastifyRequest, FastifyReply } from "fastify";

interface ApiKeyEntry {
  key: string;
  name: string;
}

let cachedKeys: ApiKeyEntry[] | null = null;

function getApiKeys(): ApiKeyEntry[] {
  if (cachedKeys) return cachedKeys;

  const raw = process.env.API_KEYS ?? "";
  if (!raw) {
    cachedKeys = [];
    return cachedKeys;
  }

  cachedKeys = raw.split(",").map((entry) => {
    const [key, name] = entry.trim().split(":");
    return { key: key.trim(), name: (name ?? "unnamed").trim() };
  });

  return cachedKeys;
}

/**
 * Validate an API key. Returns the key entry if valid, null otherwise.
 */
export function validateApiKey(key: string): ApiKeyEntry | null {
  const keys = getApiKeys();
  return keys.find((k) => k.key === key) ?? null;
}

/**
 * Fastify preHandler that requires a valid API key in the X-API-Key header.
 */
export async function apiKeyAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers["x-api-key"];

  if (!apiKey || typeof apiKey !== "string") {
    return reply.status(401).send({
      success: false,
      error: {
        code: "API_KEY_MISSING",
        message: "X-API-Key header is required",
      },
    });
  }

  const entry = validateApiKey(apiKey);

  if (!entry) {
    request.log.warn({ apiKey: apiKey.slice(0, 8) + "..." }, "Invalid API key attempt");
    return reply.status(403).send({
      success: false,
      error: {
        code: "API_KEY_INVALID",
        message: "Invalid API key",
      },
    });
  }

  // Attach the API key info to the request for auditing
  request.apiKeyName = entry.name;
  request.log.info({ apiKeyName: entry.name }, "API key authenticated");
}

/**
 * Reset the cached API keys (for testing or key rotation).
 */
export function resetApiKeyCache(): void {
  cachedKeys = null;
}
