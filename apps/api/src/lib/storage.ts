import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp, { type OutputInfo } from "sharp";
import { del, put } from "@vercel/blob";
import { env } from "../config/env";
import { badRequest } from "./errors";

export const LOCAL_UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const MAX_DIMENSION = 1600;

export interface StoredImage {
  url: string;
  width: number;
  height: number;
}

/**
 * Validates and normalises an uploaded image, then stores it.
 * Re-encoding through sharp means we never serve the user's original bytes:
 * it rejects non-images regardless of the declared MIME type, strips EXIF/GPS metadata,
 * applies EXIF orientation and caps the resolution (fast loads for millions of reads).
 */
export async function storeImage(buffer: Buffer): Promise<StoredImage> {
  let output: { data: Buffer; info: OutputInfo };
  try {
    output = await sharp(buffer, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw badRequest("The uploaded file is not a valid image");
  }

  const name = `posts/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.webp`;

  if (env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(name, output.data, {
      access: "public",
      contentType: "image/webp",
      cacheControlMaxAge: 31_536_000, // file names are unique => cache forever
      token: env.BLOB_READ_WRITE_TOKEN,
    });
    return { url: blob.url, width: output.info.width, height: output.info.height };
  }

  const filePath = path.join(LOCAL_UPLOAD_DIR, name);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, output.data);
  return { url: `/uploads/${name}`, width: output.info.width, height: output.info.height };
}

export async function deleteImage(url: string | null | undefined) {
  if (!url) return;
  try {
    if (url.startsWith("/uploads/")) {
      const filePath = path.join(LOCAL_UPLOAD_DIR, url.slice("/uploads/".length));
      if (filePath.startsWith(LOCAL_UPLOAD_DIR)) await fs.unlink(filePath);
    } else if (env.BLOB_READ_WRITE_TOKEN && url.includes(".blob.vercel-storage.com/")) {
      await del(url, { token: env.BLOB_READ_WRITE_TOKEN });
    }
  } catch (err) {
    // Orphaned files are harmless; never fail the request because of cleanup.
    console.warn("Failed to delete image", url, err);
  }
}
