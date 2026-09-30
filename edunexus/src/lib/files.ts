import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

// Secure upload handling (SRS §12): validated MIME types, size limits, random
// renamed storage outside the public web root.

const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

export function getAllowedMimeTypes(): string[] {
  return Object.keys(ALLOWED_MIME);
}

export function maxUploadBytes(): number {
  return Number(process.env.MAX_UPLOAD_MB ?? 5) * 1024 * 1024;
}

export interface StoredFile {
  storedFileName: string;
  storagePath: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
}

export async function storeUpload(file: File): Promise<StoredFile> {
  const ext = ALLOWED_MIME[file.type];
  if (!ext) {
    throw new Error(`Unsupported file type "${file.type}". Allowed: PDF, JPG, PNG`);
  }
  if (file.size <= 0) throw new Error("File is empty");
  if (file.size > maxUploadBytes()) {
    throw new Error(`File exceeds the ${process.env.MAX_UPLOAD_MB ?? 5}MB limit`);
  }

  const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./storage/uploads");
  await mkdir(uploadDir, { recursive: true });

  const storedFileName = `${Date.now()}-${crypto.randomBytes(12).toString("hex")}${ext}`;
  const absPath = path.join(uploadDir, storedFileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absPath, buffer);

  return {
    storedFileName,
    storagePath: absPath,
    originalFileName: file.name,
    mimeType: file.type,
    fileSize: file.size,
  };
}
