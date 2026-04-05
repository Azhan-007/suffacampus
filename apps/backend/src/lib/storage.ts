import { storage } from "./firebase-admin";

// ---------------------------------------------------------------------------
// Storage path catalogue
// ---------------------------------------------------------------------------
// ALL files MUST live under schools/{schoolId}/ — never at the bucket root.
// Add new categories here as features are introduced; never construct paths
// ad-hoc in route handlers.
// ---------------------------------------------------------------------------

export const StorageCategory = {
  ASSIGNMENTS: "assignments",
  RESULTS: "results",
  PROFILE_PHOTOS: "profile-photos",
  DOCUMENTS: "documents",
} as const;

export type StorageCategory = (typeof StorageCategory)[keyof typeof StorageCategory];

// ---------------------------------------------------------------------------
// Path builder — the single source of truth for storage paths
// ---------------------------------------------------------------------------

/**
 * Build a tenant-scoped storage path.
 *
 * Pattern: `schools/{schoolId}/{category}/{fileName}`
 *
 * @example
 * getStoragePath("school_abc", StorageCategory.ASSIGNMENTS, "homework-01.pdf")
 * // → "schools/school_abc/assignments/homework-01.pdf"
 *
 * This function is the ONLY way storage paths should be constructed in this
 * codebase. Never interpolate paths manually in route handlers — doing so
 * would bypass the tenant-isolation guarantee.
 */
export function getStoragePath(
  schoolId: string,
  category: StorageCategory,
  fileName: string
): string {
  if (!schoolId || !fileName) {
    throw new Error("schoolId and fileName are required to build a storage path");
  }

  // Sanitize: strip any leading slashes or directory traversal attempts
  const safeName = fileName.replace(/^[./\\]+/, "").replace(/\.\./g, "");

  if (!safeName) {
    throw new Error("fileName resolves to an empty string after sanitization");
  }

  return `schools/${schoolId}/${category}/${safeName}`;
}

// ---------------------------------------------------------------------------
// Bucket reference helper
// ---------------------------------------------------------------------------

/**
 * Get the default Firebase Storage bucket.
 * Uses FIREBASE_STORAGE_BUCKET env var if set, otherwise the project default.
 */
export function getBucket() {
  return storage.bucket();
}

// ---------------------------------------------------------------------------
// Upload helper (ready to use when file routes are added)
// ---------------------------------------------------------------------------

export interface UploadOptions {
  schoolId: string;
  category: StorageCategory;
  fileName: string;
  fileBuffer: Buffer;
  contentType: string;
}

export interface UploadResult {
  /** The full GCS object path (e.g. schools/abc/assignments/hw.pdf) */
  storagePath: string;
  /** The bucket name */
  bucket: string;
  /** A signed download URL valid for 7 days */
  downloadUrl: string;
}

/**
 * Upload a file to tenant-scoped storage and return a signed download URL.
 *
 * Usage (when file routes are implemented):
 * ```typescript
 * const result = await uploadFile({
 *   schoolId: request.schoolId,
 *   category: StorageCategory.ASSIGNMENTS,
 *   fileName: "homework-01.pdf",
 *   fileBuffer: buffer,
 *   contentType: "application/pdf",
 * });
 * ```
 */
export async function uploadFile(options: UploadOptions): Promise<UploadResult> {
  const { schoolId, category, fileName, fileBuffer, contentType } = options;

  const storagePath = getStoragePath(schoolId, category, fileName);
  const bucket = getBucket();
  const file = bucket.file(storagePath);

  await file.save(fileBuffer, {
    metadata: { contentType },
    resumable: false,
  });

  // Signed URL valid for 7 days
  const [downloadUrl] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  return {
    storagePath,
    bucket: bucket.name,
    downloadUrl,
  };
}

/**
 * Delete a file from tenant-scoped storage.
 * Validates that the path starts with schools/{schoolId}/ before deleting.
 */
export async function deleteFile(schoolId: string, storagePath: string): Promise<void> {
  const expectedPrefix = `schools/${schoolId}/`;

  if (!storagePath.startsWith(expectedPrefix)) {
    throw new Error(
      `Storage path "${storagePath}" does not belong to school "${schoolId}". ` +
        "Cross-tenant storage access is not allowed."
    );
  }

  const bucket = getBucket();
  await bucket.file(storagePath).delete();
}
