import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { del, put } from "@vercel/blob";
import { env } from "../config/env";
import { badRequest } from "./errors";

export const LOCAL_UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const MAX_DIMENSION = 2048;
const MAX_INPUT_PIXELS = 50_000_000;

export interface StoredImage {
  url: string;
  width: number;
  height: number;
}

/**
 * Cheap synchronous check done inside the upload request: sharp parses only the header,
 * so non-images (whatever their MIME type) and decompression bombs are rejected
 * immediately, and we learn the display size so the UI can reserve space while the
 * background job does the expensive work.
 */
export async function inspectImage(buffer: Buffer): Promise<{ width: number; height: number }> {
  try {
    const meta = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.width || !meta.height || !meta.format) throw new Error("no dimensions");
    if (meta.width * meta.height > MAX_INPUT_PIXELS) throw new Error("too many pixels");
    // EXIF orientations 5-8 are rotated by 90 degrees.
    const rotated = (meta.orientation ?? 1) >= 5;
    const w = rotated ? meta.height : meta.width;
    const h = rotated ? meta.width : meta.height;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h));
    return { width: Math.round(w * scale), height: Math.round(h * scale) };
  } catch {
    throw badRequest("The uploaded file is not a valid image");
  }
}

/**
 * The expensive part, run by the background job. Re-encoding means we never serve the
 * user's original bytes: EXIF/GPS metadata is stripped, orientation applied and the
 * resolution capped. Also renders a ~20px blurred placeholder for instant paint.
 */
export async function processImage(buffer: Buffer) {
  const base = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  const [main, tiny] = await Promise.all([
    base
      .clone()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true }),
    base.clone().resize(20, 20, { fit: "inside" }).webp({ quality: 40 }).toBuffer(),
  ]);
  return {
    data: main.data,
    width: main.info.width,
    height: main.info.height,
    blur: `data:image/webp;base64,${tiny.toString("base64")}`,
  };
}

/** Stores a processed WebP under a unique, immutable name (Vercel Blob or local disk). */
export async function putImage(data: Buffer): Promise<string> {
  const name = `posts/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.webp`;
  if (env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(name, data, {
      access: "public",
      contentType: "image/webp",
      cacheControlMaxAge: 31_536_000, // file names are unique => cache forever
      token: env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url;
  }
  const filePath = path.join(LOCAL_UPLOAD_DIR, name);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
  return `/uploads/${name}`;
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
