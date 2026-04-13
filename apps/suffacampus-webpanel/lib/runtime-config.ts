const DEFAULT_TESTING_API_URL = "https://suffacampus-backend-new.onrender.com/api/v1";

function normalizeApiUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function getPublicApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured && configured.trim().length > 0) {
    return normalizeApiUrl(configured);
  }

  return DEFAULT_TESTING_API_URL;
}

export const PUBLIC_API_URL = getPublicApiUrl();
