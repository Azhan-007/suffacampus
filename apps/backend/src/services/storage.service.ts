/**
 * File storage service using Firebase Cloud Storage.
 *
 * Handles:
 *  - Profile photo uploads (students, teachers)
 *  - Document uploads (PDFs, report cards, etc.)
 *  - Signed URL generation for secure downloads
 *  - File deletion and listing
 *
 * Files are stored with tenant-isolated paths: {schoolId}/{category}/{filename}
 */

import { storage } from "../lib/firebase-admin";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UploadResult {
  fileName: string;
  storagePath: string;
  publicUrl: string;
  contentType: string;
  size: number;
}

export interface FileInfo {
  name: string;
  storagePath: string;
  contentType?: string;
  size?: number;
  createdAt?: string;
  updatedAt?: string;
}

type FileCategory =
  | "photos"
  | "documents"
  | "reports"
  | "receipts"
  | "imports";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET ?? "";

/** Max file sizes per category (in bytes) */
const MAX_FILE_SIZES: Record<FileCategory, number> = {
  photos: 5 * 1024 * 1024, // 5MB
  documents: 25 * 1024 * 1024, // 25MB
  reports: 25 * 1024 * 1024, // 25MB
  receipts: 10 * 1024 * 1024, // 10MB
  imports: 50 * 1024 * 1024, // 50MB
};

/** Allowed MIME types per category */
const ALLOWED_TYPES: Record<FileCategory, string[]> = {
  photos: ["image/jpeg", "image/png", "image/webp"],
  documents: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
  ],
  reports: ["application/pdf", "image/jpeg", "image/png"],
  receipts: ["application/pdf", "image/jpeg", "image/png"],
  imports: [
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBucket() {
  if (!BUCKET_NAME) {
    throw new Error("FIREBASE_STORAGE_BUCKET environment variable is not set");
  }
  return storage.bucket(BUCKET_NAME);
}

/**
 * Generate a unique filename while preserving the extension.
 */
function generateFileName(originalName: string): string {
  const ext = originalName.includes(".")
    ? originalName.substring(originalName.lastIndexOf("."))
    : "";
  const hash = crypto.randomBytes(12).toString("hex");
  const timestamp = Date.now();
  return `${timestamp}_${hash}${ext}`;
}

/**
 * Build the storage path: {schoolId}/{category}/{filename}
 */
function buildStoragePath(
  schoolId: string,
  category: FileCategory,
  fileName: string
): string {
  return `${schoolId}/${category}/${fileName}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a file before upload.
 */
export function validateFile(
  category: FileCategory,
  contentType: string,
  size: number
): { valid: boolean; error?: string } {
  const maxSize = MAX_FILE_SIZES[category];
  if (size > maxSize) {
    return {
      valid: false,
      error: `File too large. Max size for ${category}: ${Math.round(maxSize / 1024 / 1024)}MB`,
    };
  }

  const allowedTypes = ALLOWED_TYPES[category];
  if (!allowedTypes.includes(contentType)) {
    return {
      valid: false,
      error: `Invalid file type '${contentType}'. Allowed: ${allowedTypes.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Upload a file buffer to Cloud Storage.
 */
export async function uploadFile(params: {
  schoolId: string;
  category: FileCategory;
  originalName: string;
  buffer: Buffer;
  contentType: string;
}): Promise<UploadResult> {
  const { schoolId, category, originalName, buffer, contentType } = params;

  // Validate
  const validation = validateFile(category, contentType, buffer.length);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const bucket = getBucket();
  const fileName = generateFileName(originalName);
  const storagePath = buildStoragePath(schoolId, category, fileName);
  const file = bucket.file(storagePath);

  // Upload with metadata
  await file.save(buffer, {
    metadata: {
      contentType,
      metadata: {
        schoolId,
        category,
        originalName,
        uploadedAt: new Date().toISOString(),
      },
    },
  });

  // Make publicly accessible (or use signed URLs for private files)
  await file.makePublic();

  const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${storagePath}`;

  return {
    fileName,
    storagePath,
    publicUrl,
    contentType,
    size: buffer.length,
  };
}

/**
 * Generate a signed URL for temporary access to a private file.
 */
export async function getSignedUrl(
  storagePath: string,
  expiresInMinutes = 60
): Promise<string> {
  const bucket = getBucket();
  const file = bucket.file(storagePath);

  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiresInMinutes * 60 * 1000,
  });

  return url;
}

/**
 * Delete a file from Cloud Storage.
 */
export async function deleteFile(storagePath: string): Promise<void> {
  const bucket = getBucket();
  const file = bucket.file(storagePath);

  const [exists] = await file.exists();
  if (exists) {
    await file.delete();
  }
}

/**
 * List files in a school/category directory.
 */
export async function listFiles(
  schoolId: string,
  category: FileCategory
): Promise<FileInfo[]> {
  const bucket = getBucket();
  const prefix = `${schoolId}/${category}/`;

  const [files] = await bucket.getFiles({ prefix });

  return files.map((f) => ({
    name: f.name.replace(prefix, ""),
    storagePath: f.name,
    contentType: f.metadata.contentType as string | undefined,
    size: f.metadata.size ? Number(f.metadata.size) : undefined,
    createdAt: f.metadata.timeCreated as string | undefined,
    updatedAt: f.metadata.updated as string | undefined,
  }));
}

/**
 * Calculate total storage usage for a school (in bytes).
 */
export async function getStorageUsage(schoolId: string): Promise<number> {
  const bucket = getBucket();
  const prefix = `${schoolId}/`;

  const [files] = await bucket.getFiles({ prefix });

  return files.reduce((total, f) => {
    return total + (f.metadata.size ? Number(f.metadata.size) : 0);
  }, 0);
}
