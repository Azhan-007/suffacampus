/**
 * uploadService.ts
 *
 * Backend routes:
 *   POST /uploads   — multipart file upload, returns { fileUrl: string }
 *
 * Replaces firebase/storage usage.
 */

import { auth } from "../firebase";
import { BASE_URL, fetchWithTimeout } from "./api";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UploadResult {
  fileUrl: string;
  fileName: string;
}

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Upload a file to the backend storage endpoint.
 * @param uri  The local URI of the file (from document picker / image picker).
 * @param name The desired file name on the server.
 * @param mimeType The MIME type, e.g. "application/pdf".
 */
export async function uploadFile(
  uri: string,
  name: string,
  mimeType: string
): Promise<UploadResult> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");

  const token = await user.getIdToken();

  const formData = new FormData();
  (formData as any).append("file", { uri, name, type: mimeType } as any);
  (formData as any).append("fileName", name);

  const response = await fetchWithTimeout(`${BASE_URL}/uploads/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      // Do NOT set Content-Type — let fetch set multipart boundary automatically
    },
    body: formData,
  }, 60_000); // 60s timeout for uploads

  if (!response.ok) {
    let message = `Upload failed (${response.status})`;
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const body = await response.json();
  const result = (body?.data ?? body) as UploadResult;
  return result;
}
