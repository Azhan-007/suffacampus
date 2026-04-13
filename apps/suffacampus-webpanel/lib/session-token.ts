const SESSION_TOKEN_STORAGE_KEY = 'SuffaCampus-session-access-token';

type JwtPayloadLike = {
  exp?: number;
};

function parseJwtPayload(token: string): JwtPayloadLike | null {
  try {
    const [, payloadSegment] = token.split('.');
    if (!payloadSegment) return null;

    const padded = payloadSegment.padEnd(
      payloadSegment.length + ((4 - (payloadSegment.length % 4)) % 4),
      '='
    );
    const normalized = padded.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(normalized);
    const parsed = JSON.parse(json) as JwtPayloadLike;
    return parsed;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return false;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp <= nowSeconds;
}

export function setSessionAccessToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, token);
}

export function getSessionAccessToken(): string | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
  if (!token) return null;

  if (isExpired(token)) {
    localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    return null;
  }

  return token;
}

export function clearSessionAccessToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
}
